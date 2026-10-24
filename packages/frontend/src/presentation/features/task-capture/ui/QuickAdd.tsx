import { Tag } from 'lucide-react';
import { type KeyboardEvent, type RefObject, useRef, useState } from 'react';
import { Autocomplete } from 'react-aria-components/Autocomplete';
import { ListBox, ListBoxItem } from 'react-aria-components/ListBox';
import { TextArea, TextField } from 'react-aria-components/TextField';
import {
  dateKey,
  parseQuickInput,
  prepareTaskCapture,
  workspaceLabelColor,
  workspaceLabels,
} from '#application';
import { useAppPreferences } from '#entities/preferences';
import { type CaptureDraft, useWorkspace } from '#entities/workspace';
import { useI18n } from '#shared/i18n';
import { WorkspacePopover } from '#shared/ui/WorkspacePopover';
import { QuickAddActions } from './QuickAddActions';

const emptyDraft = (): CaptureDraft => ({
  text: '',
  due: '',
  manualDate: false,
  priority: '',
  time: undefined,
  duration: undefined,
  repeat: undefined,
});

export function QuickAdd({
  listId,
  date,
  tag,
  parentId,
  draftKey,
  boundary,
}: {
  listId?: string;
  date?: string;
  tag?: string;
  parentId?: string;
  draftKey?: string;
  boundary: RefObject<HTMLDivElement | null>;
}) {
  const { t } = useI18n();
  const { preferences } = useAppPreferences();
  const { data, taskActions, notify, captureDrafts } = useWorkspace();
  const key = draftKey ?? [listId, date, tag, parentId].join(':');
  const [draft, setDraft] = useState(() => captureDrafts.get(key) ?? emptyDraft());
  const draftRef = useRef(draft);
  const [inputFocused, setInputFocused] = useState(false);
  const [caret, setCaret] = useState(draft.text.length);
  const [dismissed, setDismissed] = useState(false);
  const composingRef = useRef(false);
  const refRef = useRef<HTMLTextAreaElement>(null);
  const captureRef = useRef<HTMLDivElement>(null);
  const prefix = draft.text.slice(0, caret);
  const match = prefix.match(/(?:^|\s)#([^\s#]*)$/u);
  const tokenStart = match ? caret - match[1].length - 1 : caret;
  const remainingToken = draft.text.slice(caret).match(/^[^\s#]*/u)?.[0].length ?? 0;
  const tokenEnd = caret + remainingToken;
  const tags = workspaceLabels(data)
    .filter(
      (value) =>
        match &&
        value.toLocaleLowerCase().startsWith(match[1].toLocaleLowerCase()) &&
        value !== draft.text.slice(tokenStart + 1, tokenEnd),
    )
    .slice(0, 6);
  const showSuggestions =
    inputFocused && !dismissed && !composingRef.current && Boolean(match) && tags.length > 0;

  function change(patch: Partial<CaptureDraft>) {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    captureDrafts.set(key, next);
    setDraft(next);
  }

  function chooseTag(value: string) {
    const suffix = draftRef.current.text.slice(tokenEnd);
    const insertion = `#${value}${/^\s/.test(suffix) ? '' : ' '}`;
    change({ text: draftRef.current.text.slice(0, tokenStart) + insertion + suffix });
    setDismissed(true);
    const position = tokenStart + insertion.length;
    requestAnimationFrame(() => {
      refRef.current?.focus();
      refRef.current?.setSelectionRange(position, position);
      setCaret(position);
    });
  }

  function submit() {
    if (composingRef.current || !draftRef.current.text.trim()) {
      return;
    }

    const { pending, rejected } = prepareTaskCapture(
      draftRef.current,
      { listId, date, tag, parentId },
      preferences,
    );
    const result = pending.length ? taskActions.createMany(pending) : null;

    if (result?.status === 'failed') {
      return;
    }

    const count = result?.status === 'applied' ? result.value.length : 0;

    if (count) {
      change({ ...emptyDraft(), text: rejected.join('\n') });
      setCaret(rejected.join('\n').length);
      setDismissed(false);
      refRef.current?.focus();

      if (count > 1) {
        notify(t('tasks.addedCount', { count }), { undoable: true });
      }
    }

    if (rejected.length) {
      notify(t('tasks.titleRequired'));
    }
  }

  function updateText(value: string, position: number) {
    const previous = parseQuickInput(draftRef.current.text, dateKey(), preferences);
    const next = parseQuickInput(value, dateKey(), preferences);
    const oldPriority = draftRef.current.text.match(/(?:^|\s)[!！][1-4](?=\s|$)/g)?.join('');
    const newPriority = value.match(/(?:^|\s)[!！][1-4](?=\s|$)/g)?.join('');
    const changedTime = next.time && next.time !== previous.time;
    change({
      text: value,
      ...(newPriority && newPriority !== oldPriority ? { priority: '' } : {}),
      ...(next.date &&
      (next.date !== previous.date ||
        (changedTime && draftRef.current.manualDate && !draftRef.current.due))
        ? { manualDate: false }
        : {}),
      ...(changedTime ? { time: undefined } : {}),
      ...(JSON.stringify(next.repeat) !== JSON.stringify(previous.repeat)
        ? { repeat: undefined }
        : {}),
    });
    setCaret(position);
    setDismissed(false);
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.defaultPrevented) {
      return;
    }

    if (event.nativeEvent.isComposing || composingRef.current || event.keyCode === 229) {
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();

      submit();
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();

      if (showSuggestions) {
        setDismissed(true);
      } else {
        refRef.current?.blur();
      }
    }
  }

  return (
    <div
      ref={captureRef}
      className="quick-add [--capture-target:24px] [--capture-inset:12px] relative rounded-md bg-muted border border-transparent focus-within:border-ring text-muted-foreground [transition:border-color_0.12s] [container-type:inline-size] [&_textarea]:flex-1 [&_textarea]:min-w-0 [&_textarea]:my-[calc((var(--capture-target)_-_1lh)_/_2)] [&_textarea]:resize-none [&_textarea]:p-0 [&_textarea]:bg-transparent [&_textarea]:border-0 [&_textarea]:text-sm [&_textarea]:leading-(--text-sm--line-height) [&_textarea]:max-h-40 [&_textarea:focus]:[outline:0] [&_textarea:focus]:shadow-[none] [@media(pointer:_coarse)]:[--capture-target:28px]"
    >
      <div className="quick-add-line flex items-center gap-3 py-3 px-(--capture-inset) min-h-12">
        <Autocomplete inputValue={match?.[1] ?? ''} disableAutoFocusFirst>
          <TextField
            value={draft.text}
            onChange={(value) => updateText(value, refRef.current?.selectionStart ?? value.length)}
            onFocusChange={() => setInputFocused(document.activeElement === refRef.current)}
            aria-label={t('tasks.quickAdd')}
            className="flex min-w-0 flex-1"
          >
            <TextArea
              ref={refRef}
              id="quick-add-input"
              rows={1}
              placeholder={t('tasks.new')}
              title={t('tasks.quickAddPlaceholder')}
              onSelect={(event) => {
                setCaret(event.currentTarget.selectionStart);

                if (event.currentTarget.selectionStart !== event.currentTarget.selectionEnd) {
                  setDismissed(true);
                }
              }}
              onCompositionStart={() => {
                composingRef.current = true;
              }}
              onCompositionEnd={(event) => {
                composingRef.current = false;
                setCaret(event.currentTarget.selectionStart);
                setDismissed(false);
              }}
              onKeyDown={keyDown}
              className={
                'field-sizing-content w-full min-h-0 rounded-none border-0 bg-transparent p-0 shadow-none outline-none'
              }
            />
          </TextField>
          {showSuggestions && (
            <WorkspacePopover
              modal={false}
              anchor={captureRef}
              onClose={() => setDismissed(true)}
              initialFocus={false}
              finalFocus={false}
              side="top"
              collisionBoundary={boundary.current ?? undefined}
              className="tag-suggestions flex flex-col w-[min(var(--anchor-width),_calc(100vw_-_16px))] min-w-45 overflow-hidden p-1"
              role="presentation"
              aria-label={t('labels.suggestions')}
            >
              <ListBox
                aria-label={t('labels.suggestions')}
                onAction={(value) => chooseTag(String(value))}
                className="min-h-0 overflow-auto outline-none"
              >
                {tags.map((value) => (
                  <ListBoxItem
                    id={value}
                    key={value}
                    textValue={value}
                    className="workspace-option outline-none data-focused:bg-overlay-hover"
                  >
                    <Tag
                      style={{ color: workspaceLabelColor(data, value) }}
                      className="size-3.5 inline-block shrink-0 align-middle"
                    />
                    {value}
                  </ListBoxItem>
                ))}
              </ListBox>
              <p className="tag-suggestion-hint shrink-0 my-1 mx-2 [padding:5px_0_2px] text-muted-foreground text-xs leading-(--text-xs--line-height)">
                {t('labels.suggestionInstructions')}
              </p>
            </WorkspacePopover>
          )}
        </Autocomplete>
        <QuickAddActions draft={draft} date={date} change={change} submit={submit} />
      </div>
    </div>
  );
}
