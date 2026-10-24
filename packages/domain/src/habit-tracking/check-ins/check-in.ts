import { z } from 'zod';
import { dateSchema, uuid } from '../../shared-kernel/values.ts';
import type { RecordedQuantity } from './recorded-quantity.ts';
export const habitLogSchema = z.strictObject({
  habitId: uuid,
  date: dateSchema,
  value: z.number().finite().min(0).max(1000000000),
  skipped: z.boolean(),
  note: z.string().max(8000),
  goal: z.number().positive(),
  unit: z.string(),
  ruleFrom: dateSchema,
});

export type HabitCheckInData = z.infer<typeof habitLogSchema>;

export interface HabitCheckIn extends Omit<HabitCheckInData, 'value'> {
  id: string;
  quantity: RecordedQuantity;
}
