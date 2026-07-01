export class ProfileInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProfileInputError';
  }
}

function isValidDateParts(year, month, day) {
  const value = new Date(Date.UTC(year, month - 1, day));
  return (
    value.getUTCFullYear() === year &&
    value.getUTCMonth() === month - 1 &&
    value.getUTCDate() === day
  );
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

export function normalizeBaptismDate(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const input = String(value).trim();
  const match = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/.exec(input);
  if (!match) {
    throw new ProfileInputError('受洗时间格式不正确，请填写 YYYY、YYYY-MM 或 YYYY-MM-DD');
  }

  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : 1;
  const day = match[3] ? Number(match[3]) : 1;
  if (!isValidDateParts(year, month, day)) {
    throw new ProfileInputError('受洗时间格式不正确，请填写 YYYY、YYYY-MM 或 YYYY-MM-DD');
  }

  return `${match[1]}-${pad2(month)}-${pad2(day)}`;
}

export function normalizeFaithYears(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const input = String(value).trim();
  if (!/^\d+$/.test(input)) {
    throw new ProfileInputError('信主年数必须是 0 或正整数');
  }
  const years = Number(input);
  if (!Number.isSafeInteger(years) || years < 0 || years > 120) {
    throw new ProfileInputError('信主年数必须是 0 到 120 之间的整数');
  }
  return years;
}
