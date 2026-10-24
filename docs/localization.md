# Localization

English is the default application language and the language used for source code, documentation and general test fixtures. A saved language preference takes precedence over the default.

Message identifiers describe their purpose, such as `tasks.moveToList` or `startup.storageUnavailable`. Keep display copy in `packages/frontend/src/presentation/shared/i18n/locales/{en,ko}/`. The application bundles both languages through i18next, with English as the fallback. The flat catalogs use dots in identifiers; they do not require nested JSON objects.

Preserve i18next context and plural suffixes when adding messages. Use interpolation for user content, rather than passing authored titles, names or notes through translation lookup. The existing `errors`, `fields`, `labels`, `sync` and `editor` namespaces own their respective messages.

Runtime and host errors carry stable codes. Translate them when presenting an error, with a localized fallback for unknown codes. Domain rules use entity identities and canonical data, never translated display names. The system inbox is stored as `Inbox`; its displayed label follows the selected language.

Korean translation values, Korean date and time recognition, and Korean input-method support remain intentional. Use English in tests that exercise ordinary behavior. Keep Korean text where the test specifically verifies Korean localization, input recognition, composition or glyph rendering.
