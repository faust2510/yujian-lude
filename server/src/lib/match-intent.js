const INTENTS = new Set(['like', 'pass']);

export function normalizeMatchIntent(value) {
  const intent = String(value || 'like').trim();
  if (!INTENTS.has(intent)) return null;
  return intent;
}

export function statusForIntent(intent) {
  if (intent === 'pass') return 'declined';
  return 'intent_sent';
}
