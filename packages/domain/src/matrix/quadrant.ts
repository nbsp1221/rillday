import { z } from 'zod';
import { color, name, rank } from '../shared-kernel/values.ts';

export const quadrantSchema = z.strictObject({
  key: z.enum(['do', 'plan', 'delegate', 'later']),
  name: name.nullable(),
  color,
  important: z.boolean(),
  urgent: z.boolean(),
  rank,
});

export type QuadrantData = z.infer<typeof quadrantSchema>;
export type QuadrantKey = QuadrantData['key'];

export interface Quadrant extends QuadrantData {
  id: string;
}
