import { Input } from '@repo/ui/components/input';
import { Label } from '@repo/ui/components/label';
import { useId } from 'react';
import { useI18n } from '#shared/i18n';
import { WorkspaceChoice } from '#shared/ui/WorkspaceChoice';

export function ImportSource({
  source,
  busy,
  change,
  read,
}: {
  source: 'ticktick' | 'rillday';
  busy: boolean;
  change: (source: 'ticktick' | 'rillday') => void;
  read: (file: File) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  return (
    <fieldset disabled={busy} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={id + '-source'}>{t('habitImport.source')}</Label>
        <WorkspaceChoice
          id={id + '-source'}
          name={t('habitImport.source')}
          value={source}
          options={[
            { value: 'ticktick', label: 'TickTick Excel' },
            { value: 'rillday', label: 'Rillday CSV' },
          ]}
          onChange={change}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={id + '-file'}>{t('habitImport.file')}</Label>
        <Input
          key={source}
          id={id + '-file'}
          aria-describedby={id + '-hint'}
          type="file"
          accept={source === 'ticktick' ? '.xlsx' : '.csv'}
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              read(file);
            }
          }}
        />
        <p id={id + '-hint'} className="text-xs text-muted-foreground">
          {t('habitImport.fileLimit')}
        </p>
      </div>
      {source === 'ticktick' ? (
        <p className="text-xs text-muted-foreground">{t('habitImport.ticktickFormat')}</p>
      ) : (
        <a
          className="inline-block text-sm text-primary underline underline-offset-4"
          href={
            'data:text/csv;charset=utf-8,' +
            encodeURIComponent(
              'habit_key,habit_name,kind,date,value,goal,unit,skipped,recorded_at,note\nreading,Read a book,quantity,2024-02-29,15,20,min,false,21:30,\n',
            )
          }
          download="rillday-habits.csv"
        >
          {t('habitImport.template')}
        </a>
      )}
    </fieldset>
  );
}
