import { useMemo } from 'react';
import { Temporal } from 'temporal-polyfill/implementation';
import type { Task, WorkspaceData } from '#application';

export function calendarEventLanes(tasks: Task[]): Map<string, { lane: number; columns: number }> {
  const result = new Map<string, { lane: number; columns: number }>();
  const dates = new Set(tasks.filter((task) => task.time && task.date).map((task) => task.date));

  for (const date of dates) {
    const events = tasks
      .filter((task) => task.date === date && task.time)
      .map((task) => {
        const time = Temporal.PlainTime.from(task.time!);
        const start = time.hour * 60 + time.minute;

        return { task, start, end: Math.min(1440, start + Math.max(task.duration, 15)), lane: 0 };
      })
      .sort((a, b) => a.start - b.start || b.end - a.end || a.task.id.localeCompare(b.task.id));

    let cluster: typeof events = [];
    let end = -1;

    function finish() {
      const ends: number[] = [];

      for (const event of cluster) {
        let lane = ends.findIndex((value) => value <= event.start);
        if (lane < 0) {
          lane = ends.length;
        }
        ends[lane] = event.end;
        event.lane = lane;
      }

      for (const event of cluster) {
        result.set(event.task.id, { lane: event.lane, columns: ends.length });
      }

      cluster = [];
    }

    for (const event of events) {
      if (event.start >= end) {
        finish();
      }
      cluster.push(event);
      end = Math.max(end, event.end);
    }

    finish();
  }

  return result;
}

export function useCalendarTasks(
  data: Pick<WorkspaceData, 'tasks' | 'lists'>,
  showCompleted: boolean,
) {
  const activeTasks = useMemo(
    () => data.tasks.filter((task) => !task.deleted && (showCompleted || !task.completedAt)),
    [data.tasks, showCompleted],
  );
  const taskOrder = useMemo(
    () => new Map(activeTasks.map((task, index) => [task.id, index])),
    [activeTasks],
  );
  const tasksByDate = useMemo(() => {
    const groups = new Map<string, Task[]>();
    for (const task of activeTasks) {
      if (task.date) {
        const list = groups.get(task.date) ?? [];
        list.push(task);
        groups.set(task.date, list);
      }
    }
    for (const list of groups.values()) {
      list.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    }
    return groups;
  }, [activeTasks]);

  const allDayTasks = useMemo(
    () =>
      new Map([...tasksByDate].map(([date, tasks]) => [date, tasks.filter((task) => !task.time)])),
    [tasksByDate],
  );
  const listColors = useMemo(
    () => new Map(data.lists.map((list) => [list.id, list.color])),
    [data.lists],
  );
  const eventLanes = useMemo(() => calendarEventLanes(activeTasks), [activeTasks]);
  const unscheduled = useMemo(() => activeTasks.filter((task) => !task.date), [activeTasks]);

  return { activeTasks, taskOrder, tasksByDate, allDayTasks, listColors, eventLanes, unscheduled };
}
