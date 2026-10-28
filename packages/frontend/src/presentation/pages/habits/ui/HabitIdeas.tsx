import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { Plus } from 'lucide-react';
import { type RefObject, useState } from 'react';
import { type Habit, createHabitDraft } from '#application';
import { useI18n } from '#shared/i18n';
import { WorkspaceDialog } from '#shared/ui/WorkspaceDialog';
import { habitColors } from './habit-display';
import { HabitGlyph } from './habit-icons';

const ideas: { id: string; icon: string; color: string; patch?: Partial<Habit>; unit?: string }[] =
  [
    {
      id: 'water',
      icon: 'droplets',
      color: '#77abc5',
      unit: 'cups',
      patch: { kind: 'quantity', goal: 8, step: 1, timeOfDay: 'anytime' },
    },
    {
      id: 'walk',
      icon: 'footprints',
      color: '#94b781',
      unit: 'minutes',
      patch: { kind: 'quantity', goal: 20, step: 5, timeOfDay: 'afternoon' },
    },
    { id: 'words', icon: 'languages', color: '#a398d0', patch: { frequency: 'weekdays' } },
    {
      id: 'movement',
      icon: 'dumbbell',
      color: '#cf976a',
      patch: { frequency: 'weekly', weeklyTarget: 3 },
    },
    { id: 'journal', icon: 'notebook-pen', color: '#d2ae6a', patch: { timeOfDay: 'evening' } },
    {
      id: 'reading',
      icon: 'book-open',
      color: '#a398d0',
      unit: 'minutes',
      patch: { kind: 'quantity', goal: 60, step: 10, frequency: 'weekly-total' },
    },
    {
      id: 'plants',
      icon: 'flower-2',
      color: '#94b781',
      patch: { frequency: 'interval', intervalDays: 3 },
    },
    { id: 'floss', icon: 'toothbrush', color: '#77abc5', patch: { timeOfDay: 'evening' } },
    {
      id: 'expenses',
      icon: 'wallet',
      color: '#7eb4b4',
      patch: { frequency: 'weekdays', timeOfDay: 'evening' },
    },
    {
      id: 'family',
      icon: 'phone',
      color: '#c591ba',
      patch: { frequency: 'weekly', weeklyTarget: 2 },
    },
    {
      id: 'music',
      icon: 'guitar',
      color: '#cf976a',
      unit: 'minutes',
      patch: { kind: 'quantity', goal: 120, step: 15, frequency: 'weekly-total' },
    },
    {
      id: 'stretch',
      icon: 'person-standing',
      color: '#7eb4b4',
      patch: { timeOfDay: 'morning', frequency: 'weekdays' },
    },
    { id: 'tidy', icon: 'spray-can', color: '#8e98cf', patch: { frequency: 'weekdays' } },
    { id: 'breathe', icon: 'wind', color: '#7d9cc4', patch: { timeOfDay: 'morning' } },
    {
      id: 'dog',
      icon: 'dog',
      color: '#d2ae6a',
      unit: 'times',
      patch: { kind: 'quantity', goal: 2, step: 1 },
    },
    {
      id: 'draw',
      icon: 'palette',
      color: '#c591ba',
      patch: { frequency: 'weekly', weeklyTarget: 3 },
    },
    { id: 'daylight', icon: 'sun', color: '#d2ae6a', patch: { timeOfDay: 'morning' } },
    {
      id: 'pages',
      icon: 'pencil',
      color: '#a398d0',
      unit: 'pages',
      patch: { kind: 'quantity', goal: 2, step: 1 },
    },
    { id: 'medicine', icon: 'pill', color: '#c77f87', patch: { timeOfDay: 'morning' } },
    { id: 'rest', icon: 'moon', color: '#8e98cf', patch: { timeOfDay: 'evening' } },
  ];

export function HabitIdeas({
  onChoose,
  onClose,
  finalFocus,
}: {
  onChoose: (habit: Habit) => void;
  onClose: () => void;
  finalFocus: RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const matching = ideas.filter((idea) =>
    t(`habits.ideas.${idea.id}`).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );

  function choose(idea?: (typeof ideas)[number]) {
    const draft = createHabitDraft(t('habits.times'));
    onChoose(
      idea
        ? {
            ...draft,
            ...idea.patch,
            name: t(`habits.ideas.${idea.id}`),
            icon: idea.icon,
            color: idea.color,
            unit: idea.unit ? t(`habits.ideaUnits.${idea.unit}`) : draft.unit,
          }
        : draft,
    );
  }

  return (
    <WorkspaceDialog
      title={t('habits.startHabit')}
      description={t('habits.templatesHint')}
      onClose={onClose}
      finalFocus={finalFocus}
      footer={
        <Button onClick={() => choose()} className="w-full">
          <Plus size={16} />
          {t('habits.startBlank')}
        </Button>
      }
    >
      <Input
        aria-label={t('habits.templateSearch')}
        placeholder={t('habits.templateSearch')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="habit-ideas grid grid-cols-2 gap-2">
        {matching.map((idea) => (
          <Button
            key={idea.id}
            variant="ghost"
            onClick={() => choose(idea)}
            className="h-auto min-h-16 justify-start gap-3 whitespace-normal rounded-md border border-border p-3 text-left"
          >
            <span
              style={habitColors(idea.color)}
              className="grid size-9 shrink-0 place-items-center rounded-lg bg-habit-color/15 text-habit-color"
            >
              <HabitGlyph value={idea.icon} />
            </span>
            <span className="text-sm leading-snug">{t(`habits.ideas.${idea.id}`)}</span>
          </Button>
        ))}
      </div>
    </WorkspaceDialog>
  );
}
