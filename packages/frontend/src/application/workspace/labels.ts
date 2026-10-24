import type { WorkspaceData } from './model.ts';

// Explicit empty labels and labels from older task-only datasets share one view.
export function workspaceLabels(data: WorkspaceData): string[] {
  return [
    ...new Set([
      ...(data.labels ?? []),
      ...Object.keys(data.labelColors ?? {}),
      ...data.tasks.filter((task) => !task.deleted).flatMap((task) => task.tags),
    ]),
  ]
    .filter((name) => Boolean(name.trim()))
    .sort();
}

export function workspaceLabelColor(data: WorkspaceData, name: string): string | undefined {
  return data.labelColors && Object.hasOwn(data.labelColors, name)
    ? data.labelColors[name]
    : undefined;
}
