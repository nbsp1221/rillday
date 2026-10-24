import type { TFunction } from 'i18next';

export function operationError(t: TFunction, code: string, fallbackKey: string) {
  return t(code, { ns: 'errors', defaultValue: t(fallbackKey) });
}

export function syncError(t: TFunction, code: string) {
  return operationError(t, code, 'connection.connectFailed');
}
