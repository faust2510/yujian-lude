function normalizedRedemption(config) {
  const points = Number(config?.points);
  const days = Number(config?.days);
  if (!Number.isFinite(points) || points <= 0 || !Number.isFinite(days) || days <= 0) {
    throw new Error('VIP 兑换配置无效');
  }
  return { points, days };
}

export function calculateVipRedemptionCost(requestedDays, config) {
  if (!Number.isInteger(requestedDays) || requestedDays < 1) {
    throw new Error('兑换天数必须是正整数');
  }
  const redemption = normalizedRedemption(config);
  return Math.ceil((requestedDays * redemption.points) / redemption.days);
}

export function maxRedeemableVipDays(balance, config) {
  const redemption = normalizedRedemption(config);
  const available = Math.max(0, Number(balance) || 0);
  return Math.floor((available * redemption.days) / redemption.points);
}
