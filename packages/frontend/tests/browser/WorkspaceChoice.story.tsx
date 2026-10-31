import { useState } from 'react';
import { WorkspaceChoice } from '../../src/presentation/shared/ui/WorkspaceChoice';

interface StoryProps {
  locale?: string;
}

export function Choices({ locale = 'en' }: StoryProps) {
  const [value, setValue] = useState('en');
  const [changes, setChanges] = useState(0);
  return (
    <main className="p-4">
      <WorkspaceChoice
        name={locale === 'ko' ? '언어' : 'Language'}
        value={value}
        options={[
          { value: 'ko', label: '한국어' },
          { value: 'en', label: 'English' },
          {
            value: 'long',
            label:
              locale === 'ko'
                ? '너비를 넘어가는 긴 선택 항목도 메뉴 안에서 표시되어야 합니다'
                : 'A deliberately long option that should stay inside the menu',
          },
        ]}
        onChange={(next) => {
          setValue(next);
          setChanges((count) => count + 1);
        }}
        className="w-50"
        contentClassName="w-50"
      />
      <output aria-label="Selected value">{value}</output>
      <output aria-label="Changes">{changes}</output>
    </main>
  );
}

export function NumericChoices() {
  const [value, setValue] = useState(0);
  return (
    <main className="absolute bottom-4 left-4">
      <WorkspaceChoice
        name="Frequency"
        value={value}
        options={[
          { value: 0, label: 'No sessions', group: 'Weekly' },
          { value: 1, label: 'One session', description: 'Once weekly', group: 'Weekly' },
          { value: 2, label: 'Two sessions', description: 'Twice monthly', group: 'Monthly' },
        ]}
        onChange={setValue}
        className="w-50"
        contentClassName="w-50"
      />
      <output aria-label="Selected value">{value}</output>
      <output aria-label="Value kind">{typeof value}</output>
    </main>
  );
}
