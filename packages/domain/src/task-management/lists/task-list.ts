import { z } from 'zod';
import { color, name, rank } from '../../shared-kernel/values.ts';

export const taskListSchema = z.strictObject({
  name,
  color,
  system: z.enum(['inbox']).nullable().default(null),
  rank: rank.default('a0'),
});

export type TaskListData = z.infer<typeof taskListSchema>;

export interface TaskList extends TaskListData {
  id: string;
}
