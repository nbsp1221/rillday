import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { Toast as ToastPrimitive } from '@base-ui/react/toast';
import { ToastAction, ToastClose, ToastTitle } from '@repo/ui/components/toast';
import { X } from 'lucide-react';
import { useI18n } from '#shared/i18n';

export function WorkspaceToast({
  toast,
  canUndo,
  undo,
}: {
  toast: ToastPrimitive.Root.ToastObject<{ undoRevision?: number }>;
  canUndo: boolean;
  undo: () => unknown;
}) {
  const { t } = useI18n();

  return (
    <ToastPrimitive.Root
      toast={toast}
      className="toast pointer-events-auto bg-popover border border-control-border rounded-md shadow-[0_8px_28px_var(--shadow)] flex items-center gap-[17px] [padding:9px_10px_9px_16px] text-sm leading-(--text-sm--line-height) [&_>_span]:flex-1 [&_>_button:not(.icon-button)]:text-link [&_>_button:not(.icon-button)]:text-sm [&_>_button:not(.icon-button)]:whitespace-nowrap [&_>_button:not(.icon-button)]:p-[3px] [&_>_button:not(.icon-button)]:leading-(--text-sm--line-height) [@media(max-width:_600px)]:gap-2.5"
    >
      <ToastTitle render={<span />} className="font-normal" />
      {canUndo && (
        <ToastAction render={<ButtonPrimitive />} onClick={undo}>
          {t('common.undo')}
        </ToastAction>
      )}
      <ToastClose
        render={<ButtonPrimitive />}
        aria-label={t('common.dismiss')}
        className={
          'icon-button inline-flex items-center justify-center rounded-sm w-7 h-7 p-0 text-muted-foreground hover:text-foreground hover:bg-surface-hover'
        }
      >
        <X className="size-3.5 inline-block shrink-0 align-middle" />
      </ToastClose>
    </ToastPrimitive.Root>
  );
}
