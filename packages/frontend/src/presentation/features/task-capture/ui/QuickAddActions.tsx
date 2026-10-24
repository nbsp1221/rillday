import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { Flag, Plus } from 'lucide-react';
import type { CaptureDraft } from '#entities/workspace';
import { type Task, dateKey, parseQuickInput } from '#application';
import { useAppPreferences } from '#entities/preferences';
import { CaptureDatePicker, priorityColor, taskPriorities } from '#entities/task';
import { useI18n } from '#shared/i18n';
import { WorkspaceActions } from '#shared/ui/WorkspaceActions';

export function QuickAddActions({
  draft,
  date,
  change,
  submit,
}: {
  draft: CaptureDraft;
  date?: string;
  change: (patch: Partial<CaptureDraft>) => void;
  submit: () => void;
}) {
  const { t } = useI18n();
  const { preferences } = useAppPreferences();
  const parsed = parseQuickInput(draft.text, dateKey(), preferences);
  const effectiveDate = draft.manualDate ? draft.due || null : (parsed.date ?? date ?? null);
  const effectiveTime = effectiveDate
    ? draft.time !== undefined
      ? draft.time
      : parsed.time
    : null;
  const selectedRepeat = draft.repeat !== undefined ? draft.repeat : parsed.repeat;
  const effectiveRepeat =
    effectiveDate && selectedRepeat
      ? {
          ...selectedRepeat,
          ...(selectedRepeat.until && selectedRepeat.until < effectiveDate
            ? { until: effectiveDate }
            : {}),
        }
      : null;
  const effectivePriority = (
    draft.priority !== '' ? Number(draft.priority) : parsed.priority
  ) as Task['priority'];
  const priorityLabel = t(`priority.${effectivePriority}`, { ns: 'labels' });

  return (
    <div className="quick-add-actions [--task-control-size:var(--capture-target)] flex items-center self-end shrink-0 gap-1">
      <CaptureDatePicker
        value={effectiveDate}
        time={effectiveTime}
        repeat={effectiveRepeat}
        duration={draft.duration ?? 30}
        onDurationChange={(duration) => change({ duration })}
        onRepeatChange={(repeat) =>
          change({
            repeat,
            ...(repeat && !effectiveDate ? { due: dateKey(), manualDate: true } : {}),
          })
        }
        onChange={(due) =>
          change({
            due,
            manualDate: true,
            ...(!due
              ? { time: null, repeat: null }
              : effectiveRepeat?.until && effectiveRepeat.until < due
                ? { repeat: { ...effectiveRepeat, until: due } }
                : {}),
          })
        }
        onTimeChange={(time) =>
          change({
            time,
            ...(time && !effectiveDate ? { due: dateKey(), manualDate: true } : {}),
          })
        }
      />
      <WorkspaceActions
        triggerClassName="opacity-100"
        label={t('tasks.newPriority')}
        title={priorityLabel}
        className="quick-priority"
        triggerIcon={
          <Flag
            style={{ color: priorityColor(effectivePriority) }}
            fill={effectivePriority ? 'currentColor' : 'none'}
            className="size-4 inline-block shrink-0 align-middle"
          />
        }
        items={taskPriorities.map((priority) => ({
          label: t(`priority.${priority}`, { ns: 'labels' }),
          icon: (
            <Flag
              style={{ color: priorityColor(priority) }}
              fill={priority ? 'currentColor' : 'none'}
              className="size-3.5 inline-block shrink-0 align-middle"
            />
          ),
          checked: effectivePriority === priority,
          action: () => change({ priority: String(priority) }),
        }))}
      />
      <ButtonPrimitive
        type="button"
        aria-label={t('common.add')}
        title={t('common.add')}
        disabled={!draft.text.trim()}
        onClick={submit}
        className={
          'quick-add-submit grid place-items-center shrink-0 self-end w-(--capture-target) h-(--capture-target) p-0 rounded-sm text-foreground [&:disabled:hover]:bg-transparent'
        }
      >
        <Plus className="size-4 inline-block shrink-0 align-middle" />
      </ButtonPrimitive>
    </div>
  );
}
