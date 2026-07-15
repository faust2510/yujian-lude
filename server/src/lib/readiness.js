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

export async function checkRequiredTables(query, tableNames) {
  try {
    const { rows } = await query(
      `SELECT table_name,
              to_regclass('public.' || table_name) IS NOT NULL AS exists
         FROM unnest($1::text[]) AS required(table_name)`,
      [tableNames]
    );
    const missing = rows.filter((row) => !row.exists).map((row) => row.table_name);
    return {
      name: 'schema_tables',
      ok: missing.length === 0,
      ...(missing.length ? { error: new Error(`missing tables: ${missing.join(', ')}`) } : {}),
    };
  } catch (error) {
    return { name: 'schema_tables', ok: false, error };
  }
}
