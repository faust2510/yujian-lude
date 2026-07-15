const MIN_PASSWORD_CHARACTERS = 8;
const MAX_PASSWORD_BYTES = 72;

export function validatePassword(password, { label = '密码', requireMinimum = true } = {}) {
  if (typeof password !== 'string') return `${label}必须是字符串`;
  if (requireMinimum && password.length < MIN_PASSWORD_CHARACTERS) return `${label}至少 8 位`;
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) return `${label}不能超过 72 字节`;
  return null;
}
