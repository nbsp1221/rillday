import { z } from 'zod';
import { color, name, rank } from '../../shared-kernel/values.ts';

export const labelSchema = z.strictObject({
  name: name.refine((value) => !/[\s#]/u.test(value)),
  color: color.nullable(),
  rank: rank.default('a0'),
});

export type LabelData = z.infer<typeof labelSchema>;

export interface Label extends LabelData {
  id: string;
}
