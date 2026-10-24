import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@repo/ui/components/resizable';
import { cn } from 'cn';
import { type FocusEvent, type ReactNode, type RefObject, useLayoutEffect, useRef } from 'react';
import { usePanelRef } from 'react-resizable-panels';
import { useI18n } from '#shared/i18n';

const sizes = {
  sidebar: { initial: 222, min: 180, max: 480 },
  detail: { initial: 360, min: 300, max: 540 },
  content: 300,
};

export function WorkspacePanels({
  appRoot,
  narrow,
  sidebarVisible,
  detailVisible,
  sidebar,
  detail,
  children,
}: {
  appRoot: RefObject<HTMLDivElement | null>;
  narrow: boolean;
  sidebarVisible: boolean;
  detailVisible: boolean;
  sidebar: ReactNode;
  detail: ReactNode;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const sidebarPanel = usePanelRef();
  const detailPanel = usePanelRef();
  const sidebarGroupRef = useRef<HTMLDivElement | null>(null);
  const detailGroupRef = useRef<HTMLDivElement | null>(null);
  const detailElementRef = useRef<HTMLDivElement | null>(null);
  const widthsRef = useRef({ sidebar: sizes.sidebar.initial, detail: sizes.detail.initial });
  const restoreWidthRef = useRef({ sidebar: false, detail: false });
  const pointerFocusRef = useRef<HTMLElement | null>(null);
  const desktopSidebar = sidebarVisible && !narrow;
  const desktopDetail = detailVisible && !narrow;
  const previousDetailRef = useRef(desktopDetail);
  const sidebarPresent = Boolean(sidebar);
  const previousSidebarRef = useRef({ visible: desktopSidebar, present: Boolean(sidebar), narrow });
  const sidebarWidth = widthsRef.current.sidebar;
  const detailWidth = widthsRef.current.detail;
  const animateSidebar =
    Boolean(sidebar) &&
    previousSidebarRef.current.present &&
    previousSidebarRef.current.visible !== desktopSidebar &&
    !previousSidebarRef.current.narrow &&
    !narrow;

  useLayoutEffect(() => {
    if (
      desktopSidebar &&
      (!previousSidebarRef.current.visible || desktopDetail !== previousDetailRef.current)
    ) {
      restoreWidthRef.current.sidebar = sidebarPanel.current?.getSize().inPixels !== sidebarWidth;
      sidebarPanel.current?.resize(sidebarWidth);
    }
    if (!desktopSidebar) {
      restoreWidthRef.current.sidebar = false;
    }
    previousSidebarRef.current = { visible: desktopSidebar, present: sidebarPresent, narrow };
  }, [desktopDetail, desktopSidebar, narrow, sidebarPresent, sidebarPanel, sidebarWidth]);

  useLayoutEffect(() => {
    if (desktopDetail && !previousDetailRef.current) {
      restoreWidthRef.current.detail = detailPanel.current?.getSize().inPixels !== detailWidth;
      detailPanel.current?.resize(detailWidth);
    }
    if (!desktopDetail) {
      restoreWidthRef.current.detail = false;
    }
    previousDetailRef.current = desktopDetail;
  }, [desktopDetail, detailPanel, detailWidth]);

  function previewWidth(pane: 'sidebar' | 'detail', width: number) {
    if (width >= sizes[pane].min) {
      appRoot.current?.style.setProperty(`--${pane}-width`, `${width}px`);
    }
  }

  function rememberWidth(pane: 'sidebar' | 'detail', percentage: number) {
    const group = pane === 'sidebar' ? sidebarGroupRef : detailGroupRef;
    // The committed layout is available before the panel's DOM measurement catches up.
    const width = Math.round(((group.current?.clientWidth ?? 0) * percentage) / 100);
    if (width >= sizes[pane].min) {
      widthsRef.current[pane] = width;
    }
  }

  function rememberFocus(event: FocusEvent<HTMLDivElement>) {
    pointerFocusRef.current =
      event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null;
  }

  function preservePointerFocus() {
    // Pointer resizing must not interrupt typing; keyboard resizing keeps separator focus.
    if (document.activeElement?.hasAttribute('data-separator')) {
      pointerFocusRef.current?.focus({ preventScroll: true });
    }
    pointerFocusRef.current = null;
  }

  return (
    <ResizablePanelGroup
      className="workspace-panels flex-1 min-w-0 relative [&[data-sidebar-transition]_>_[data-panel]]:[transition:flex-grow_200ms_ease] [&:has([data-separator='active'])_>_[data-panel]]:[transition:none] [@media(prefers-reduced-motion:_reduce)]:[&_>_[data-panel]]:[transition:none]"
      elementRef={sidebarGroupRef}
      orientation="horizontal"
      disabled={narrow}
      onLayoutChange={(layout) => {
        // The logical layout is the target width, not an intermediate animation frame.
        previewWidth(
          'sidebar',
          ((sidebarGroupRef.current?.clientWidth ?? 0) * layout['workspace-sidebar-panel']) / 100,
        );
      }}
      onLayoutChanged={(layout, { isUserInteraction }) => {
        if (isUserInteraction) {
          rememberWidth('sidebar', layout['workspace-sidebar-panel']);
        }
      }}
      onPointerDownCapture={preservePointerFocus}
      data-sidebar-transition={animateSidebar ? (desktopSidebar ? 'open' : 'closed') : undefined}
      onTransitionEnd={(event) => {
        if (event.propertyName === 'flex-grow') {
          event.currentTarget.removeAttribute('data-sidebar-transition');
        }
      }}
    >
      <ResizablePanel
        id="workspace-sidebar-panel"
        className="workspace-sidebar-panel"
        panelRef={sidebarPanel}
        defaultSize={sizes.sidebar.initial}
        minSize={desktopSidebar ? sizes.sidebar.min : 0}
        maxSize={desktopSidebar ? sizes.sidebar.max : 0}
        groupResizeBehavior="preserve-pixel-size"
        onResize={() => {
          // Reapply after measurement, once the library has the reopened panel's constraints.
          if (restoreWidthRef.current.sidebar && desktopSidebar) {
            restoreWidthRef.current.sidebar = false;
            sidebarPanel.current?.resize(sidebarWidth);
          }
        }}
        style={{ overflow: 'visible' }}
      >
        {sidebar}
      </ResizablePanel>
      <ResizableHandle
        className="resize-handle [touch-action:none] absolute w-[5px] top-0 bottom-0 z-30 [cursor:col-resize] [&::after]:[content:''] [&::after]:absolute [&::after]:top-0 [&::after]:bottom-0 [&::after]:w-[1px] [&::after]:bg-transparent [&::after]:pointer-events-none [&:hover::after]:bg-muted-foreground [@media(max-width:_850px)]:hidden [.workspace-panels_&]:relative [.workspace-panels_&]:[flex:0_0_0] [.workspace-panels_&]:top-auto [.workspace-panels_&]:bottom-auto [.workspace-panels_&]:self-stretch [.workspace-panels_&]:w-0 [.workspace-panels_&]:bg-transparent [.workspace-panels_&[hidden]]:hidden [.workspace-panels_&[data-separator='active']::after]:bg-muted-foreground [.workspace-panels_&[data-separator='hover']::after]:bg-muted-foreground [.workspace-panels_&:focus-visible::after]:bg-muted-foreground [.workspace-panels_&:focus-visible]:[outline:2px_solid_var(--ring)] [.workspace-panels_&:focus-visible]:outline-offset-2 sidebar-resize [&::after]:right-0 right-[-3px] [.workspace-panels_>_&]:left-auto [.workspace-panels_>_&]:right-auto [.workspace-panels_&::after]:right-0 [.workspace-panels_&::after]:left-auto [.workspace-panels_&::after]:[transform:none]"
        aria-label={t('panels.sidebarWidth')}
        disabled={!desktopSidebar}
        hidden={!desktopSidebar}
        disableDoubleClick
        style={{ cursor: 'col-resize' }}
        onFocusCapture={rememberFocus}
      />
      <ResizablePanel
        id="workspace-content-panel"
        className="workspace-layout flex flex-1 min-w-0 min-h-0 flex-col overflow-hidden bg-background"
        minSize={narrow ? 0 : sizes.content + (desktopDetail ? sizes.detail.min : 0)}
        style={{ overflow: 'hidden' }}
      >
        <header className="workspace-header flex items-center h-(--workspace-header-height) min-h-(--workspace-header-height) py-0 px-(--workspace-header-inset) [border-bottom:1px_solid_var(--separator)] bg-background [@media(max-width:_899px)]:[--workspace-header-inset:calc(var(--spacing)_*_4)]">
          <div id="workspace-header-content" className="flex flex-1 min-w-0 items-center gap-3" />
        </header>
        <ResizablePanelGroup
          className="workspace-body flex flex-1 min-w-0 min-h-0 overflow-hidden relative"
          elementRef={detailGroupRef}
          orientation="horizontal"
          disabled={narrow}
          onLayoutChanged={(layout, { isUserInteraction }) => {
            if (isUserInteraction) {
              rememberWidth('detail', layout['workspace-detail-panel']);
            }
          }}
        >
          <ResizablePanel
            id="workspace-main-panel"
            className="workspace-main-panel flex flex-col"
            minSize={narrow ? 0 : sizes.content}
            style={{ overflow: 'hidden' }}
          >
            {children}
          </ResizablePanel>
          <ResizableHandle
            className="resize-handle [touch-action:none] absolute top-0 bottom-0 z-30 [cursor:col-resize] [&::after]:[content:''] [&::after]:absolute [&::after]:bg-transparent [&::after]:pointer-events-none [&:hover::after]:bg-muted-foreground [@media(max-width:_850px)]:hidden [.workspace-panels_&]:relative [.workspace-panels_&]:[flex:0_0_0] [.workspace-panels_&]:top-auto [.workspace-panels_&]:bottom-auto [.workspace-panels_&]:self-stretch [.workspace-panels_&]:w-0 [.workspace-panels_&]:bg-transparent [.workspace-panels_&[hidden]]:hidden [.workspace-panels_&[data-separator='active']::after]:bg-muted-foreground [.workspace-panels_&[data-separator='hover']::after]:bg-muted-foreground [.workspace-panels_&:focus-visible::after]:bg-muted-foreground [.workspace-panels_&:focus-visible]:[outline:2px_solid_var(--ring)] [.workspace-panels_&:focus-visible]:outline-offset-2 detail-resize [&::after]:top-[50%] [&::after]:bottom-auto [&::after]:left-[50%] [&::after]:w-[3px] [&::after]:h-8 [&::after]:rounded-[2px] [&::after]:[transform:translate(-50%,_-50%)] left-0 w-(--detail-pane-inset) [.workspace-panels_.workspace-body_>_&]:absolute [.workspace-panels_.workspace-body_>_&]:left-[calc(100%_-_var(--detail-width))] [.workspace-panels_.workspace-body_>_&]:top-0 [.workspace-panels_.workspace-body_>_&]:bottom-0 [.workspace-panels_.workspace-body_>_&]:w-(--detail-pane-inset) [.workspace-panels_&::after]:left-1.5 [.workspace-panels_&::after]:[transform:translateY(-50%)]"
            aria-label={t('panels.mainWidth')}
            disabled={!desktopDetail}
            hidden={!desktopDetail}
            disableDoubleClick
            style={{ cursor: 'col-resize' }}
            onFocusCapture={rememberFocus}
          />
          <ResizablePanel
            id="workspace-detail-panel"
            className={cn(
              detailVisible
                ? 'detail-pane w-full shrink-0 relative bg-background min-h-0 p-(--detail-pane-inset) [&:empty]:hidden [@media(max-width:_899px)]:[.workspace-body_&]:flex [@media(max-width:_899px)]:[.workspace-body_&]:absolute [@media(max-width:_899px)]:[.workspace-body_&]:inset-0 [@media(max-width:_899px)]:[.workspace-body_&]:w-full [@media(max-width:_899px)]:[.workspace-body_&]:h-full [@media(max-width:_899px)]:[.workspace-body_&]:z-5 [@media(max-width:_899px)]:[.workspace-body_&]:p-2 [@media(max-width:_899px)]:[.workspace-body_&]:bg-background'
                : undefined,
            )}
            panelRef={detailPanel}
            elementRef={detailElementRef}
            defaultSize={sizes.detail.initial}
            minSize={desktopDetail ? sizes.detail.min : 0}
            maxSize={desktopDetail ? sizes.detail.max : 0}
            groupResizeBehavior="preserve-relative-size"
            onResize={({ inPixels }) => {
              if (restoreWidthRef.current.detail && desktopDetail) {
                restoreWidthRef.current.detail = false;
                detailPanel.current?.resize(detailWidth);
              }
              previewWidth(
                'detail',
                detailElementRef.current?.getBoundingClientRect().width ?? inPixels,
              );
            }}
            style={{ overflow: 'visible' }}
            hidden={!detailVisible}
          >
            {detail}
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
