import type { TFunction } from 'i18next';
import {
  type Task,
  type TaskViewOptions,
  type WorkspaceData,
  addDays,
  dateKey,
} from '#application';

function matchesFilter(task: Task, filter: string, data: WorkspaceData): boolean {
  const today = dateKey();
  if (filter === 'trash') {
    return task.deleted;
  }
  if (task.deleted) {
    return false;
  }
  if (filter === 'completed') {
    return Boolean(task.completedAt);
  }
  if (filter === 'today') {
    return task.date !== null && task.date <= today;
  }
  if (filter === 'next') {
    return task.date !== null && task.date <= addDays(today, 6);
  }
  if (filter.startsWith('list:')) {
    return task.listId === filter.slice(5);
  }
  if (filter.startsWith('tag:')) {
    return task.tags.includes(filter.slice(4));
  }
  if (filter === 'all') {
    return data.lists.some((l) => l.id === task.listId);
  }
  return true;
}

export function getTaskViewModel({
  data,
  filter,
  options,
  locale,
  t,
  formatDate,
}: {
  data: WorkspaceData;
  filter: string;
  options: TaskViewOptions;
  locale: string;
  t: TFunction;
  formatDate: (date: string | null) => string;
}) {
  const matching = data.tasks.filter((task) => matchesFilter(task, filter, data));
  const tasks = matching.filter(
    (task) =>
      !task.parentId ||
      filter === 'completed' ||
      filter === 'trash' ||
      !matching.some((parent) => parent.id === task.parentId && !parent.completedAt),
  );
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
  tasks.sort((a, b) => {
    const pin = Number(b.pinned) - Number(a.pinned);
    if (pin) {
      return pin;
    }
    let compared = 0;
    if (options.sort === 'date' || options.sort === 'date-desc') {
      if (!a.date !== !b.date) {
        return a.date ? -1 : 1;
      }
      compared =
        `${a.date ?? ''}T${a.time ?? ''}`.localeCompare(`${b.date ?? ''}T${b.time ?? ''}`) *
        (options.sort === 'date-desc' ? -1 : 1);
    } else if (options.sort === 'priority' || options.sort === 'priority-asc') {
      compared = (b.priority - a.priority) * (options.sort === 'priority-asc' ? -1 : 1);
    } else if (options.sort === 'title' || options.sort === 'title-desc') {
      compared = collator.compare(a.title, b.title) * (options.sort === 'title-desc' ? -1 : 1);
    }
    return compared || a.order - b.order || a.id.localeCompare(b.id);
  });
  const pending = tasks.filter((t) => !t.completedAt);
  const completed = tasks.filter((t) => t.completedAt);
  const archive = filter === 'completed' || filter === 'trash';
  let groups: { key: string; title?: string; tasks: Task[] }[];
  const groupedTasks = archive ? tasks : pending;
  if (options.group === 'none') {
    groups = [{ key: 'all', tasks: groupedTasks }];
  } else {
    const buckets = new Map<string, Task[]>();
    const today = dateKey();
    for (const task of groupedTasks) {
      let key: string;
      if (options.group === 'date') {
        key =
          task.date && task.date < today && !task.completedAt ? 'overdue' : (task.date ?? 'none');
      } else if (options.group === 'list') {
        key = task.listId;
      } else {
        key = String(task.priority);
      }
      const bucket = buckets.get(key) ?? [];
      bucket.push(task);
      buckets.set(key, bucket);
    }

    const listOrder = (id: string) => data.lists.findIndex((list) => list.id === id);

    groups = [...buckets]
      .sort(([a], [b]) => {
        if (options.group === 'priority') {
          return Number(b) - Number(a);
        }
        if (options.group === 'list') {
          return listOrder(a) - listOrder(b);
        }
        if (a === 'overdue' || b === 'overdue') {
          return a === 'overdue' ? -1 : 1;
        }
        if (a === 'none' || b === 'none') {
          return a === 'none' ? 1 : -1;
        }
        return a.localeCompare(b);
      })
      .map(([key, tasks]) => {
        let title: string;
        if (options.group === 'date') {
          title = key === 'overdue' ? t('tasks.overdue') : formatDate(key === 'none' ? null : key);
        } else if (options.group === 'list') {
          title =
            key === 'inbox'
              ? t('lists.inbox')
              : (data.lists.find((list) => list.id === key)?.name ?? t('lists.title'));
        } else {
          title = t(`priority.${key}`, { ns: 'labels' });
        }
        return { key: `${options.group}:${key}`, title, tasks };
      });
  }
  if (!archive && completed.length) {
    groups.push({
      key: 'completed',
      title: t('common.complete', { context: 'status' }),
      tasks: completed,
    });
  }

  return { tasks, archive, groups };
}
