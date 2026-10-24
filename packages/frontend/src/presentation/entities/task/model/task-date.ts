import { type Task, dateKey } from '#application';

export function taskDateTone(
  task: Pick<Task, 'date' | 'completedAt' | 'deleted'>,
  today = dateKey(),
) {
  if (!task.date) {
    return 'unset';
  }
  if (task.completedAt || task.deleted) {
    return 'neutral';
  }
  return task.date < today ? 'overdue' : task.date === today ? 'today' : 'neutral';
}
