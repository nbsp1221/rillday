import * as Automerge from '@automerge/automerge';
import {
  type Workspace,
  type WorkspaceProblem,
  canonical,
  compareWorkspaceReviewChoices,
  hash,
  inspectWorkspace,
  proposeWorkspaceReview,
  recordQuantity,
} from '@repo/domain';
import invariant from 'tiny-invariant';
import type { DocumentConflict, WorkspaceDocument } from './workspace-document.ts';
import { documentConflicts, readWorkspace } from './workspace-document.ts';

export interface SemanticReview {
  id: string;
  version: string;
  problems: WorkspaceProblem[];
  options: { id: string; workspace: Workspace }[];
}

export interface WorkspaceInspection {
  workspace: Workspace;
  conflicts: DocumentConflict[];
  semantic: SemanticReview | undefined;
}

const semanticProblems = (workspace: Workspace) =>
  inspectWorkspace(workspace).filter((problem) => !problem.code.startsWith('quantity_'));

const documentVersion = (doc: Automerge.Doc<WorkspaceDocument>) =>
  hash(canonical(Automerge.getHeads(doc)));

function historicalDocument(doc: Automerge.Doc<WorkspaceDocument>, head: string) {
  const fork = Automerge.clone(Automerge.view(doc, [head]));
  try {
    // Cloned nested objects retain source handles; reload isolates conflict lookup too.
    return Automerge.load<WorkspaceDocument>(Automerge.save(fork));
  } finally {
    Automerge.free(fork);
  }
}

export function quantityPreview(workspace: Workspace, conflicts: DocumentConflict[]) {
  if (!conflicts.some((conflict) => conflict.field === '$quantity')) {
    return workspace;
  }
  const result = structuredClone(workspace);
  for (const conflict of conflicts) {
    const checkIn = result.checkIns[conflict.target.id];
    const first = conflict.options[0];
    if (conflict.field === '$quantity' && first && checkIn) {
      checkIn.quantity = recordQuantity(Number(first.value), 'review:' + conflict.target.id);
    }
  }
  return result;
}

export function inspectDocument(
  doc: Automerge.Doc<WorkspaceDocument>,
  previous?: Workspace,
): WorkspaceInspection {
  const incoming = readWorkspace(doc);
  const conflicts = documentConflicts(doc, incoming);
  const problems = semanticProblems(incoming);
  if (!problems.length) {
    return { workspace: quantityPreview(incoming, conflicts), conflicts, semantic: undefined };
  }

  const metadata = new Map(
    Automerge.getChangesMetaSince(doc, []).map((change) => [change.hash, change]),
  );
  const pending = [...Automerge.getHeads(doc)].sort();
  const visited = new Set<string>();
  const unique = new Set<string>();
  const options: SemanticReview['options'] = [];
  for (const head of pending) {
    if (visited.has(head)) {
      continue;
    }
    visited.add(head);
    let proposal: Workspace | undefined;
    const historicalDoc = historicalDocument(doc, head);
    try {
      const historical = readWorkspace(historicalDoc);
      proposal = proposeWorkspaceReview(incoming, historical, problems);
    } catch {
      // Initialization changes may precede the first complete product workspace.
    } finally {
      Automerge.free(historicalDoc);
    }
    if (proposal && !semanticProblems(proposal).length) {
      const fingerprint = canonical(proposal);
      if (!unique.has(fingerprint)) {
        unique.add(fingerprint);
        options.push({ id: head, workspace: proposal });
      }
    } else {
      pending.push(...(metadata.get(head)?.deps ?? []));
    }
  }
  if (!options.length) {
    throw new Error('invalid_workspace');
  }

  options.sort(
    (left, right) =>
      compareWorkspaceReviewChoices(left.workspace, right.workspace, problems, previous) ||
      left.id.localeCompare(right.id),
  );
  const semantic = {
    id: 'semantic:' + hash(canonical(problems)),
    version: documentVersion(doc),
    problems,
    options,
  };
  invariant(options[0] !== undefined, 'Missing options[0]');
  return { workspace: quantityPreview(options[0].workspace, conflicts), conflicts, semantic };
}

export function selectSemanticReview(
  doc: Automerge.Doc<WorkspaceDocument>,
  review: SemanticReview,
  optionId: string,
): Workspace {
  if (documentVersion(doc) !== review.version) {
    throw new Error('edit_conflict');
  }
  const option = review.options.find((candidate) => candidate.id === optionId);
  if (!option || semanticProblems(option.workspace).length) {
    throw new Error('edit_conflict');
  }
  return option.workspace;
}
