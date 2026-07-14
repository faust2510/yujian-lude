function normalize(config) {
  const points = Number(config?.points)
  const days = Number(config?.days)
  if (!Number.isFinite(points) || points <= 0 || !Number.isFinite(days) || days <= 0) return null
  return { points, days }
}

export function redemptionCost(requestedDays, config) {
  const redemption = normalize(config)
  if (!redemption || !Number.isInteger(requestedDays) || requestedDays < 1) return null
  return Math.ceil((requestedDays * redemption.points) / redemption.days)
}

export function redeemableDays(balance, config) {
  const redemption = normalize(config)
  if (!redemption) return 0
  return Math.floor((Math.max(0, Number(balance) || 0) * redemption.days) / redemption.points)
}
