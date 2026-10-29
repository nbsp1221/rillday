# UI conventions

## Brand and color roles

The Daybreak mark uses Iris (`#7060c3`). Primary buttons use `#6450b2` with white text and `#503d96` on hover. Dark emphasis uses `#beb0fa` with `#281c55`; light emphasis uses the darker primary tone with white. Use shared tokens for links, selection, focus and charts. Priority and status colors retain separate semantic roles.

Shared components and semantic tokens define the interface across web and Windows. Reuse them for new screens; change a shared role before adding a competing local override.

## Theme and layout

Product colors, radii, typography and density tokens belong in `packages/frontend/src/presentation/app/entrypoint/workspace.css`. The UI package supplies the standard shadcn theme mappings and base layer. Official CLI output lives in `packages/ui/src/components` and is excluded from project linting and formatting; TypeScript, builds and interaction checks still cover it. Keep official generated components unchanged; compose their documented props, variants and library primitives in the renderer for product layouts. Do not add product selector stylesheets or parent selectors that change another component's private geometry. User-selected list, label and habit colors are data and remain independent of the theme.

The primary rail is permanent. Tasks have a collapsible content sidebar; Settings categories remain visible. `WorkspaceHeader` owns the 56px page header and 36px tools, or 32px tools in compact density. Page insets are 20px on desktop and 16px below 900px. Details are contextual inset cards; they must not add document-level overflow. Scope editor styles to the detail body because upstream editors also create document-level portals.

Use Lucide components directly, with explicit sizes: navigation 24px, sidebar 18px, control 16px, inline 14px and micro 12px. Icons do not define their button's hit target. Labels use colored glyphs with readable neutral text, without a surrounding chip border or fill.

## Module boundaries

The renderer uses Feature-Sliced Design: `app` composes `pages`, `widgets`, `features`, `entities` and `shared`. A slice imports other slices only from lower layers, through their explicit public APIs. Keep page-specific code in its page; extract shared interactions and self-contained UI only when consumers need them. The domain and shared application layers own platform-independent rules and use cases.

Use package-local `#pages/*`, `#widgets/*`, `#features/*` and `#entities/*` entry points across slices. Within a slice, use direct relative imports. Shared primitives and small libraries have individual module entry points. TypeScript resolves the package aliases and exports. Web and Windows use the same renderer; host adapters connect persistence and native services.

The renderer stylesheet supplies product theme configuration and imports the shared shadcn base layer. Fonts retain their source definitions, and third-party editor CSS is imported into the components layer. Style editor-owned DOM with scoped utility variants through its documented component hooks; preserve portal, selection and IME behavior.

## Forms and overlays

Use official shadcn/ui Base UI Vega components and Base UI primitives for controls. Explicit submit actions submit forms; other buttons default to `type="button"`. Retain native validation, editing, IME composition, autocomplete, refs and disabled semantics.

`WorkspaceDialog` composes the official Dialog anatomy with an accessible heading, scrolling body and persistent footer. Do not nest another modal shell or form. Modal insets are 24px, or 16px below 600px. Fields have 20px separation and 8px label gaps; ordinary controls are 36px in comfortable density and 32px in compact density. Destructive secondary actions stay separate from the primary footer action.

Use Dropdown Menu and Context Menu for commands; use Popover for form editing. Select handles fixed choices. Base UI owns placement, collision handling, focus containment and dismissal. Surfaces use the standard popover theme color and Vega ring; floating choices use its standard medium shadow. Keep the official Menu collision inset of 5px; editing panels use 8px. Menu content has 4px padding and 32px rows; form panels use 12px/16px content insets. Preserve hover bounds, check/icon slots and text axes across items. Small auxiliary buttons use Vega's 14px text.

Base UI `Field` associates a text-sized label with its sibling control. Blank form space must not activate the control. Do not wrap multiple controls in one label. Escape dismisses one overlay layer and returns focus to its opener; composition must not trigger dismissal or submission. Editing dialogs start in a field and destructive confirmations start on Cancel.

