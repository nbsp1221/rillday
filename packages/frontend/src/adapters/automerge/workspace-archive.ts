import * as Automerge from '@automerge/automerge';
import { base64ToUint8Array, uint8ArrayToBase64 } from 'uint8array-extras';
import { z } from 'zod';
import type { WorkspaceDocument } from './workspace-document.ts';
import { inspectDocument } from './workspace-review.ts';

const archive = z.object({
  format: z.literal('rillday-workspace'),
  version: z.literal(1),
  document: z.base64(),
});

export function encodeWorkspaceArchive(document: Automerge.Doc<WorkspaceDocument>): string {
  return JSON.stringify({
    format: 'rillday-workspace',
    version: 1,
    document: uint8ArrayToBase64(Automerge.save(document)),
  });
}

export function decodeWorkspaceArchive(source: string) {
  try {
    const parsed = archive.parse(JSON.parse(source));
    const binary = base64ToUint8Array(parsed.document);
    const document = Automerge.load<WorkspaceDocument>(binary);
    try {
      const inspection = inspectDocument(document);
      return {
        binary,
        workspace: inspection.workspace,
        hasDecisions: inspection.conflicts.length > 0 || Boolean(inspection.semantic),
        includedArchives: z.record(z.string(), z.boolean()).parse(document.includedArchives),
      };
    } finally {
      Automerge.free(document);
    }
  } catch (cause) {
    throw new Error('invalid_backup', { cause });
  }
}
