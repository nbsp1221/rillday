import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cn } from 'cn';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { type ReactNode, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '#shared/i18n';

export function SidebarToggle({
  expanded,
  controls,
  onClick,
}: {
  expanded: boolean;
  controls: string;
  onClick: () => void;
}) {
  const { t } = useI18n();

  return (
    <ButtonPrimitive
      aria-label={expanded ? t('panels.hideSidebar') : t('panels.showSidebar')}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onClick}
      className={
        'workspace-sidebar-toggle grid place-items-center w-(--workspace-control-size) h-(--workspace-control-size) -ml-2 p-0 shrink-0 text-muted-foreground rounded-md hover:text-foreground hover:bg-surface-hover'
      }
    >
      {expanded ? (
        <PanelLeftClose className="size-4.5 inline-block shrink-0 align-middle" />
      ) : (
        <PanelLeftOpen className="size-4.5 inline-block shrink-0 align-middle" />
      )}
    </ButtonPrimitive>
  );
}

/** Keep live view state and actions in the shell's single permanent header. */
export function WorkspaceHeader({
  leadingControl,
  title,
  scopeControl,
  children,
}: {
  leadingControl?: ReactNode;
  title: string;
  scopeControl?: ReactNode;
  children?: ReactNode;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    // eslint-disable-next-line @eslint-react/set-state-in-effect -- Resolve the committed header before painting its portal.
    setTarget(document.getElementById('workspace-header-content'));
  }, []);

  if (!target) {
    return null;
  }

  return createPortal(
    <>
      {leadingControl}
      <div
        className={cn(
          'workspace-identity flex-1 flex items-center gap-3 min-w-0',
          scopeControl
            ? 'has-scope-control [@media(max-width:_899px)]:[&_h1]:absolute [@media(max-width:_899px)]:[&_h1]:w-[1px] [@media(max-width:_899px)]:[&_h1]:h-[1px] [@media(max-width:_899px)]:[&_h1]:overflow-hidden [@media(max-width:_899px)]:[&_h1]:[clip-path:inset(50%)]'
            : '',
        )}
      >
        <div className="workspace-title-row flex items-center gap-[9px] min-w-0 max-w-full [&_h1]:m-0 [&_h1]:text-xl [&_h1]:leading-(--text-xl--line-height) [&_h1]:font-semibold [&_h1]:[letter-spacing:0] [&_h1]:whitespace-nowrap [&_h1]:overflow-hidden [&_h1]:text-ellipsis [@media(max-width:_600px)]:gap-1.5">
          <h1 title={title}>{title}</h1>
          {scopeControl}
        </div>
      </div>
      <div className="workspace-actions flex items-center gap-2 ml-auto shrink-0 [&_>_button]:inline-flex [&_>_button]:items-center [&_>_button]:justify-center [&_>_button]:gap-2 [&_>_button]:h-(--workspace-control-size) [&_>_button]:min-h-(--workspace-control-size) [&_>_button]:min-w-(--workspace-control-size) [&_>_button]:py-0 [&_>_button]:px-2 [&_>_button]:rounded-md [&_>_button]:text-sm [&_>_button]:text-muted-foreground [&_>_button]:leading-(--text-sm--line-height) [&_>_button:hover]:bg-surface-hover [&_>_button:hover]:text-foreground [@media(max-width:_600px)]:gap-1">
        {children}
      </div>
    </>,
    target,
  );
}
