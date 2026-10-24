import { Decimal } from 'decimal.js';
import { z } from 'zod';
import { Fault } from '../../shared-kernel/fault.ts';

export interface QuantityAdjustment {
  readonly units: number;
  readonly generation: string;
}

export interface RecordedQuantity {
  readonly generation: string;
  readonly adjustments: Readonly<Record<string, QuantityAdjustment>>;
}

export const recordedQuantitySchema = z.strictObject({
  generation: z.string().min(1).max(80),
  adjustments: z.record(
    z.string().min(1).max(80),
    z.strictObject({
      units: z.int().min(-1000000000000000).max(1000000000000000),
      generation: z.string().min(1).max(80),
    }),
  ),
});

// Corrections supersede observed increments; unseen older increments require review.
export function quantityValue(quantity: RecordedQuantity): number {
  return Object.values(quantity.adjustments)
    .filter((adjustment) => adjustment.generation === quantity.generation)
    .reduce((total, adjustment) => total.plus(adjustment.units), new Decimal(0))
    .dividedBy(1000000)
    .toNumber();
}

export function quantityProblems(quantity: RecordedQuantity): string[] {
  const problems: string[] = [];
  const value = quantityValue(quantity);
  if (!Number.isFinite(value) || value < 0 || value > 1000000000) {
    problems.push('quantity_out_of_range');
  }
  if (
    Object.values(quantity.adjustments).some((entry) => entry.generation !== quantity.generation)
  ) {
    problems.push('quantity_correction_conflict');
  }
  return problems;
}

function checked(quantity: RecordedQuantity): RecordedQuantity {
  const value = quantityValue(quantity);
  if (value < 0) {
    throw new Fault('negative_value');
  }
  if (!Number.isFinite(value) || value > 1000000000) {
    throw new Fault('invalid_habitLog');
  }
  return quantity;
}

export function recordQuantity(value: number, adjustmentId: string): RecordedQuantity {
  if (!Number.isFinite(value) || value < 0 || value > 1000000000) {
    throw new Fault('invalid_habitLog');
  }
  const amount = new Decimal(value).times(1000000).toDecimalPlaces(0).toNumber();
  return checked({
    generation: adjustmentId,
    adjustments:
      amount === 0
        ? {}
        : {
            [adjustmentId]: { units: amount, generation: adjustmentId },
          },
  });
}

export function incrementQuantity(
  quantity: RecordedQuantity,
  value: number,
  adjustmentId: string,
): RecordedQuantity {
  if (!Number.isFinite(value) || Math.abs(value) > 1000000) {
    throw new Fault('invalid_increment');
  }
  const amount = new Decimal(value).times(1000000).toDecimalPlaces(0).toNumber();
  if (amount === 0) {
    return quantity;
  }
  if (Object.hasOwn(quantity.adjustments, adjustmentId)) {
    const existing = quantity.adjustments[adjustmentId];
    if (existing.units !== amount || existing.generation !== quantity.generation) {
      throw new Fault('edit_conflict', 'conflict');
    }
    return quantity;
  }
  return checked({
    generation: quantity.generation,
    adjustments: {
      ...quantity.adjustments,
      [adjustmentId]: { units: amount, generation: quantity.generation },
    },
  });
}
