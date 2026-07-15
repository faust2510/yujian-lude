const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeField(value, { label, maxLength, required = false }) {
  if (value === undefined || value === null || value === '') {
    return required
      ? { ok: false, error: `${label}为必填` }
      : { ok: true, value: null };
  }
  if (typeof value !== 'string') return { ok: false, error: `${label}格式不正确` };

  const text = value.trim();
  if (!text) {
    return required
      ? { ok: false, error: `${label}为必填` }
      : { ok: true, value: null };
  }
  if (text.length > maxLength) return { ok: false, error: `${label}不能超过 ${maxLength} 个字符` };
  return { ok: true, value: text };
}

export function normalizePastorLetterInput({
  pastorName,
  pastorContact,
  familyNote,
  faithNote,
  spiritualNote,
  churchLifeNote,
} = {}) {
  const fields = {
    pastorName: normalizeField(pastorName, { label: '牧者姓名', maxLength: 120, required: true }),
    pastorContact: normalizeField(pastorContact, { label: '牧者联系方式', maxLength: 320, required: true }),
    familyNote: normalizeField(familyNote, { label: '家庭情况', maxLength: 2000 }),
    faithNote: normalizeField(faithNote, { label: '信仰情况', maxLength: 2000 }),
    spiritualNote: normalizeField(spiritualNote, { label: '属灵生命', maxLength: 2000 }),
    churchLifeNote: normalizeField(churchLifeNote, { label: '教会生活', maxLength: 2000 }),
  };
  const invalid = Object.values(fields).find((field) => !field.ok);
  if (invalid) return { ok: false, error: invalid.error };

  return {
    ok: true,
    value: Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value])),
  };
}

export function normalizePastorLetterReviewAction(action) {
  if (action === 'approve') return true;
  if (action === 'revoke') return false;
  return null;
}

export function normalizePastorLetterReviewVersion(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  return Number.isFinite(Date.parse(text)) ? text : null;
}

export function validatePastorLetterReview({ actorId, letter, nextVerified, expectedUpdatedAt } = {}) {
  if (!letter) return '牧者介绍信不存在';
  if (String(actorId) === String(letter.user_id)) return '不能核验自己的牧者介绍信';
  if (String(letter.updated_at_version) !== expectedUpdatedAt) {
    return '牧者介绍信内容已更新，请刷新后重新核验';
  }
  if (Boolean(letter.is_verified) === nextVerified) return '牧者介绍信状态已变化，请刷新后重试';
  return null;
}

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}
