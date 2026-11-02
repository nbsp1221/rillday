import type { TFunction } from 'i18next';
import { type ReactNode, createContext, use, useEffect, useMemo, useState } from 'react';
import { I18nProvider as AccessibleI18nProvider } from 'react-aria-components/I18nProvider';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { Temporal, Intl as TemporalIntl } from 'temporal-polyfill/implementation';
import { addDays, dateKey } from '#application';
import { createTranslations } from './translations';

interface FormatSettings {
  language: 'ko' | 'en';
  timeFormat: '12h' | '24h';
  weekStartsOn: 0 | 1;
}

interface I18nContextValue {
  t: TFunction;
  locale: 'ko' | 'en';
  dateLocale: 'ko-KR' | 'en-US';
  weekdayNames: string[];
  weekStartsOn: 0 | 1;
  timeFormat: '12h' | '24h';
  formatDate: (value: string | null, withWeekday?: boolean) => string;
  formatTime: (value: string | null) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children, ...settings }: FormatSettings & { children: ReactNode }) {
  const [instance] = useState(() => createTranslations(settings.language));
  useEffect(() => {
    void instance.changeLanguage(settings.language);
  }, [instance, settings.language]);
  return (
    <I18nextProvider i18n={instance}>
      <LocalizedFormatting {...settings}>{children}</LocalizedFormatting>
    </I18nextProvider>
  );
}

function LocalizedFormatting({
  language,
  timeFormat,
  weekStartsOn,
  children,
}: FormatSettings & { children: ReactNode }) {
  const { t } = useTranslation('translation', { lng: language });
  const value = useMemo<I18nContextValue>(() => {
    const dateLocale = language === 'ko' ? 'ko-KR' : 'en-US';
    const dateOptions = { month: 'short', day: 'numeric' } as const;
    const dates = [
      new TemporalIntl.DateTimeFormat(dateLocale, dateOptions),
      new TemporalIntl.DateTimeFormat(dateLocale, { ...dateOptions, weekday: 'short' }),
    ] as const;
    const times = new TemporalIntl.DateTimeFormat(dateLocale, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: timeFormat === '12h',
    });
    const weekdayFormat = new TemporalIntl.DateTimeFormat(dateLocale, {
      weekday: language === 'ko' ? 'narrow' : 'short',
    });
    const sunday = Temporal.PlainDate.from('2000-01-02');
    const weekdayNames = Array.from({ length: 7 }, (_, day) =>
      weekdayFormat.format(sunday.add({ days: day })),
    );

    return {
      t,
      weekStartsOn,
      timeFormat,
      locale: language,
      dateLocale,
      weekdayNames,
      formatDate: (date, withWeekday = true) => {
        if (!date) {
          return t('dates.none');
        }
        const today = dateKey();
        if (date === today) {
          return t('dates.today');
        }
        if (date === addDays(today, 1)) {
          return t('dates.tomorrow');
        }
        if (date === addDays(today, -1)) {
          return t('dates.yesterday');
        }
        return dates[withWeekday ? 1 : 0].format(Temporal.PlainDate.from(date));
      },
      formatTime: (time) => {
        if (!time) {
          return '';
        }

        return times.format(Temporal.PlainTime.from(time));
      },
    };
  }, [language, timeFormat, weekStartsOn, t]);

  return (
    <I18nContext value={value}>
      <AccessibleI18nProvider locale={value.dateLocale}>{children}</AccessibleI18nProvider>
    </I18nContext>
  );
}

export function useI18n(): I18nContextValue {
  const value = use(I18nContext);
  if (!value) {
    throw new Error('Missing localization provider');
  }
  return value;
}
