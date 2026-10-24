import { Temporal } from 'temporal-polyfill/implementation';
import { z } from 'zod';

export const uuid = z.uuid();

export const dateSchema = z.iso.date();

export const habitAmountSchema = z.number().finite().min(0.01).max(1000000);

export const time = z.iso.time({ precision: -1 });

export const zone = z
  .string()
  .max(80)
  .refine((v) => {
    try {
      Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(v);
      return true;
    } catch {
      return false;
    }
  });

export const color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((v) => v.toLowerCase());

export const name = z.string().trim().min(1).max(80);

export const rank = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9]+$/);
