import type { Habit, Quadrant, Task, TaskList, WorkspaceData } from './workspace/model.ts';
import type { TaskPatch } from './workspace/task-policies.ts';

export type WorkspaceIntent =
  | { type: 'task.create'; tasks: Task[] }
  | { type: 'task.update'; id: string; patch: TaskPatch }
  | { type: 'task.reorder'; from: string; to: string; placement: 'before' | 'after' }
  | { type: 'list.create'; list: TaskList }
  | { type: 'list.update'; list: TaskList }
  | { type: 'label.create'; name: string; color?: string | null }
  | { type: 'habit.save'; habit: Habit; weekStartsOn: 0 | 1 }
  | { type: 'habit.archive'; id: string; archived: boolean }
  | { type: 'habit.remove'; id: string }
  | { type: 'quadrant.update'; id: string; patch: Partial<Pick<Quadrant, 'name' | 'color'>> }
  | { type: 'matrix.mode'; mode: NonNullable<WorkspaceData['matrixMode']> };
