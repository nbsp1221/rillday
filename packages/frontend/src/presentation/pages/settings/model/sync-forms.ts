import type { KeyboardEvent } from 'react';

export type SyncActionRunner = (action: () => Promise<unknown>, message?: string) => Promise<void>;

export function validateForm(form: HTMLFormElement) {
  const valid = form.checkValidity();
  if (!valid) {
    form.querySelector<HTMLElement>(':invalid')?.focus();
  }
  return valid;
}

export function preventComposition(event: KeyboardEvent) {
  if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) {
    event.preventDefault();
  }
}
