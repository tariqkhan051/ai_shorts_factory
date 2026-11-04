import type { LiveSpendConfirmationPayload } from '@ai-shorts-factory/flow-adapter';

const globalForConfirm = globalThis as typeof globalThis & {
  __asfSpendConfirmations?: Map<string, LiveSpendConfirmationPayload>;
};

function store(): Map<string, LiveSpendConfirmationPayload> {
  if (!globalForConfirm.__asfSpendConfirmations) {
    globalForConfirm.__asfSpendConfirmations = new Map();
  }
  return globalForConfirm.__asfSpendConfirmations;
}

export function saveSpendConfirmation(confirmation: LiveSpendConfirmationPayload): void {
  store().set(confirmation.token, confirmation);
}

export function getSpendConfirmation(token: string): LiveSpendConfirmationPayload | undefined {
  return store().get(token);
}

export function consumeSpendConfirmation(token: string): LiveSpendConfirmationPayload | undefined {
  const value = store().get(token);
  if (value) {
    store().delete(token);
  }
  return value;
}
