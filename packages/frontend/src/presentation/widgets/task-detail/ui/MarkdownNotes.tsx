import {
  CodeMirrorEditor,
  MDXEditor,
  type MDXEditorMethods,
  type RealmPlugin,
  codeBlockPlugin,
  codeMirrorPlugin,
  defaultSvgIcons,
  headingsPlugin,
  imagePlugin,
  linkPlugin,
  listsPlugin,
  markdownShortcutPlugin,
  quotePlugin,
  rootEditor$,
  tablePlugin,
  thematicBreakPlugin,
} from '@mdxeditor/editor';
import { Textarea } from '@repo/ui/components/textarea';
import { cn } from 'cn';
import { $setSelection, CLEAR_HISTORY_COMMAND, type LexicalEditor } from 'lexical';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Columns3,
  type LucideIcon,
  MoreHorizontal,
  Rows3,
  Trash2,
} from 'lucide-react';
import {
  type ComponentProps,
  type RefObject,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useI18n } from '#shared/i18n';

export interface NotesEditor {
  focus: () => void;
}

const icons: Record<string, LucideIcon> = {
  delete_small: Trash2,
  more_horiz: MoreHorizontal,
  add_column: Columns3,
  add_row: Rows3,
  insert_col_left: Columns3,
  insert_col_right: Columns3,
  insert_row_above: Rows3,
  insert_row_below: Rows3,
  format_align_left: AlignLeft,
  format_align_center: AlignCenter,
  format_align_right: AlignRight,
};