Editable forms use Base UI `Form` and `WorkspaceField`, which composes Base UI labeling and validation with shadcn field presentation. The library owns validity, error visibility, control IDs and description associations. Validate ordinary forms on submission and revalidate edits after submission; retain deliberate field-level modes in contextual editors. Keep constraints and translated error messages in their owning feature. Use native constraints and `Field.Error` matches instead of duplicating error state or manually focusing invalid controls. Specialized numeric and choice controls can use Base UI primitives directly; read-only displays do not need editable-form validation.

Use the libraries' standard Menu, Select and Radio keyboard behavior without extra key handlers. Editing popovers use Base UI's `trap-focus` mode with its accessible Close part; capture suggestions remain non-modal. Search can open above a picker and restore its previous editor through the library's focus management.

Primary buttons use readable contrasting text in both themes. Use the official outline variant with product danger colors for secondary deletion and the destructive variant for a confirmed primary deletion. Enabled hover, focus and disabled states must retain geometry. Normal text requires at least 4.5:1 contrast.

## Dates and identity fields

Capture and task details share the date, time, duration and repeat controls. Picker property rows keep one label/value axis and open contextual choices without replacing the calendar. Calendar headers use localized combined period navigation. DayPicker owns the day grid; React Aria ListBox owns month/year grid focus, keyboard navigation and typeahead. Base UI Combobox owns time-option navigation; product code retains time grammar and commit rules. Weekday order follows the saved week-start preference. Timed schedules display in the device zone; date-only values keep their date.

Color fields show a small swatch and current value in one 36px control. Presets and custom color editing open in a compact popover, rather than expanding the parent form. React Aria owns color parsing, keyboard interaction and accessible color controls. Its standard HEX field accepts three or six digits and rejects invalid characters immediately. Partial input must not overwrite a valid saved value. Parent Save/Cancel owns the edit transaction.

Habit identity uses the shared SVG resolver, localized icon names and keyboard selection. Preserve existing unknown imported glyphs. Goal/frequency controls show only relevant fields, use Base UI NumberField with locale-aware parsing and product bounds and commit through the modal. Completed history-date hover retains the habit color and contrast-aware numeral color.

## Capture and task editing

The capture composer keeps its date, priority and submit controls on a stable axis. React Aria Autocomplete owns label suggestion navigation, scrolling and accessibility while the product owns the caret's current token and task submission. Suggestions remain in a viewport-clamped shared popover and retain input focus. Home/End navigate an open suggestion list; Tab advances without accepting a suggestion. Textarea sizing uses native CSS. Manual property choices take precedence over inferred metadata. Escape closes suggestions first; Enter respects composition and any explicitly selected suggestion. Invalid content remains editable. Drafts belong to their current scope and workspace partition.

Task titles and Markdown descriptions are direct editors. The web interface uses local Pretendard subsets; the Windows interface uses the complete local font. MDXEditor uses the complete local font on both platforms to preserve Korean IME caret geometry. Do not intercept native composition or selection to compensate for typography.

Task views share canonical scope order and view controls. Smart views, custom lists and labels retain the same row geometry and action slots. Completion, restore, trash and reordering use existing domain commands and undo boundaries.

## Drag and keyboard access

Reuse dnd-kit providers, sensors, collision detection, overlays and auto-scroll. Keep the task preview compact and clear of its destination. Manual ordering uses a 2px insertion line and a 12px terminal hit extension. Sidebar destinations highlight the exact row; the calendar preview occupies the same layout position as the committed task. Save on release; cancellation, outside drops and no-ops leave data unchanged.

Keep equivalent menu and keyboard actions. Task rows support Up/Down, Home/End, Enter for details, F2 for title editing, Space for completion and Shift+F10 for actions. Manual reorder shortcuts use Ctrl+Alt+Up/Down/Home/End and retain row focus. Announce drag results in clipped live regions that cannot extend the document.

## Localization and verification

All visible text and accessible names use the shared Korean/English catalog. Format dates, quantities and calendar labels consistently. User-authored content is not translated. Use the same translated area labels in navigation, page headings and startup choices.

For shared UI changes, check both themes and languages, narrow and short layouts, long text, mouse hover, visible keyboard focus, touch targets and reduced motion. Measure stable control bounds, content insets, label/value axes and clipping in the rendered interface. Test nested overlays, Escape focus return, composition, Save/Cancel and persistence as relevant to the change.
