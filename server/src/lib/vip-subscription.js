function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

export function buildVipPlanSnapshot(tier, plan) {
  if (tier !== 'basic') return { ok: false, error: '该套餐暂未开放申请' };
  if (!plan || plan.available !== true) return { ok: false, error: '该套餐暂未开放申请' };

  const price = Number(plan.price);
  const amountMinor = Math.round(price * 100);
  const durationDays = Number(plan.duration_days);
  const currency = cleanText(plan.currency, 12).toUpperCase();
  const name = cleanText(plan.name, 100);
  const period = cleanText(plan.period, 20);
  if (
    !Number.isFinite(price)
    || price <= 0
    || !Number.isSafeInteger(amountMinor)
    || amountMinor < 1
    || amountMinor > 2_147_483_647
    || Math.abs(price * 100 - amountMinor) > 1e-6
    || !Number.isInteger(durationDays)
    || durationDays < 1
    || durationDays > 365
    || !/^[A-Z]{3,12}$/.test(currency)
    || !name
    || !period
  ) {
    return { ok: false, error: '套餐配置不完整，请联系管理员' };
  }

  return {
    ok: true,
    value: {
      tier,
      name,
      price,
      amountMinor,
      currency,
      period,
      durationDays,
    },
  };
}

export function normalizeVipSubscriptionRequest({
  tier,
  paymentReference,
  applicantNote,
} = {}) {
  if (tier !== 'basic') return { ok: false, error: '该套餐暂未开放申请' };
  const reference = cleanText(paymentReference, 32);
  if (reference.length < 4 || reference.length > 32) {
    return { ok: false, error: '付款流水尾号需为 4 至 32 个字符' };
  }
  if (!/^[A-Za-z0-9-]+$/.test(reference)) {
    return { ok: false, error: '付款流水尾号只能包含字母、数字或连字符' };
  }
  const note = cleanText(applicantNote, 500);
  return {
    ok: true,
    value: {
      tier,
      paymentReference: reference,
      applicantNote: note || null,
    },
  };
}

export function normalizeVipSubscriptionReview({
  action,
  note,
  paymentConfirmationReference,
} = {}) {
  if (!['approve', 'reject'].includes(action)) {
    return { ok: false, error: 'action 须为 approve 或 reject' };
  }
  const reviewNote = cleanText(note, 1000);
  if (action === 'reject' && !reviewNote) {
    return { ok: false, error: '驳回申请时必须填写原因' };
  }
  const confirmationReference = cleanText(paymentConfirmationReference, 100);
  if (action === 'approve') {
    if (confirmationReference.length < 6 || confirmationReference.length > 100) {
      return { ok: false, error: '批准时必须填写 6 至 100 位完整核款凭据' };
    }
    if (!/^[A-Za-z0-9_-]+$/.test(confirmationReference)) {
      return { ok: false, error: '核款凭据只能包含字母、数字、连字符或下划线' };
    }
  }
  return {
    ok: true,
    value: {
      state: action === 'approve' ? 'approved' : 'rejected',
      reviewNote: reviewNote || null,
      paymentConfirmationReference: action === 'approve' ? confirmationReference : null,
    },
  };
}
