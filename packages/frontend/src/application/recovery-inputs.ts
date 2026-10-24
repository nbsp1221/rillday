import { z } from 'zod';
import type { RecoveredInput } from './workspace/connection.ts';

const recovery = z.object({ captureDrafts: z.array(z.unknown()) });
const capturedInput = z.tuple([z.string(), z.object({ text: z.string() })]).rest(z.unknown());

export function recoverCapturedInputs(source: string): RecoveredInput[] {
  const parsed = recovery.safeParse(JSON.parse(source));
  if (!parsed.success) {
    return [];
  }
  return parsed.data.captureDrafts.flatMap((entry) => {
    const draft = capturedInput.safeParse(entry);
    return draft.success ? [{ key: draft.data[0], text: draft.data[1].text }] : [];
  });
}
