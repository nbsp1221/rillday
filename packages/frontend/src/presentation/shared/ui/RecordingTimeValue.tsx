import type { RecordingTime } from '#application';
import { useI18n } from '#shared/i18n';

export function RecordingTimeValue({ value }: { value: RecordingTime | undefined }) {
  const { t, dateLocale } = useI18n();
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <p>{t('habitImport.recordingTime')}</p>
      {value ? (
        <>
          <p className="tabular-nums text-foreground">
            {value.kind === 'instant'
              ? new Date(value.value).toLocaleString(dateLocale, { timeZoneName: 'short' })
              : value.value}
          </p>
          <p className="break-words">
            {value.kind === 'instant'
              ? value.value
              : t(value.kind === 'time' ? 'habitImport.timeOnly' : 'habitImport.unknownZone')}
          </p>
        </>
      ) : (
        <p>{t('habitImport.noTime')}</p>
      )}
    </div>
  );
}
