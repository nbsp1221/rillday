import { Temporal } from 'temporal-polyfill/implementation';
import type { Priority, RepeatRule } from './model.ts';
import { addDays, clockTime, dateKey } from './dates.ts';

export interface ParsedTask {
  title: string;
  tags: string[];
  priority: Priority;
  date: string | null;
  time: string | null;
  listName: string | null;
  repeat: RepeatRule | null;
}

export interface QuickInputOptions {
  recognizeDates?: boolean;
  removeDateText?: boolean;
  keepTagText?: boolean;
}

function repeatFrequency(word: string): RepeatRule['frequency'] {
  if (/매주|week$/i.test(word)) {
    return 'weekly';
  }
  if (/매월|month$/i.test(word)) {
    return 'monthly';
  }
  return word === '평일마다' ? 'weekdays' : 'daily';
}

function relativeDayOffset(word: string): number {
  if (/모레|day after/i.test(word)) {
    return 2;
  }
  if (/내일|tomorrow/i.test(word)) {
    return 1;
  }
  return /다음|next week/i.test(word) ? 7 : 0;
}

class QuickInputParser {
  private readonly task: ParsedTask;
  private readonly today: string;
  private readonly options: QuickInputOptions;

  constructor(raw: string, today: string, options: QuickInputOptions) {
    this.today = today;
    this.options = options;
    this.task = {
      title: raw.trim(),
      tags: [],
      priority: 0,
      date: null,
      time: null,
      listName: null,
      repeat: null,
    };
  }

  parse(): ParsedTask {
    this.parseLabels();
    this.parsePriority();
    this.parseList();
    this.parseRepeat();

    if (this.options.recognizeDates !== false) {
      this.parseRelativeDates();
      this.parseExplicitDates();
      this.parseWeekdays();
      this.parseTimes();
    }
    if (this.task.repeat && !this.task.date) {
      this.task.date = this.today;
    }

    this.task.title = this.task.title.replace(/\s+/g, ' ').trim();
    return this.task;
  }

  private parseLabels() {
    this.task.title = this.task.title.replace(
      /(^|\s)#([^\s#]+)/gu,
      (match: string, space: string, tag: string) => {
        if (!this.task.tags.includes(tag)) {
          this.task.tags.push(tag);
        }
        return this.options.keepTagText ? match : space;
      },
    );
  }

  private parsePriority() {
    const levels: Record<string, Priority> = { '1': 3, '2': 2, '3': 1, '4': 0 };
    this.task.title = this.task.title.replace(
      /(^|\s)[!！]([1-4])(?=\s|$)/g,
      (_match: string, space: string, level: string) => {
        this.task.priority = levels[level];
        return space;
      },
    );
  }

  private parseList() {
    this.task.title = this.task.title.replace(
      /(^|\s)[\^~]([^\s]+)/g,
      (_match: string, space: string, name: string) => {
        this.task.listName = name;
        return space;
      },
    );
  }

  private parseRepeat() {
    this.task.title = this.task.title.replace(
      /(^|\s)(매일|매주|매월|평일마다|every day|every week|every month)(?=\s|$)/gi,
      (_match: string, space: string, word: string) => {
        this.task.repeat = { frequency: repeatFrequency(word), interval: 1 };
        return space;
      },
    );
  }

  private consumedDateText(match: string, space: string) {
    return this.options.removeDateText === false ? match : space;
  }

  private parseRelativeDates() {
    this.task.title = this.task.title.replace(
      /(^|\s)(day after tomorrow|next week|오늘|내일|모레|today|tomorrow|다음\s*주)(?=\s|$)/gi,
      (match: string, space: string, word: string) => {
        this.task.date = addDays(this.today, relativeDayOffset(word));
        return this.consumedDateText(match, space);
      },
    );
  }

  private parseExplicitDates() {
    this.task.title = this.task.title.replace(
      /(^|\s)(\d{4}-\d{2}-\d{2})(?=\s|$)/g,
      (match: string, space: string, value: string) => {
        try {
          this.task.date = Temporal.PlainDate.from(value).toString();
        } catch {
          return match;
        }

        return this.consumedDateText(match, space);
      },
    );
  }

  private nextWeekday(dayIndex: number) {
    const offset = (dayIndex - (Temporal.PlainDate.from(this.today).dayOfWeek % 7) + 7) % 7;

    return addDays(this.today, offset || 7);
  }

  private parseWeekdays() {
    this.task.title = this.task.title.replace(
      /(^|\s)(월|화|수|목|금|토|일)요일(?=\s|$)/g,
      (match: string, space: string, day: string) => {
        this.task.date = this.nextWeekday('일월화수목금토'.indexOf(day));
        return this.consumedDateText(match, space);
      },
    );

    const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    this.task.title = this.task.title.replace(
      /(^|\s)(?:next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?=\s|$)/gi,
      (match: string, space: string, day: string) => {
        this.task.date = this.nextWeekday(weekdays.indexOf(day.toLowerCase()));
        return this.consumedDateText(match, space);
      },
    );
  }

  private parseTimes() {
    this.task.title = this.task.title.replace(
      /(^|\s)(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?=\s|$)/gi,
      (
        match: string,
        space: string,
        hourText: string,
        minuteText: string | undefined,
        period: string,
      ) => {
        const time = clockTime(
          Number(hourText),
          Number(minuteText || 0),
          period.toLowerCase() === 'pm' ? 'pm' : 'am',
        );

        if (!time) {
          return match;
        }

        this.task.time = time;
        this.task.date ??= this.today;
        return this.consumedDateText(match, space);
      },
    );

    this.task.title = this.task.title.replace(
      /(^|\s)(오전|오후)?\s*(\d{1,2})(?::(\d{2})|시)(?=\s|$)/g,
      (
        match: string,
        space: string,
        period: string | undefined,
        hourText: string,
        minuteText: string | undefined,
      ) => {
        const time = clockTime(
          Number(hourText),
          Number(minuteText || 0),
          period ? (period === '오후' ? 'pm' : 'am') : undefined,
        );

        if (!time) {
          return match;
        }

        this.task.time = time;
        this.task.date ??= this.today;
        return this.consumedDateText(match, space);
      },
    );
  }
}

export function parseQuickInput(
  raw: string,
  today = dateKey(),
  options: QuickInputOptions = {},
): ParsedTask {
  return new QuickInputParser(raw, today, options).parse();
}
