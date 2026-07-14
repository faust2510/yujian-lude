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

export function normalizePastorCertificationApplication({
  churchName,
  denomination,
  contactEmail,
  ordinationInfo,
  statement,
} = {}) {
  const fields = {
    churchName: normalizeField(churchName, { label: '教会', maxLength: 200, required: true }),
    denomination: normalizeField(denomination, { label: '宗派', maxLength: 200 }),
    contactEmail: normalizeField(contactEmail, { label: '联系方式', maxLength: 320, required: true }),
    ordinationInfo: normalizeField(ordinationInfo, { label: '按立说明', maxLength: 2000 }),
    statement: normalizeField(statement, { label: '事奉说明', maxLength: 5000 }),
  };
  const invalid = Object.values(fields).find((field) => !field.ok);
  if (invalid) return { ok: false, error: invalid.error };

  return {
    ok: true,
    value: {
      churchName: fields.churchName.value,
      denomination: fields.denomination.value,
      contactEmail: fields.contactEmail.value,
      supportingDocs: {
        ordination_info: fields.ordinationInfo.value,
        statement: fields.statement.value,
      },
    },
  };
}

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function validatePastorCertificationApplicant(user) {
  if (!user || user.is_banned !== false) return '账号状态异常，暂不能申请牧者认证';
  if (user.role !== 'free') return '仅普通用户可以申请牧者认证';
  return null;
}

export function validatePastorCertificationReview({
  actorId,
  certification,
  applicant,
  action,
} = {}) {
  if (!certification) return '牧者认证申请不存在';
  if (String(actorId) === String(certification.user_id)) return '不能审核自己的牧者认证申请';
  if (certification.state !== 'pending') return '牧者认证申请状态已变化，请刷新后重试';
  if (action === 'approve') return validatePastorCertificationApplicant(applicant);
  return null;
}
