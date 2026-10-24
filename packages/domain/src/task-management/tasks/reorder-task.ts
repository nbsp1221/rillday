import type { DomainContext } from '../../shared-kernel/clock.ts';
import type { Workspace } from '../../workspace/workspace.ts';
import { Fault } from '../../shared-kernel/fault.ts';
import { rank as rankSchema } from '../../shared-kernel/values.ts';
import { requireTask } from './task-hierarchy.ts';

export function setTaskRank(
  workspace: Workspace,
  id: string,
  rank: string,
  context: DomainContext,
) {
  const parsed = rankSchema.safeParse(rank);
  if (!parsed.success) {
    throw new Fault('invalid_task');
  }
  const task = requireTask(workspace, id, true);
  if (task.rank !== parsed.data) {
    task.rank = parsed.data;
    task.updatedAt = context.now();
  }
}
