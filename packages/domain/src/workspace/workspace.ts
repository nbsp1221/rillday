import type { HabitCheckIn } from '../habit-tracking/check-ins/check-in.ts';
import type { Habit } from '../habit-tracking/habits/habit.ts';
import type { Quadrant } from '../matrix/quadrant.ts';
import type { Label } from '../task-management/labels/label.ts';
import type { TaskList } from '../task-management/lists/task-list.ts';
import type { Task } from '../task-management/tasks/task.ts';

export interface Workspace {
  tasks: Record<string, Task>;
  lists: Record<string, TaskList>;
  labels: Record<string, Label>;
  habits: Record<string, Habit>;
  checkIns: Record<string, HabitCheckIn>;
  quadrants: Record<string, Quadrant>;
  matrixMode: 'simple' | 'complex';
}
