import { Button } from '@repo/ui/components/button';
import { Checkbox } from '@repo/ui/components/checkbox';
import { useState } from 'react';
import type { HabitImportReview } from '#application';
import { useI18n } from '#shared/i18n';
import { RecordingTimeValue } from '#shared/ui/RecordingTimeValue';

export function ImportReview({
  review,
  disabled,
  replace,
}: {
  review: HabitImportReview;
  disabled: boolean;
  replace: (group: string, date: string, value: boolean) => void;
}) {
  const { t } = useI18n();
  const [page, setPage] = useState(0);

  const count = (action: string) => review.days.filter((day) => day.action === action).length;

  const priority = { keep: 0, replace: 0, add: 1, duplicate: 2 };
  const days = [...review.days].sort(
    (left, right) => priority[left.action] - priority[right.action],
  );

  return (
    <section aria-label={t('habitImport.preview')} className="space-y-3 text-sm">
      <p role="status">
        {t('habitImport.summary', {
          habits: review.habits,
          added: count('add'),
          duplicates: count('duplicate'),
          kept: count('keep'),
          replaced: count('replace'),
        })}
      </p>
      <div className="space-y-3 rounded-md border border-border p-3">
        {days.slice(page * 50, (page + 1) * 50).map((day) => (
          <div
            key={day.group + ':' + day.date}
            className="space-y-2 border-b border-border pb-3 last:border-0"
          >
            <p className="font-medium wrap-anywhere">
              {review.draft.groups.find((g) => g.key === day.group)?.name} · {day.date} ·{' '}
              {t('habitImport.action.' + day.action)}
            </p>
            {day.action !== 'duplicate' && (
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { label: t('habitImport.incoming'), log: day.incoming },
                  ...(day.existing
                    ? [{ label: t('habitImport.existing'), log: day.existing }]
                    : []),
                ].map(({ label, log }) => (
                  <div key={label} className="space-y-1 rounded bg-surface-inset p-2 text-xs">
                    <p className="font-medium">{label}</p>
                    <p className="tabular-nums">
                      {log.value} / {log.goal} {log.unit} ·{' '}
                      {t(log.skipped ? 'habits.skipped' : 'habitImport.recorded')}
                    </p>
                    <p className="whitespace-pre-wrap break-words">
                      {log.note || t('habitImport.noNote')}
                    </p>
                    <RecordingTimeValue value={log.recordedAt} />
                  </div>
                ))}
              </div>
            )}
            {day.existing && (day.action === 'keep' || day.action === 'replace') && (
              <label className="flex items-center gap-3 text-xs">
                <Checkbox
                  disabled={disabled}
                  checked={day.action === 'replace'}
                  onCheckedChange={(value) => replace(day.group, day.date, value)}
                />
                {t('habitImport.replace')}
              </label>
            )}
          </div>
        ))}
      </div>
      {review.days.length > 50 && (
        <nav
          aria-label={t('habitImport.preview')}
          className="flex items-center justify-between gap-2"
        >
          <Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
            {t('habitImport.previous')}
          </Button>
          <span className="text-xs tabular-nums">
            {page * 50 + 1}–{Math.min((page + 1) * 50, review.days.length)} / {review.days.length}
          </span>
          <Button
            variant="outline"
            disabled={(page + 1) * 50 >= review.days.length}
            onClick={() => setPage(page + 1)}
          >
            {t('habitImport.next')}
          </Button>
        </nav>
      )}
    </section>
  );
}
