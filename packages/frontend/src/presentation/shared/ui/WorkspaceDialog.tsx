import type { ComponentProps, FormEventHandler, ReactNode } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { Form } from '@base-ui/react/form';
import { Button } from '@repo/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '@repo/ui/components/dialog';
import { cn } from 'cn';
import { X } from 'lucide-react';
import { useI18n } from '#shared/i18n';

export function WorkspaceDialog({
  title,
  description,
  children,
  footer,
  onClose,
  wide = false,
  initialFocus,
  finalFocus,
  onSubmit,
  className,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  wide?: boolean;
  initialFocus?: ComponentProps<typeof DialogPrimitive.Popup>['initialFocus'];
  finalFocus?: ComponentProps<typeof DialogPrimitive.Popup>['finalFocus'];
  onSubmit?: FormEventHandler<HTMLFormElement>;
  className?: string;
}) {
  const { t } = useI18n();
  const content = (
    <>
      <DialogHeader className="modal-header shrink-0 px-(--overlay-inset) pt-(--overlay-inset) pr-16">
        <DialogTitle className="text-base font-semibold leading-(--text-base--line-height) wrap-anywhere">
          {title}
        </DialogTitle>
      </DialogHeader>
      <div className="modal-body flex min-h-0 flex-col gap-(--layout-form-gap) overflow-auto overscroll-contain p-(--overlay-inset)">
        {description && <DialogDescription>{description}</DialogDescription>}
        {children}
      </div>
      {footer && (
        <DialogFooter className="modal-footer shrink-0 flex-row items-center justify-end gap-2 px-(--overlay-inset) pb-(--overlay-inset)">
          {footer}
        </DialogFooter>
      )}
      <DialogClose
        render={<Button variant="ghost" size="icon-sm" />}
        className="modal-close absolute top-5 right-5"
        aria-label={t('common.close')}
      >
        <X size={16} />
      </DialogClose>
    </>
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogPortal>
        <DialogOverlay className="bg-overlay supports-backdrop-filter:backdrop-blur-none" />
        <DialogPrimitive.Popup
          initialFocus={initialFocus}
          finalFocus={finalFocus}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
              event.preventDefault();
            }
          }}
          {...(!description ? { 'aria-describedby': undefined } : {})}
          className={cn(
            'modal fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-0 overflow-hidden rounded-lg ring-1 ring-foreground/10 bg-popover p-0 text-popover-foreground outline-none [@media(max-width:599px)]:[--overlay-inset:var(--layout-dialog-inset-compact)]',
            wide && 'wide w-[min(560px,calc(100vw-32px))]',
            className,
          )}
        >
          {onSubmit ? (
            <Form className="modal-layout flex min-h-0 flex-col" onSubmit={onSubmit}>
              {content}
            </Form>
          ) : (
            content
          )}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}
