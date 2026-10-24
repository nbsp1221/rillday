import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { useWorkspace } from '#entities/workspace';
import { useI18n } from '#shared/i18n';

export function CalendarTaskCapture() {
  const { t } = useI18n();
  const { taskActions, captureDrafts } = useWorkspace();
  const key = 'calendar:undated';
  const inputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);
  const [text, setText] = useState(() => captureDrafts.get(key)?.text ?? '');

  function change(value: string) {
    setText(value);
    captureDrafts.set(key, { text: value, due: '', manualDate: false, priority: '' });
  }

  return (
    <form
      className="calendar-task-capture [--control-height:32px] flex items-center gap-1 min-h-10 mt-2 p-[3px] border border-transparent rounded-md bg-muted focus-within:border-ring [&_input]:flex-1 [&_input]:min-w-0 [&_input]:w-full [&_input]:py-1 [&_input]:px-2 [&_input]:border-0 [&_input]:rounded-none [&_input]:bg-transparent [&_input]:text-sm [&_input]:leading-(--text-sm--line-height) [&_input:focus]:outline-none [&_input:focus]:shadow-[none]"
      onSubmit={(event) => {
        event.preventDefault();

        if (composingRef.current || !text.trim()) {
          return;
        }

        if (taskActions.create(text).status === 'applied') {
          change('');
          inputRef.current?.focus();
        }
      }}
    >
      <Input
        ref={inputRef}
        aria-label={t('calendar.addUndatedTask')}
        placeholder={t('tasks.new')}
        value={text}
        onChange={(event) => change(event.target.value)}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={() => {
          composingRef.current = false;
        }}
        onKeyDown={(event) => {
          if (
            event.key === 'Enter' &&
            (composingRef.current || event.nativeEvent.isComposing || event.keyCode === 229)
          ) {
            event.preventDefault();
          }

          if (
            event.key === 'Escape' &&
            !composingRef.current &&
            !event.nativeEvent.isComposing &&
            event.keyCode !== 229
          ) {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        className={
          'h-auto min-h-0 rounded-none border-0 bg-transparent p-0 shadow-none text-sm focus-visible:ring-0'
        }
      />
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        aria-label={t('common.add')}
        title={t('common.add')}
        disabled={!text.trim()}
        className={'size-(--control-height) text-muted-foreground hover:text-foreground'}
      >
        <Plus className="size-4 inline-block shrink-0 align-middle" />
      </Button>
    </form>
  );
}
