import { z } from 'zod';
import { dateSchema, time, zone } from '../../shared-kernel/values.ts';

export const repeatSchema = z.strictObject({
  frequency: z.enum(['daily', 'weekly', 'monthly', 'weekdays']),
  interval: z.int().min(1).max(365),
  until: dateSchema.nullable().default(null),
  anchorDay: z.int().min(1).max(31).nullable().default(null),
});

export const scheduleSchema = z
  .strictObject({
    date: dateSchema.nullable(),
    time: time.nullable(),
    zone: zone.nullable(),
    durationMinutes: z.int().min(5).max(1440),
    repeat: repeatSchema.nullable(),
    reminderMinutes: z.int().min(0).max(525600).nullable(),
  })
  .superRefine((v, c) => {
    if (!v.date && (v.time || v.repeat)) {
      c.addIssue({ code: 'custom', message: 'date_required' });
    }
    if (v.time && !v.zone) {
      c.addIssue({ code: 'custom', message: 'zone_required' });
    }
    if (v.repeat?.until && v.date && v.repeat.until < v.date) {
      c.addIssue({ code: 'custom', message: 'repeat_end_before_date' });
    }
  });

export type RepeatSchedule = z.infer<typeof repeatSchema>;

export type Schedule = z.infer<typeof scheduleSchema>;
