import * as Automerge from '@automerge/automerge';
import {
  type Workspace,
  type WorkspaceTarget,
  canonical,
  hash,
  preservesWorkspaceReview,
  validateWorkspace,
} from '@repo/domain';
import invariant from 'tiny-invariant';
import type {
  WorkspaceDecision,
  WorkspaceRepository,
  WorkspaceRepositorySnapshot,
} from '../../application/workspace/repository.ts';
import type { DurableRepo } from './durable-repo.ts';
import type { DocumentConflict, WorkspaceDocument } from './workspace-document.ts';
import type { SemanticReview } from './workspace-review.ts';
import {
  readWorkspace,
  recordVersion,
  resolveDocumentConflict,
  writeWorkspace,
} from './workspace-document.ts';
import { inspectDocument, quantityPreview, selectSemanticReview } from './workspace-review.ts';

function conflictValue(workspace: Workspace, conflict: DocumentConflict): unknown {
  if (conflict.target.collection === 'workspace') {
    return workspace.matrixMode;
  }
  const record = workspace[conflict.target.collection][conflict.target.id];
  if (conflict.field === '$presence') {
    return Boolean(record);
  }
  if (!record) {
    return undefined;
  }
  if (conflict.field === '$quantity' && 'quantity' in record) {
    return record.quantity;
  }
  if (conflict.field === 'habitSchedule' && 'rules' in record) {
    return { startDate: record.startDate, rules: record.rules };
  }
  return Object.entries(record).find(([field]) => field === conflict.field)?.[1];
}

export class AutomergeWorkspaceRepository implements WorkspaceRepository {
  readonly id: string;
  private snapshot: WorkspaceRepositorySnapshot;
  private readonly listeners = new Set<() => void>();
  private readonly document: DurableRepo<WorkspaceDocument>;
  private readonly conflicts = new Map<string, DocumentConflict>();
  private semantic: SemanticReview | undefined;
  private closed = false;

  constructor(document: DurableRepo<WorkspaceDocument>) {
    this.document = document;
    this.id = document.handle.documentId;
    this.snapshot = this.inspect();
    document.handle.on('change', this.onChange);
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  version(target: WorkspaceTarget) {
    return recordVersion(this.document.handle.fullDoc(), target);
  }

  private inspect(previous?: Workspace): WorkspaceRepositorySnapshot {
    const doc = this.document.handle.fullDoc();
    const inspection = inspectDocument(doc, previous);
    this.conflicts.clear();
    const decisions: WorkspaceDecision[] = inspection.conflicts.map((conflict) => {
      const id = hash(canonical([conflict.id, conflict.version]));
      this.conflicts.set(id, conflict);
      return {
        id,
        code: 'edit_conflict',
        targets: [conflict.target],
        choices: conflict.options.map((option) => ({
          id: option.id,
          workspace: this.preview(conflict, option.id, inspection.workspace),
        })),
      };
    });
    this.semantic = inspection.semantic;
    if (inspection.semantic) {
      invariant(
        inspection.semantic.problems[0] !== undefined,
        'Missing inspection.semantic.problems[0]',
      );
      decisions.push({
        id: inspection.semantic.id + ':' + inspection.semantic.version,
        code: inspection.semantic.problems[0].code,
        targets: inspection.semantic.problems.flatMap((problem) => problem.targets),
        choices: inspection.semantic.options.map((option) => ({
          id: option.id,
          workspace: quantityPreview(option.workspace, inspection.conflicts),
        })),
      });
    }
    return {
      workspace: inspection.workspace,
      saved: this.document.saved,
      error: undefined,
      decisions,
    };
  }

  private preview(conflict: DocumentConflict, choice: string, previous: Workspace) {
    const copy = Automerge.load<WorkspaceDocument>(Automerge.save(this.document.handle.fullDoc()));
    try {
      const resolved = Automerge.change(copy, (draft) =>
        resolveDocumentConflict(draft, conflict, choice),
      );
      return inspectDocument(resolved, previous).workspace;
    } finally {
      Automerge.free(copy);
    }
  }

  private publish() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private readonly onChange = () => {
    this.snapshot = this.inspect(this.snapshot.workspace);
    this.publish();
    void this.observeSave(this.document.flush());
  };

  private async observeSave(write: Promise<void>) {
    try {
      await write;
      if (!this.closed) {
        this.snapshot = { ...this.snapshot, saved: this.document.saved, error: undefined };
        this.publish();
      }
    } catch (error) {
      if (!this.closed) {
        this.snapshot = { ...this.snapshot, saved: false, error };
        this.publish();
      }
    }
  }

  commit(workspace: Workspace) {
    validateWorkspace(workspace);
    const before = this.snapshot.workspace;
    if (
      this.semantic &&
      !preservesWorkspaceReview(
        readWorkspace(this.document.handle.fullDoc()),
        before,
        workspace,
        this.semantic.problems,
      )
    ) {
      throw new Error('edit_conflict');
    }
    for (const conflict of this.conflicts.values()) {
      if (
        canonical(conflictValue(before, conflict)) !== canonical(conflictValue(workspace, conflict))
      ) {
        throw new Error('edit_conflict');
      }
    }
    return this.document.change((draft) => writeWorkspace(draft, before, workspace));
  }

  resolve(decisionId: string, choiceId: string) {
    const conflict = this.conflicts.get(decisionId);
    if (conflict) {
      return this.document.change((draft) => resolveDocumentConflict(draft, conflict, choiceId));
    }
    const semantic = this.semantic;
    if (!semantic || decisionId !== semantic.id + ':' + semantic.version) {
      throw new Error('edit_conflict');
    }
    const doc = this.document.handle.fullDoc();
    const chosen = selectSemanticReview(doc, semantic, choiceId);
    const before = readWorkspace(doc);
    return this.document.change((draft) => writeWorkspace(draft, before, chosen));
  }

  flush() {
    return this.document.flush();
  }

  retrySave() {
    const write = this.document.retrySave();
    void this.observeSave(write);
    return write;
  }

  async close() {
    this.closed = true;
    try {
      await this.document.close();
    } finally {
      this.document.handle.off('change', this.onChange);
      this.listeners.clear();
    }
  }
}
