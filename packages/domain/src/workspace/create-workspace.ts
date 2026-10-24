import type { DomainContext } from '../shared-kernel/clock.ts';
import type { Workspace } from './workspace.ts';

export const inboxDefaults = {
  name: 'Inbox',
  color: '#7d9cc4',
  system: 'inbox',
  rank: 'a0',
} as const;
export const quadrantDefaults = [
  { key: 'do', name: null, color: '#cf747b', important: true, urgent: true, rank: 'a0' },
  { key: 'plan', name: null, color: '#79a5cc', important: true, urgent: false, rank: 'a1' },
  { key: 'delegate', name: null, color: '#d6ae6b', important: false, urgent: true, rank: 'a2' },
  { key: 'later', name: null, color: '#90ad87', important: false, urgent: false, rank: 'a3' },
] as const;

export function createWorkspace(context: DomainContext): Workspace {
  const inboxId = context.newId();
  const workspace: Workspace = {
    tasks: {},
    lists: {
      [inboxId]: { id: inboxId, ...inboxDefaults },
    },
    labels: {},
    habits: {},
    checkIns: {},
    quadrants: {},
    matrixMode: 'simple',
  };
  for (const defaults of quadrantDefaults) {
    const id = context.newId();
    workspace.quadrants[id] = {
      id,
      ...defaults,
    };
  }
  return workspace;
}
