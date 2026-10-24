import { createInstance } from 'i18next';
import enDemo from './locales/en/demo.json';
import enEditor from './locales/en/editor.json';
import enErrors from './locales/en/errors.json';
import enFields from './locales/en/fields.json';
import enLabels from './locales/en/labels.json';
import enSync from './locales/en/sync.json';
import en from './locales/en/translation.json';
import koDemo from './locales/ko/demo.json';
import koEditor from './locales/ko/editor.json';
import koErrors from './locales/ko/errors.json';
import koFields from './locales/ko/fields.json';
import koLabels from './locales/ko/labels.json';
import koSync from './locales/ko/sync.json';
import ko from './locales/ko/translation.json';

export function createTranslations(language: 'ko' | 'en') {
  const instance = createInstance();

  void instance.init({
    lng: language,
    fallbackLng: 'en',
    supportedLngs: ['ko', 'en'],
    resources: {
      ko: {
        demo: koDemo,
        translation: ko,
        editor: koEditor,
        errors: koErrors,
        fields: koFields,
        labels: koLabels,
        sync: koSync,
      },
      en: {
        demo: enDemo,
        translation: en,
        editor: enEditor,
        errors: enErrors,
        fields: enFields,
        labels: enLabels,
        sync: enSync,
      },
    },
    initAsync: false,
    keySeparator: false,
    nsSeparator: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

  return instance;
}
