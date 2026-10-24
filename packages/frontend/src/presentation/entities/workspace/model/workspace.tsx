import { createContext, use } from 'react';
import type {
  TaskActionResult,
  TaskActions,
  TaskCaptureDraft,
  WorkspaceData,
  WorkspaceIntent,
  WorkspacePort,
} from '#application';

export interface WorkspaceController {
  persistence: WorkspacePort;
  captureDrafts: Map<string, CaptureDraft>;
  data: WorkspaceData;
  apply: (intents: WorkspaceIntent | WorkspaceIntent[]) => boolean;
  runOperation: (operation: () => void, onError?: (error: unknown) => void) => boolean;
  selectedTaskId: string | null;
  selectTask: (id: string | null) => void;
  taskActions: TaskActions;
  deleteTask: (id: string) => TaskActionResult;
  notify: (message: string, options?: { undoable?: boolean }) => void;
}

export type CaptureDraft = TaskCaptureDraft;

export const WorkspaceContext = createContext<WorkspaceController | null>(null);

export function useWorkspace(): WorkspaceController {
  const value = use(WorkspaceContext);
  if (!value) {
    throw new Error('Missing workspace provider');
  }
  return value;
}
