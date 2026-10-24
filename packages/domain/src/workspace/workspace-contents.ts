import { canonical } from '../shared-kernel/canonical.ts';
import type { Workspace } from './workspace.ts';
import { inboxDefaults, quadrantDefaults } from './create-workspace.ts';

export interface WorkspaceContents {
  tasks: number;
  lists: number;
  labels: number;
  habits: number;
  habitLogs: number;
  settings: boolean;
  hasData: boolean;
}

function quadrantSettings(workspace: Workspace) {
  return Object.values(workspace.quadrants)
    .sort((left, right) => left.key.localeCompare(right.key))
    .map(({ id: _id, ...value }) => value);
}

// System defaults alone do not require an inclusion or replacement decision.
export function workspaceContents(workspace: Workspace): WorkspaceContents {
  const inbox = Object.values(workspace.lists).find((list) => list.system === 'inbox');
  const settings =
    workspace.matrixMode !== 'simple' ||
    canonical(quadrantSettings(workspace)) !==
      canonical([...quadrantDefaults].sort((left, right) => left.key.localeCompare(right.key))) ||
    inbox?.name !== inboxDefaults.name ||
    inbox?.color !== inboxDefaults.color;
  const contents = {
    tasks: Object.values(workspace.tasks).filter((task) => !task.purgedAt && !task.voided).length,
    lists: Object.keys(workspace.lists).length,
    labels: Object.keys(workspace.labels).length,
    habits: Object.keys(workspace.habits).length,
    habitLogs: Object.keys(workspace.checkIns).length,
    settings,
    hasData: false,
  };
  contents.hasData = Boolean(
    contents.tasks ||
    contents.labels ||
    contents.habits ||
    contents.habitLogs ||
    contents.settings ||
    contents.lists > 1,
  );
  return contents;
}
