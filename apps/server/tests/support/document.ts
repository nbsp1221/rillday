import * as Automerge from '@automerge/automerge';
import { generateAutomergeUrl, interpretAsDocumentId } from '@automerge/automerge-repo';

export function documentFixture(data: Record<string, unknown>) {
  const document = Automerge.from(data);
  try {
    return {
      documentId: interpretAsDocumentId(generateAutomergeUrl()),
      binary: Automerge.save(document),
    };
  } finally {
    Automerge.free(document);
  }
}
