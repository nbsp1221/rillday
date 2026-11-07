import { Button } from '@repo/ui/components/button';
import { Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type {
  HabitImportChoice,
  HabitImportDraft,
  HabitImportReader,
  HabitImportReview,
  WorkspacePort,
} from '#application';
import { HabitImportPendingSave } from '#application';
import { useI18n } from '#shared/i18n';
import { WorkspaceDialog } from '#shared/ui/WorkspaceDialog';
import { ImportGroup, defaultImportChoice } from './ImportGroup';
import { ImportReview } from './ImportReview';
import { ImportSource } from './ImportSource';
import { ImportWarnings } from './ImportWarnings';

export function ImportHabits({
  reader,
  workspace,
  destination,
}: {
  reader: HabitImportReader;
  workspace: WorkspacePort;
  destination: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload size={14} />
        {t('habitImport.title')}
      </Button>
      {open && (
        <ImportDialog
          reader={reader}
          workspace={workspace}
          destination={destination}
          close={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ImportDialog({
  reader,
  workspace,
  destination,
  close,
}: {
  reader: HabitImportReader;
  workspace: WorkspacePort;
  destination: string;
  close: () => void;
}) {
  const { t } = useI18n();
  const [source, setSource] = useState<'ticktick' | 'rillday'>('ticktick');
  const [draft, setDraft] = useState<HabitImportDraft>();
  const [choices, setChoices] = useState<HabitImportChoice[]>([]);
  const [review, setReview] = useState<HabitImportReview>();
  const [busy, setBusy] = useState<'read' | 'save' | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const phaseHeadingRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const phase = done ? 'complete' : review ? 'review' : 'select';
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    phaseHeadingRef.current?.focus({ preventScroll: true });
  }, [phase]);
  useEffect(() => () => controllerRef.current?.abort(), [workspace]);

  function change(key: string, patch: Partial<HabitImportChoice>) {
    setChoices((previous) =>
      previous.map((choice) => (choice.key === key ? { ...choice, ...patch } : choice)),
    );
    setReview(undefined);
    setError('');
  }

  function fail(reason: unknown) {
    setError(reason instanceof Error ? reason.message : 'invalid_import_format');
  }

  async function read(file: File) {
    controllerRef.current?.abort();
    const job = new AbortController();
    controllerRef.current = job;
    setBusy('read');
    setError('');
    setDraft(undefined);
    setReview(undefined);
    try {
      if (file.size > 8 * 1024 * 1024) {
        throw new Error('import_too_large');
      }
      const parsed = await reader.read(
        { bytes: await file.arrayBuffer(), name: file.name, source },
        job.signal,
      );
      job.signal.throwIfAborted();
      setDraft(parsed);
      setChoices(
        parsed.groups
          .filter((g) => !g.errors.length && g.records.length)
          .map((group) => ({
            ...defaultImportChoice(group),
            targetId: workspace.habitImports.suggestTarget(parsed, group.key),
          })),
      );
    } catch (reason) {
      if (!job.signal.aborted) {
        fail(reason);
      }
    } finally {
      if (!job.signal.aborted) {
        setBusy(null);
      }
    }
  }

  function preview() {
    if (!draft) {
      return;
    }
    try {
      const next = workspace.habitImports.review(draft, choices);
      setReview(next);
      setError('');
    } catch (reason) {
      fail(reason);
    }
  }

  async function apply() {
    if (!review) {
      return;
    }
    setBusy('save');
    setError('');
    try {
      if (savePending) {
        await workspace.retrySave();
      } else {
        await workspace.habitImports.apply(review);
      }
      setSavePending(false);
      setDone(true);
    } catch (reason) {
      const state = workspace.getSnapshot();
      if (savePending || reason instanceof HabitImportPendingSave) {
        setSavePending(true);
        setError(state.error || 'save_failed');
      } else {
        setReview(undefined);
        if (state.saveState === 'error') {
          setError('save_before_import');
        } else {
          fail(reason);
        }
      }
    } finally {
      setBusy(null);
    }
  }

  const counts = (action: string) =>
    review?.days.filter((day) => day.action === action).length ?? 0;

  const changedCount = counts('add') + counts('replace');
  const canPreview =
    draft &&
    choices.length > 0 &&
    choices.every((c) => c.confirmed) &&
    error !== 'save_before_import';
  return (
    <WorkspaceDialog
      wide
      bodyRef={bodyRef}
      closeDisabled={busy === 'save'}
      title={t('habitImport.title')}
      description={t('habitImport.description')}
      onClose={() => {
        if (busy !== 'save') {
          close();
        }
      }}
      footer={
        <>
          <Button
            variant="ghost"
            disabled={busy === 'save'}
            onClick={() => (review && !done && !savePending ? setReview(undefined) : close())}
          >
            {t(
              done || savePending ? 'common.close' : review ? 'habitImport.back' : 'common.cancel',
            )}
          </Button>
          {!done && (
            <Button
              disabled={Boolean(busy) || !canPreview}
              onClick={() => (review ? void apply() : preview())}
            >
              {t(
                busy === 'save'
                  ? 'habitImport.saving'
                  : savePending
                    ? 'habitImport.retrySave'
                    : review
                      ? changedCount
                        ? 'habitImport.confirm'
                        : 'habitImport.finish'
                      : 'habitImport.preview',
                { count: changedCount },
              )}
            </Button>
          )}
        </>
      }
    >
      <h3 ref={phaseHeadingRef} tabIndex={-1} className="text-sm font-medium outline-none">
        {t('habitImport.step.' + phase)}
      </h3>
      <p className="text-sm break-words">
        <strong>{t('habitImport.destination')}</strong> {destination}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t('habitImport.error.' + error, {
            defaultValue: t('habitImport.error.invalid_habit_import'),
          })}
        </p>
      )}
      {done ? (
        <p role="status" className="text-sm">
          {t('habitImport.saved', { count: counts('add') + counts('replace') })}
        </p>
      ) : (
        <>
          {!review && (
            <>
              <ImportSource
                source={source}
                busy={Boolean(busy)}
                change={(value) => {
                  setSource(value);
                  setDraft(undefined);
                  setChoices([]);
                  setReview(undefined);
                }}
                read={(file) => void read(file)}
              />
              {draft && (
                <ImportWarnings
                  groups={draft.groups.filter((g) => choices.some((c) => c.key === g.key))}
                />
              )}
              {busy === 'read' && (
                <p role="status" className="text-sm">
                  {t('habitImport.reading')}
                </p>
              )}
              {draft?.groups.map((group) => (
                <ImportGroup
                  previousTarget={workspace.habitImports.suggestTarget(draft, group.key)}
                  key={group.key}
                  group={group}
                  choice={choices.find((c) => c.key === group.key)}
                  habits={workspace.getSnapshot().data.habits}
                  disabled={busy === 'save'}
                  change={(patch) => change(group.key, patch)}
                  select={(checked) => {
                    setReview(undefined);
                    setChoices((before) =>
                      checked
                        ? [
                            ...before,
                            {
                              ...defaultImportChoice(group),
                              targetId: workspace.habitImports.suggestTarget(draft, group.key),
                            },
                          ]
                        : before.filter((c) => c.key !== group.key),
                    );
                  }}
                />
              ))}
            </>
          )}
          {review && (
            <ImportWarnings
              groups={review.draft.groups.filter((g) =>
                review.choices.some((c) => c.key === g.key),
              )}
            />
          )}
          {review && (
            <ImportReview
              review={review}
              disabled={busy === 'save'}
              replace={(group, date, value) => {
                if (!draft) {
                  return;
                }
                const next = choices.map((c) =>
                  c.key === group
                    ? {
                        ...c,
                        replaceDates: value
                          ? [...c.replaceDates, date]
                          : c.replaceDates.filter((d) => d !== date),
                      }
                    : c,
                );
                setChoices(next);
                try {
                  setReview(workspace.habitImports.review(draft, next));
                } catch (reason) {
                  fail(reason);
                  setReview(undefined);
                }
              }}
            />
          )}
        </>
      )}
    </WorkspaceDialog>
  );
}
