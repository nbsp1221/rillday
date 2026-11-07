import { Temporal } from 'temporal-polyfill/implementation';
import { z } from 'zod';

const clock = '\\d{2}:\\d{2}(?::[0-5]\\d(?:\\.\\d{1,9})?)?';
const civil = '\\d{4}-\\d{2}-\\d{2}T' + clock;

export const recordingTimeSchema = z
  .discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('instant'), value: z.string() }),
    z.strictObject({ kind: z.literal('unqualified'), value: z.string() }),
    z.strictObject({ kind: z.literal('time'), value: z.string() }),
  ])
  .refine((time) => {
    try {
      if (time.kind === 'instant') {
        return (
          new RegExp('^' + civil + '(Z|[+-]\\d{2}:\\d{2})$').test(time.value) &&
          !time.value.endsWith('-00:00') &&
          Boolean(Temporal.Instant.from(time.value))
        );
      }
      if (time.kind === 'unqualified') {
        return (
          new RegExp('^' + civil + '$').test(time.value) &&
          Boolean(Temporal.PlainDateTime.from(time.value))
        );
      }
      return (
        new RegExp('^' + clock + '$').test(time.value) &&
        Boolean(Temporal.PlainTime.from(time.value))
      );
    } catch {
      return false;
    }
  });

export type RecordingTime = z.infer<typeof recordingTimeSchema>;

export function recordingTimeIdentity(time: RecordingTime | undefined): string | null {
  if (!time) {
    return null;
  }
  const value =
    time.kind === 'instant'
      ? Temporal.Instant.from(time.value).toString()
      : time.kind === 'time'
        ? Temporal.PlainTime.from(time.value).toString()
        : Temporal.PlainDateTime.from(time.value).toString();
  return time.kind + ':' + value;
}
