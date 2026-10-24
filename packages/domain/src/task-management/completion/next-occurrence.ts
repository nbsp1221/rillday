import { Temporal } from 'temporal-polyfill/implementation';
import { type TaskData, validateTaskData } from '../tasks/task.ts';
import { resetChecks } from './markdown-checks.ts';

export function nextOccurrenceData(
  source: { id: string; data: TaskData },
  rootId: string,
  nextDate: string,
  dayShift: number,
  mapping: ReadonlyMap<string, string>,
) {
  const schedule = source.data.schedule;
  let date = schedule.date;
  if (source.id === rootId) {
    date = nextDate;
  } else if (date) {
    date = Temporal.PlainDate.from(date).add({ days: dayShift }).toString();
  }

  let repeat = schedule.repeat;
  if (repeat?.frequency === 'monthly' && schedule.date) {
    repeat = {
      ...repeat,
      anchorDay: repeat.anchorDay ?? Temporal.PlainDate.from(schedule.date).day,
    };
  }

  const parentId = source.data.location.parentId;
  return validateTaskData({
    ...source.data,
    completedAt: null,
    voided: false,
    generatedFromId: source.id,
    notes: resetChecks(source.data.notes),
    location: {
      ...source.data.location,
      parentId: parentId ? (mapping.get(parentId) ?? parentId) : null,
    },
    schedule: { ...schedule, date, repeat },
  });
}
