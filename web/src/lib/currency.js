export function formatCurrencyAmount(amount, currency = 'CNY') {
  const value = Number(amount)
  if (!Number.isFinite(value)) return '—'

  const code = String(currency || 'CNY').trim().toUpperCase()
  try {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'code',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${code || 'CNY'} ${value.toFixed(2)}`
  }
}
