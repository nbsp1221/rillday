import { useState } from 'react';
import { I18nProvider } from '../../src/presentation/shared/i18n';
import { WorkspaceColorField } from '../../src/presentation/shared/ui/WorkspaceColorField';

export function Colors({ locale = 'en' }: { locale?: string }) {
  const [value, setValue] = useState<string | undefined>('#000000');
  return (
    <I18nProvider language={locale === 'ko' ? 'ko' : 'en'} timeFormat="24h" weekStartsOn={0}>
      <main className="p-4">
        <WorkspaceColorField label="Color" value={value} onChange={setValue} />
        <output aria-label="Selected color">{value}</output>
      </main>
    </I18nProvider>
  );
}