export function MarkdownNotes({
  documentId,
  markdown,
  readOnly,
  editorRef,
  onChange,
  onReady,
}: {
  documentId: string;
  markdown: string;
  readOnly: boolean;
  editorRef: RefObject<NotesEditor | null>;
  onChange: (value: string) => void;
  onReady: () => void;
}) {
  const { t } = useI18n();
  const { t: translateEditor } = useTranslation('editor');
  const renderIcon = useCallback<NonNullable<ComponentProps<typeof MDXEditor>['iconComponentFor']>>(
    (name) => {
      const Icon = icons[name];

      return Icon ? (
        <Icon
          size={16}
          className="inline-block shrink-0 align-middle"
          aria-label={
            name === 'add_row'
              ? t('editor.addRow')
              : name === 'add_column'
                ? t('editor.addColumn')
                : undefined
          }
        />
      ) : (
        defaultSvgIcons[name]
      );
    },
    [t],
  );
  const currentRef = useRef({ documentId, markdown });
  const applyingRef = useRef(false);
  const changeRef = useRef(onChange);
  const engineRef = useRef<LexicalEditor | null>(null);
  useLayoutEffect(() => {
    changeRef.current = onChange;
  });
  const [parseFailure, setParseFailure] = useState({ documentId, failed: false });

  if (parseFailure.documentId !== documentId) {
    // eslint-disable-next-line @eslint-react/set-state-in-effect -- Reset the document before rendering its editor.
    setParseFailure({ documentId, failed: false });
  }

  const unsupported = parseFailure.documentId === documentId && parseFailure.failed;
  const richEditorRef = useRef<MDXEditorMethods>(null);
  const sourceEditorRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(
    editorRef,
    () => ({
      focus: () => {
        if (unsupported) {
          sourceEditorRef.current?.focus();
        } else {
          richEditorRef.current?.focus();
        }
      },
    }),
    [unsupported],
  );
  useEffect(() => {
    onReady();
  }, [onReady, unsupported]);
  useEffect(() => {
    const pending = new Set<MutationObserver>();

    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing || event.keyCode === 229) {
        return;
      }

      const list = (event.target as HTMLElement).closest(
        '.td-markdown .mdxeditor-select-content[role="listbox"]',
      );

      if (!list) {
        return;
      }

      const trigger = document.querySelector<HTMLButtonElement>(
        `[aria-controls="${CSS.escape(list.id)}"]`,
      );

      if (!trigger) {
        return;
      }

      // Upstream suppresses close autofocus. Restore after its portal has unmounted.
      const observer = new MutationObserver(() => {
        if (list.isConnected) {
          return;
        }

        observer.disconnect();
        pending.delete(observer);
        requestAnimationFrame(() => {
          if (trigger.isConnected) {
            trigger.focus({ preventScroll: true });
          }
        });
      });
      pending.add(observer);
      observer.observe(document.body, { childList: true, subtree: true });
    };

    document.addEventListener('keydown', escape, true);

    return () => {
      document.removeEventListener('keydown', escape, true);
      pending.forEach((observer) => observer.disconnect());
    };
  }, []);
  const plugins = useMemo(() => {
    const lifecycle: RealmPlugin = {
      postInit: (realm) => {
        engineRef.current = realm.getValue(rootEditor$);
      },
    };

    return [
      headingsPlugin(),
      listsPlugin(),
      quotePlugin(),
      linkPlugin({ validateUrl: (value) => /^(https?:|mailto:|#)/i.test(value) }),
      thematicBreakPlugin(),
      tablePlugin(),
      imagePlugin({
        disableImageResize: true,
        disableImageSettingsButton: true,
        allowSetImageDimensions: false,
      }),
      codeBlockPlugin({
        codeBlockEditorDescriptors: [{ priority: -1, match: () => true, Editor: CodeMirrorEditor }],
      }),
      codeMirrorPlugin({
        codeBlockLanguages: {
          'text': 'Text',
          'js': 'JavaScript',
          'ts': 'TypeScript',
          'json': 'JSON',
          'css': 'CSS',
          'html': 'HTML',
          'python': 'Python',
          'bash': 'Shell',
          '': 'Text',
        },
      }),
      markdownShortcutPlugin(),
      lifecycle,
    ];
  }, []);
  useLayoutEffect(() => {
    engineRef.current?.setEditable(!readOnly);
    const switching = currentRef.current.documentId !== documentId;

    if (!switching && currentRef.current.markdown === markdown) {
      return;
    }

    currentRef.current = { documentId, markdown };

    if (!unsupported) {
      // Reuse the surface, replace the document before paint, and isolate its undo history.
      applyingRef.current = true;
      engineRef.current?.update(
        () => {
          if (switching) {
            $setSelection(null);
            engineRef.current?.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined);
          }

          richEditorRef.current?.setMarkdown(markdown);
        },
        { discrete: true },
      );
      applyingRef.current = false;
    }
  }, [documentId, markdown, readOnly, unsupported]);

  if (unsupported) {
    return (
      <Textarea
        ref={sourceEditorRef}
        aria-label={t('tasks.description')}
        value={markdown}
        readOnly={readOnly}
        onChange={(event) => {
          currentRef.current = { documentId, markdown: event.target.value };
          changeRef.current(event.target.value);
        }}
        className={cn(
          'min-h-0 rounded-none border-0 bg-transparent dark:bg-transparent p-0 shadow-none focus-visible:ring-0',
          "td-notes block w-full border-0 bg-transparent text-foreground p-0 mt-5 outline-none text-sm [&::placeholder]:text-muted-foreground [&:focus::placeholder]:text-muted-foreground [&:placeholder-shown:focus]:min-h-16 [.task-detail_&]:rounded-none [.task-detail_&]:[caret-color:var(--foreground)] [.task-detail_&:focus]:border-0 [.task-detail_&:focus]:outline-none [.task-detail_&:focus]:shadow-[none] [.td-markdown_&]:min-h-6 [.td-markdown_&]:m-0 [.td-markdown_&]:p-0 [.td-markdown_&]:outline-none [.td-markdown_&]:whitespace-pre-wrap [.td-markdown_&]:wrap-anywhere [.td-markdown_&]:overflow-visible [.td-markdown_&[contenteditable='true']:empty:focus]:min-h-16 [.td-markdown_&[aria-hidden='true']]:absolute [.td-markdown_&[aria-hidden='true']]:inset-0 [.td-markdown_&[aria-hidden='true']]:pointer-events-none [.td-markdown_&[aria-hidden='true']]:text-muted-foreground [.td-markdown_&_>_:first-child]:mt-0 [.td-markdown_&_>_:last-child]:mb-0 td-markdown-source min-h-30 max-h-[50vh] overflow-auto [&::-webkit-scrollbar]:size-[7px] [&::-webkit-scrollbar-thumb]:rounded-lg [&::-webkit-scrollbar-thumb]:bg-scrollbar [&::-webkit-scrollbar-thumb:hover]:bg-scrollbar-hover resize-y whitespace-pre-wrap",
        )}
      />
    );
  }

  return (
    <MDXEditor
      ref={richEditorRef}
      className={String.raw`td-markdown [&_[role='listbox']]:max-w-[calc(100vw_-_16px)] [&_[role='listbox']]:max-h-[calc(100dvh_-_16px)] [&_[role='listbox']]:overflow-auto [&::-webkit-scrollbar]:size-[7px] [&::-webkit-scrollbar-thumb]:rounded-lg [&::-webkit-scrollbar-thumb]:bg-scrollbar [&::-webkit-scrollbar-thumb:hover]:bg-scrollbar-hover [&_[role='listbox']]:p-1 [&_[role='listbox']]:text-popover-foreground [&_[role='listbox']]:bg-popover [&_[role='listbox']]:border-0 [&_[role='listbox']]:ring-1 [&_[role='listbox']]:ring-foreground/10 [&_[role='listbox']]:rounded-md [&_[role='listbox']]:shadow-md [&_[role='listbox']]:[filter:none] [&_[role='listbox']]:[font-family:var(--font-sans)] [&_[role='listbox']]:text-sm [&_[role='listbox']]:leading-(--text-sm--line-height) [&_[role='dialog']]:max-w-[calc(100vw_-_16px)] [&_[role='dialog']]:max-h-[calc(100dvh_-_16px)] [&_[role='dialog']]:overflow-auto [&_[role='dialog']]:p-1 [&_[role='dialog']]:text-popover-foreground [&_[role='dialog']]:bg-popover [&_[role='dialog']]:border-0 [&_[role='dialog']]:ring-1 [&_[role='dialog']]:ring-foreground/10 [&_[role='dialog']]:rounded-md [&_[role='dialog']]:shadow-md [&_[role='dialog']]:[filter:none] [&_[role='dialog']]:[font-family:var(--font-sans)] [&_[role='dialog']]:text-sm [&_[role='dialog']]:leading-(--text-sm--line-height) [&_[role='dialog']_[role='toolbar']]:flex [&_[role='dialog']_[role='toolbar']]:items-center [&_[role='dialog']_[role='toolbar']]:flex-wrap [&_[role='dialog']_[role='toolbar']]:gap-1 [&_[role='dialog']_[role='toolbar']_button]:grid [&_[role='dialog']_[role='toolbar']_button]:place-items-center [&_[role='dialog']_[role='toolbar']_button]:w-8 [&_[role='dialog']_[role='toolbar']_button]:h-8 [&_[role='dialog']_[role='toolbar']_button]:p-0 [&_[role='dialog']_[role='toolbar']_button]:rounded-sm [&_[role='dialog']_[role='toolbar']_button]:text-inherit [&_[role='dialog']_[role='toolbar']_button:focus-visible]:bg-overlay-hover [&_[role='dialog']_[role='toolbar']_button:hover]:bg-overlay-hover [&_[role='dialog']_[role='toolbar']_button[aria-checked='true']]:bg-surface-selected [&_[role='dialog']_[role='toolbar']_button[aria-checked='true']]:text-link [&_[role='option']]:flex [&_[role='option']]:items-center [&_[role='option']]:min-h-(--overlay-item-height) [&_[role='option']]:py-1.5 [&_[role='option']]:px-(--overlay-item-inset) [&_[role='option']]:rounded-sm [&_[role='option'][data-highlighted]]:bg-overlay-hover [&_[role='option']:hover]:bg-overlay-hover [&_[role='option']:focus-visible]:[outline:2px_solid_var(--ring)] [&_[role='option']:focus-visible]:-outline-offset-2 [&_[role='dialog']_button:focus-visible]:[outline:2px_solid_var(--ring)] [&_[role='dialog']_button:focus-visible]:-outline-offset-2 [--font-body:'Pretendard_Editor',_sans-serif] [--basePageBg:var(--surface-inset)] [--baseBase:var(--surface-inset)] [--baseBgSubtle:var(--surface-inset)] [--baseBg:var(--surface-inset)] [--baseBgHover:var(--surface-hover)] [--baseBgActive:var(--surface-selected)] [--baseLine:var(--separator)] [--baseBorder:var(--control-border)] [--baseBorderHover:var(--muted-foreground)] [--baseSolid:var(--muted-foreground)] [--baseSolidHover:var(--foreground)] [--baseText:var(--foreground)] [--baseTextContrast:var(--foreground)] [--accentBg:var(--surface-selected)] [--accentBgHover:var(--surface-hover)] [--accentBgActive:var(--surface-selected)] [--accentBorder:var(--ring)] [--accentSolid:var(--primary)] [--accentText:var(--link)] [--accentTextContrast:var(--foreground)] min-w-0 text-foreground [font-family:var(--font-body)] [.td-body_&]:mt-5 [&_.mdxeditor-root-contenteditable]:relative [&_.mdxeditor-root-contenteditable_>_div:not(.mdxeditor-contenteditable-wrapper)]:absolute [&_.mdxeditor-root-contenteditable_>_div:not(.mdxeditor-contenteditable-wrapper)]:inset-0 [&_.mdxeditor-root-contenteditable_>_div:not(.mdxeditor-contenteditable-wrapper)]:pointer-events-none [&_.mdxeditor-root-contenteditable_>_div:not(.mdxeditor-contenteditable-wrapper)]:text-muted-foreground [&_table]:my-3 [&_pre]:my-3 [&_blockquote]:my-3 [&_ol]:my-3 [&_ul]:my-3 [&_p]:my-3 [&_h6]:[margin:20px_0_8px] [&_h6]:text-base [&_h6]:leading-(--text-base--line-height) [&_h6]:font-semibold [&_h5]:[margin:20px_0_8px] [&_h5]:text-base [&_h5]:leading-(--text-base--line-height) [&_h5]:font-semibold [&_h4]:[margin:20px_0_8px] [&_h4]:text-base [&_h4]:leading-(--text-base--line-height) [&_h4]:font-semibold [&_h3]:[margin:20px_0_8px] [&_h3]:text-base [&_h3]:leading-(--text-base--line-height) [&_h3]:font-semibold [&_h2]:[margin:20px_0_8px] [&_h2]:font-semibold [&_h1]:[margin:20px_0_8px] [&_h1]:font-semibold [&_h1]:text-xl [&_h1]:leading-(--text-xl--line-height) [&_h2]:text-lg [&_h2]:leading-(--text-lg--line-height) [&_.md-bold]:font-semibold [&_.md-italic]:[font-style:italic] [&_.md-strike]:line-through [&_.md-underline]:underline [&_.md-code]:[font-family:monospace] [&_.md-code]:bg-surface-selected [&_.md-code]:rounded-sm [&_.md-code]:py-[1px] [&_.md-code]:px-1 [&_.md-quote]:[border-left:2px_solid_var(--separator)] [&_.md-quote]:pl-3 [&_.md-quote]:text-muted-foreground [&_ol]:pl-6 [&_ul]:pl-6 [&_ul:has(>_[role='checkbox'])]:pl-0 [&_.md-sidebar-list]:my-1 [&_.md-check-checked]:list-none [&_.md-check-checked]:relative [&_.md-check-checked]:pl-8.5 [&_.md-check-checked]:-ml-1.5 [&_.md-check-checked]:w-[calc(100%_+_6px)] [&_.md-check-checked]:min-h-7 [&_.md-check-checked]:leading-[28px] [&_.md-check-checked]:outline-none [&_.md-check-unchecked]:list-none [&_.md-check-unchecked]:relative [&_.md-check-unchecked]:pl-8.5 [&_.md-check-unchecked]:-ml-1.5 [&_.md-check-unchecked]:w-[calc(100%_+_6px)] [&_.md-check-unchecked]:min-h-7 [&_.md-check-unchecked]:leading-[28px] [&_.md-check-unchecked]:outline-none [&_.md-check-checked::before]:[content:''] [&_.md-check-checked::before]:absolute [&_.md-check-checked::before]:box-border [&_.md-check-checked::before]:left-0 [&_.md-check-checked::before]:top-0 [&_.md-check-checked::before]:w-7 [&_.md-check-checked::before]:h-7 [&_.md-check-checked::before]:[border:6px_solid_transparent] [&_.md-check-checked::before]:rounded-[9px] [&_.md-check-checked::before]:cursor-pointer [&_.md-check-checked::before]:[background-clip:padding-box] [&_.md-check-unchecked::before]:[content:''] [&_.md-check-unchecked::before]:absolute [&_.md-check-unchecked::before]:box-border [&_.md-check-unchecked::before]:left-0 [&_.md-check-unchecked::before]:top-0 [&_.md-check-unchecked::before]:w-7 [&_.md-check-unchecked::before]:h-7 [&_.md-check-unchecked::before]:[border:6px_solid_transparent] [&_.md-check-unchecked::before]:rounded-[9px] [&_.md-check-unchecked::before]:shadow-[inset_0_0_0_1px_var(--muted-foreground)] [&_.md-check-unchecked::before]:cursor-pointer [&_.md-check-unchecked::before]:[background-clip:padding-box] [&_.md-check-checked]:text-muted-foreground [&_.md-check-checked]:line-through [&_.md-check-checked::before]:bg-primary [&_.md-check-checked::before]:shadow-[inset_0_0_0_1px_var(--primary)] [&_.md-check-checked::after]:[content:''] [&_.md-check-checked::after]:absolute [&_.md-check-checked::after]:left-[11px] [&_.md-check-checked::after]:top-[9px] [&_.md-check-checked::after]:w-[5px] [&_.md-check-checked::after]:h-2 [&_.md-check-checked::after]:border-0 [&_.md-check-checked::after]:border-r-[1.5px] [&_.md-check-checked::after]:border-b-[1.5px] [&_.md-check-checked::after]:border-solid [&_.md-check-checked::after]:border-primary-foreground [&_.md-check-checked::after]:[transform:rotate(45deg)] [&_.md-check-checked::after]:pointer-events-none [&_.md-check-checked:focus-visible::before]:[outline:2px_solid_var(--ring)] [&_.md-check-checked:focus-visible::before]:-outline-offset-6 [&_.md-check-unchecked:focus-visible::before]:[outline:2px_solid_var(--ring)] [&_.md-check-unchecked:focus-visible::before]:-outline-offset-6 [&_.md-list-nested]:list-none [&_a]:text-link [&_a]:underline [&_a]:[text-underline-offset:2px] [&_img]:max-w-full [&_img]:h-auto [&_table]:border-collapse [&_table]:block [&_table]:overflow-x-auto [&_table]:max-w-full [&_table]:whitespace-normal [&_td:not([data-tool-cell='true'])]:py-1.5 [&_td:not([data-tool-cell='true'])]:px-2 [&_td:not([data-tool-cell='true'])]:border [&_td:not([data-tool-cell='true'])]:border-separator [&_td:not([data-tool-cell='true'])]:min-w-16 [&_th:not([data-tool-cell='true'])]:py-1.5 [&_th:not([data-tool-cell='true'])]:px-2 [&_th:not([data-tool-cell='true'])]:border [&_th:not([data-tool-cell='true'])]:border-separator [&_th:not([data-tool-cell='true'])]:min-w-16 [&_table_tfoot_th:last-child]:min-w-6 [&_table_tfoot_th:last-child]:w-6 [&_table_tfoot_th:last-child]:h-6 [&_table_tfoot_th:last-child]:p-0 [&_table_tfoot_th:last-child]:border-0 [&_table_tfoot_th:last-child]:bg-transparent [&_table_tfoot_th:first-child]:min-w-6 [&_table_tfoot_th:first-child]:w-6 [&_table_tfoot_th:first-child]:h-6 [&_table_tfoot_th:first-child]:p-0 [&_table_tfoot_th:first-child]:border-0 [&_table_tfoot_th:first-child]:bg-transparent [&_table_thead_th:first-child]:min-w-6 [&_table_thead_th:first-child]:w-6 [&_table_thead_th:first-child]:h-6 [&_table_thead_th:first-child]:p-0 [&_table_thead_th:first-child]:border-0 [&_table_thead_th:first-child]:bg-transparent [&_table_[data-tool-cell='true']]:min-w-6 [&_table_[data-tool-cell='true']]:w-6 [&_table_[data-tool-cell='true']]:h-6 [&_table_[data-tool-cell='true']]:p-0 [&_table_[data-tool-cell='true']]:border-0 [&_table_[data-tool-cell='true']]:bg-transparent [&_table_col:first-child]:w-6 [&_table_col:last-child]:w-6 [&_table_[data-tool-cell='true']_button]:grid [&_table_[data-tool-cell='true']_button]:place-items-center [&_table_[data-tool-cell='true']_button]:w-6 [&_table_[data-tool-cell='true']_button]:h-6 [&_table_[data-tool-cell='true']_button]:min-h-6 [&_table_[data-tool-cell='true']_button]:p-0 [&_table_[data-tool-cell='true']_button]:rounded-sm [&_table_[data-tool-cell='true']_button]:text-muted-foreground [&_table_[data-tool-cell='true']_button]:opacity-0 [&_table:focus-within_[data-tool-cell='true']_button]:opacity-60 [&_table:hover_[data-tool-cell='true']_button]:opacity-60 [&_table_[data-tool-cell='true']_button[aria-expanded='true']]:opacity-100 [&_table_[data-tool-cell='true']_button[aria-expanded='true']]:bg-surface-hover [&_table_[data-tool-cell='true']_button:focus-visible]:opacity-100 [&_table_[data-tool-cell='true']_button:focus-visible]:bg-surface-hover [&_table_[data-tool-cell='true']_button:hover]:opacity-100 [&_table_[data-tool-cell='true']_button:hover]:bg-surface-hover [&_table_button_>_svg]:w-4 [&_table_button_>_svg]:h-4 [&_table_th_>_[contenteditable]_>_p]:m-0 [&_table_td_>_[contenteditable]_>_p]:m-0 [&_hr]:border-0 [&_hr]:[border-top:1px_solid_var(--separator)] [&_hr]:my-4 [&_.cm-editor]:text-xs [&_.cm-editor]:leading-(--text-xs--line-height) [&_.cm-editor]:bg-surface-selected [&_.cm-editor]:max-w-full [&_[class*='\_codeMirrorWrapper\_']]:p-3 [&_[class*='\_codeMirrorToolbar\_']]:static [&_[class*='\_codeMirrorToolbar\_']]:flex [&_[class*='\_codeMirrorToolbar\_']]:justify-end [&_[class*='\_codeMirrorToolbar\_']]:w-full [&_[class*='\_codeMirrorToolbar\_']]:mb-2 [&_.cm-scroller]:overflow-auto [&_.cm-content]:text-foreground [&_.cm-content]:[caret-color:var(--foreground)] [&_.cm-gutters]:bg-transparent [&_.cm-activeLineGutter]:bg-transparent [&_.cm-activeLine]:bg-transparent [&_.cm-gutters]:text-muted-foreground [&_.cm-gutters]:border-0 [@media(pointer:_coarse)]:[&_table_[data-tool-cell='true']_button]:opacity-60`}
      contentEditableClassName="td-notes block w-full min-h-6 resize-none overflow-hidden border-0 bg-transparent text-foreground p-0 mt-5 outline-none leading-(--text-sm--line-height) text-sm [&::placeholder]:text-muted-foreground [&:focus::placeholder]:text-muted-foreground [&:placeholder-shown:focus]:min-h-16 [.task-detail_&]:rounded-none [.task-detail_&]:[caret-color:var(--foreground)] [.task-detail_&:focus]:border-0 [.task-detail_&:focus]:outline-none [.task-detail_&:focus]:shadow-[none] [.td-markdown_&]:min-h-6 [.td-markdown_&]:m-0 [.td-markdown_&]:p-0 [.td-markdown_&]:outline-none [.td-markdown_&]:whitespace-pre-wrap [.td-markdown_&]:wrap-anywhere [.td-markdown_&]:overflow-visible [.td-markdown_&[contenteditable='true']:empty:focus]:min-h-16 [.td-markdown_&[aria-hidden='true']]:absolute [.td-markdown_&[aria-hidden='true']]:inset-0 [.td-markdown_&[aria-hidden='true']]:pointer-events-none [.td-markdown_&[aria-hidden='true']]:text-muted-foreground [.td-markdown_&_>_:first-child]:mt-0 [.td-markdown_&_>_:last-child]:mb-0"
      markdown={markdown}
      readOnly={readOnly}
      plugins={plugins}
      placeholder={t('tasks.addDescription')}
      suppressHtmlProcessing
      trim={false}
      lexicalTheme={{
        paragraph: 'md-paragraph',
        quote: 'md-quote',
        text: {
          bold: 'md-bold',
          italic: 'md-italic',
          code: 'md-code',
          strikethrough: 'md-strike',
          underline: 'md-underline',
        },
        list: {
          listitem: 'md-sidebar-list',
          listitemChecked: 'md-check-checked',
          listitemUnchecked: 'md-check-unchecked',
          nested: { listitem: 'md-list-nested' },
        },
      }}
      translation={(key, defaultValue, interpolations) =>
        translateEditor(key, { defaultValue, ...interpolations })
      }
      iconComponentFor={renderIcon}
      onError={() => {
        engineRef.current = null;
        setParseFailure({ documentId, failed: true });
      }}
      toMarkdownOptions={{ bullet: '-', fences: true, listItemIndent: 'one' }}
      onChange={(value, initial) => {
        if (initial || applyingRef.current || value === currentRef.current.markdown) {
          return;
        }

        currentRef.current.markdown = value;
        changeRef.current(value);
      }}
    />
  );
}
