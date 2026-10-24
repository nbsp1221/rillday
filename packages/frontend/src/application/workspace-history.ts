import { canonical } from '@repo/domain';
import { type Draft, type Patch, applyPatches, enablePatches, produceWithPatches } from 'immer';

enablePatches();

type Path = (string | number)[];
type VersionReader = (path: Path) => string;
type HistoryTarget = { path: Path; version: string; beforeVersion: string; data: unknown };

interface HistoryGroup {
  forward: Patch[];
  inverse: Patch[];
  targets: HistoryTarget[];
  key: string;
  createdAt: number;
  lastAt: number;
  operations: number;
}

export class WorkspaceHistory<T extends object> {
  private past: HistoryGroup[] = [];
  private future: HistoryGroup[] = [];
  private readonly version: VersionReader;
  private readonly validate: (data: T) => void;

  constructor(version: VersionReader, validate: (data: T) => void) {
    this.version = version;
    this.validate = validate;
  }

  private trim() {
    const cutoff = Date.now() - 15 * 60 * 1000;
    this.past = this.past.filter((group) => group.createdAt >= cutoff);
    this.future = this.future.filter((group) => group.createdAt >= cutoff);
  }

  get canUndo() {
    return this.past.some((group) => group.createdAt >= Date.now() - 15 * 60 * 1000);
  }
  get canRedo() {
    return this.future.some((group) => group.createdAt >= Date.now() - 15 * 60 * 1000);
  }

  private valueAt(data: unknown, path: Path) {
    let value = data;
    for (const key of path) {
      if (!value || typeof value !== 'object') {
        return undefined;
      }
      value = (value as Record<string | number, unknown>)[key];
    }
    return value;
  }

  private targets(
    patches: Patch[],
    data: unknown,
    before: HistoryTarget[] = [],
    reverse = false,
  ): HistoryTarget[] {
    const paths = new Map<string, Path>();
    for (const patch of patches) {
      const path = patch.path.slice(0, 2);
      paths.set(JSON.stringify(path), path);
    }
    return [...paths.values()].map((path) => {
      const version = this.version(path);
      const previous = before.find((target) => canonical(target.path) === canonical(path));
      return {
        path,
        version,
        beforeVersion: (reverse ? previous?.version : previous?.beforeVersion) ?? version,
        data: this.valueAt(data, path),
      };
    });
  }

  change(
    current: T,
    recipe: (draft: Draft<T>) => void,
    apply: (value: T) => void,
    key = '',
    operations = 1,
  ) {
    const [next, forward, inverse] = produceWithPatches(current, recipe);
    if (!forward.length) {
      return;
    }
    this.trim();
    const now = Date.now();
    const previous = this.past.at(-1);
    const merge =
      key &&
      previous?.key === key &&
      now - previous.lastAt < 800 &&
      previous.operations + operations <= 200 &&
      previous.targets.every((target) => this.version(target.path) === target.version);
    this.validate(next);
    const before = this.targets(forward, current);
    apply(next);
    if (merge) {
      previous.forward.push(...forward);
      previous.inverse.unshift(...inverse);
      previous.targets = this.targets(previous.forward, next, [...previous.targets, ...before]);
      previous.lastAt = now;
      previous.operations += operations;
    } else {
      this.past.push({
        forward,
        inverse,
        targets: this.targets(forward, next, before),
        key,
        operations,
        createdAt: now,
        lastAt: now,
      });
      if (this.past.length > 40) {
        this.past.shift();
      }
    }
    this.future = [];
  }

  private restore(
    current: T,
    apply: (value: T) => void,
    from: HistoryGroup[],
    to: HistoryGroup[],
    inverse: boolean,
  ) {
    const group = from.at(-1);
    if (!group) {
      return;
    }
    if (group.targets.some((target) => this.version(target.path) !== target.version)) {
      throw new Error('undo_target_changed');
    }
    const patches = inverse ? group.inverse : group.forward;
    const restored = applyPatches(current, patches);
    this.validate(restored);
    apply(restored);
    from.pop();
    for (const target of group.targets) {
      const previous = from.findLast((candidate) =>
        candidate.targets.some((entry) => canonical(entry.path) === canonical(target.path)),
      );
      const earlier = previous?.targets.find(
        (entry) => canonical(entry.path) === canonical(target.path),
      );
      if (
        earlier &&
        earlier.version === target.beforeVersion &&
        canonical(earlier.data) === canonical(this.valueAt(restored, earlier.path))
      ) {
        earlier.version = this.version(earlier.path);
      }
    }
    to.push({ ...group, targets: this.targets(group.forward, restored, group.targets, true) });
  }

  undo(current: T, apply: (value: T) => void) {
    this.trim();
    this.restore(current, apply, this.past, this.future, true);
  }

  redo(current: T, apply: (value: T) => void) {
    this.trim();
    this.restore(current, apply, this.future, this.past, false);
  }

  clear() {
    this.past = [];
    this.future = [];
  }
}
