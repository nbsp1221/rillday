import {
  type DomainContext,
  type HabitRule,
  type HistoricalCheckIn,
  type Workspace,
  canonical,
  checkInId,
  createHabit,
  currentRule,
  hash,
  historicalCheckInIdentity,
  historicalHabitId,
  importCheckIns,
  quantityValue,
  validateWorkspace,
} from '@repo/domain';
import { generateKeyBetween } from 'fractional-indexing';
import { produce } from 'immer';
import type { WorkspaceRepository } from '../workspace/repository.ts';

export interface HabitImportGroup {
  key: string;
  name: string;
  kind?: 'boolean' | 'quantity';
  goal: number;
  unit: string;
  frequency?: 'daily';
  records: HistoricalCheckIn[];
  errors: { row: number; code: string }[];
  warnings: string[];
}

export interface HabitImportDraft {
  fingerprint: string;
  groups: HabitImportGroup[];
}

export interface HabitImportReader {
  read(
    input: { bytes: ArrayBuffer; name: string; source: 'ticktick' | 'rillday' },
    signal: AbortSignal,
  ): Promise<HabitImportDraft>;
}

export interface HabitImportChoice {
  key: string;
  targetId: string | null;
  kind: 'boolean' | 'quantity';
  frequency: 'daily' | 'weekly';
  weeklyTarget: number;
  confirmed: boolean;
  replaceDates: string[];
}

export interface HabitImportDay {
  group: string;
  date: string;
  action: 'add' | 'duplicate' | 'keep' | 'replace';
  incoming: HistoricalCheckIn;
  existing?: HistoricalCheckIn;
}

export interface HabitImportReview {
  workspaceId: string;
  token: string;
  draft: HabitImportDraft;
  choices: HabitImportChoice[];
  days: HabitImportDay[];
  habits: number;
}

export interface HabitImportPort {
  suggestTarget(draft: HabitImportDraft, key: string): string | null;
  review(draft: HabitImportDraft, choices: HabitImportChoice[]): HabitImportReview;
  apply(review: HabitImportReview): Promise<void>;
}

// Only a failed durable write after acceptance can retry without re-importing.
export class HabitImportPendingSave extends Error {
  constructor(cause: unknown) {
    super(
      cause instanceof Error && cause.name === 'QuotaExceededError'
        ? 'storage_full'
        : 'save_failed',
      { cause },
    );
    this.name = 'HabitImportPendingSave';
  }
}

function build(
  repository: WorkspaceRepository,
  draft: HabitImportDraft,
  choices: HabitImportChoice[],
  context: DomainContext,
  zone: string,
) {
  if (!choices.length || new Set(choices.map((c) => c.key)).size !== choices.length) {
    throw new Error('invalid_habit_import');
  }
  const current = repository.getSnapshot();
  if (current.decisions.length) {
    throw new Error('edit_conflict');
  }
  const days: HabitImportDay[] = [];
  const versions: string[] = [];
  const selected = new Set<string>();
  let habits = 0;
  const next = produce(current.workspace, (workspace) => {
    for (const choice of choices) {
      const group = draft.groups.find((g) => g.key === choice.key);
      if (!group || group.errors.length || !group.records.length || !choice.confirmed) {
        throw new Error('invalid_habit_import');
      }
      if (group.kind && choice.kind !== group.kind) {
        throw new Error('invalid_import_kind');
      }
      const targetId = choice.targetId ?? historicalHabitId(draft.fingerprint, group.key);
      if (selected.has(targetId)) {
        throw new Error('duplicate_import_target');
      }
      selected.add(targetId);
      versions.push(repository.version({ collection: 'habits', id: targetId }));
      let habit = workspace.habits[targetId];
      if (!habit) {
        if (choice.targetId) {
          throw new Error('import_target_missing');
        }
        const startDate = group.records.map((r) => r.date).sort()[0];
        if (!startDate) {
          throw new Error('invalid_habit_import');
        }
        const rule: HabitRule = {
          from: startDate,
          kind: choice.kind,
          goal: group.goal,
          unit: group.unit,
          step: 1,
          frequency: choice.frequency,
          weekdays: [],
          weeklyTarget: choice.weeklyTarget,
          intervalDays: 1,
        };
        const lastRank =
          Object.values(workspace.habits)
            .map((h) => h.rank)
            .sort()
            .at(-1) ?? null;
        createHabit(
          workspace,
          targetId,
          {
            name: group.name,
            color: '#7d9cc4',
            icon: 'circle',
            archived: false,
            startDate,
            rules: [rule],
            reminderTime: null,
            zone,
            rank: generateKeyBetween(lastRank, null),
          },
          context,
        );
        habit = workspace.habits[targetId];
        habits++;
      }
      if (!habit) {
        throw new Error('import_target_mismatch');
      }
      const accepted: { snapshot: HistoricalCheckIn; baseVersion: string }[] = [];
      for (const record of group.records) {
        const rule = currentRule(habit, record.date);
        if (rule.kind !== choice.kind || rule.unit !== record.unit) {
          throw new Error('import_target_mismatch');
        }
        const id = checkInId(targetId, record.date);
        const baseVersion = repository.version({ collection: 'checkIns', id });
        versions.push(baseVersion);
        const previous = current.workspace.checkIns[id];
        const existing: HistoricalCheckIn | undefined = previous
          ? {
              date: previous.date,
              value: quantityValue(previous.quantity),
              skipped: previous.skipped,
              goal: previous.goal,
              unit: previous.unit,
              note: previous.note,
              ...(previous.recordedAt ? { recordedAt: previous.recordedAt } : {}),
            }
          : undefined;
        const action = !existing
          ? 'add'
          : historicalCheckInIdentity(existing) === historicalCheckInIdentity(record)
            ? 'duplicate'
            : choice.replaceDates.includes(record.date)
              ? 'replace'
              : 'keep';
        days.push({
          group: group.key,
          date: record.date,
          action,
          incoming: record,
          ...(existing ? { existing } : {}),
        });
        if (action === 'add' || action === 'replace') {
          accepted.push({ snapshot: record, baseVersion });
        }
      }
      importCheckIns(workspace, targetId, accepted, context);
    }
    validateWorkspace(workspace);
  });
  return {
    next,
    days,
    habits,
    token: hash(canonical({ workspaceId: repository.id, draft, choices, versions, days, habits })),
  };
}

export function reviewHabitImport(
  repository: WorkspaceRepository,
  draft: HabitImportDraft,
  choices: HabitImportChoice[],
  context: DomainContext,
  zone: string,
): HabitImportReview {
  const { token, days, habits } = build(repository, draft, choices, context, zone);
  return { workspaceId: repository.id, token, draft, choices, days, habits };
}

export function acceptHabitImport(
  repository: WorkspaceRepository,
  review: HabitImportReview,
  context: DomainContext,
  zone: string,
): Workspace {
  if (review.workspaceId !== repository.id) {
    throw new Error('workspace_transition');
  }
  const result = build(repository, review.draft, review.choices, context, zone);
  if (result.token !== review.token) {
    throw new Error('import_review_changed');
  }
  return result.next;
}
