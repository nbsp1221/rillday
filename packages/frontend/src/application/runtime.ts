import type { WorkspaceCoordination } from './coordination.ts';
import type { WorkspaceDocuments } from './workspace/documents.ts';

export interface ClientRuntime {
  coordination: WorkspaceCoordination;
  documents: WorkspaceDocuments;
}
