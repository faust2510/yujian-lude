const DEEP_KEYS = ['education', 'goal', 'presbytery', 'min_faith_years', 'has_badge'];

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function invalid(error) {
  return { ok: false, status: 400, error };
}

function textValue(value, label) {
  if (!hasValue(value)) return { value: undefined };
  if (typeof value !== 'string') return { error: `${label}格式不正确` };
  const normalized = value.trim();
  if (normalized.length > 100) return { error: `${label}不能超过 100 个字符` };
  return { value: normalized };
}

function integerValue(value, { label, min, max }) {
  if (!hasValue(value)) return { value: undefined };
  if (typeof value !== 'string' && typeof value !== 'number') return { error: `${label}格式不正确` };
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < min || normalized > max) {
    return { error: `${label}须为 ${min} 至 ${max} 的整数` };
  }
  return { value: normalized };
}

export function normalizeMatchFilters(input = {}, { vipPlan = null } = {}) {
  const deepRequested = DEEP_KEYS.some((key) => hasValue(input[key]));
  if (deepRequested && vipPlan !== 'pro') {
    return { ok: false, status: 403, error: '深度筛选仅向 Pro 开放', upsell: true };
  }

  const minAge = integerValue(input.min_age, { label: '最小年龄', min: 18, max: 100 });
  if (minAge.error) return invalid(minAge.error);
  const maxAge = integerValue(input.max_age, { label: '最大年龄', min: 18, max: 100 });
  if (maxAge.error) return invalid(maxAge.error);
  if (minAge.value !== undefined && maxAge.value !== undefined && minAge.value > maxAge.value) {
    return invalid('最小年龄不能大于最大年龄');
  }

  const filters = {};
  if (minAge.value !== undefined) filters.minAge = minAge.value;
  if (maxAge.value !== undefined) filters.maxAge = maxAge.value;

  const textFields = [
    ['city', 'city', '城市'],
    ['education', 'education', '学历'],
    ['goal', 'goal', '婚恋目标'],
    ['denomination', 'denomination', '宗派'],
    ['presbytery', 'presbytery', '区会'],
  ];
  for (const [inputKey, outputKey, label] of textFields) {
    const parsed = textValue(input[inputKey], label);
    if (parsed.error) return invalid(parsed.error);
    if (parsed.value !== undefined) filters[outputKey] = parsed.value;
  }

  const minFaithYears = integerValue(input.min_faith_years, { label: '最低信主年数', min: 0, max: 80 });
  if (minFaithYears.error) return invalid(minFaithYears.error);
  if (minFaithYears.value !== undefined) filters.minFaithYears = minFaithYears.value;

  if (hasValue(input.has_badge)) {
    if (input.has_badge !== 'true' && input.has_badge !== 'false') return invalid('课程徽章筛选格式不正确');
    filters.hasBadge = input.has_badge === 'true';
  }

  return { ok: true, filters };
}
