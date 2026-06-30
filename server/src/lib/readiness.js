const SECRET_PATTERNS = [
  /password\s*=/i,
  /DATABASE_URL/i,
  /postgres:\/\/[^@\s]+@/i,
  /secret/i,
  /token/i,
];

export function publicErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error || 'check failed');
  if (!message) return 'check failed';
  if (SECRET_PATTERNS.some((pattern) => pattern.test(message))) return 'check failed';
  return message.slice(0, 160);
}

export function formatReadiness(results) {
  const checks = results.map((item) => ({
    name: item.name,
    ok: item.ok === true,
    ...(item.ok === true ? {} : { error: publicErrorMessage(item.error) }),
  }));
  return {
    ok: checks.every((item) => item.ok),
    checks,
  };
}
