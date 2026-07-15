export const PLATFORM_TIME_ZONE = 'Asia/Shanghai';

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: PLATFORM_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function platformDateParts(value = new Date()) {
  const parts = Object.fromEntries(
    formatter.formatToParts(value)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  );
  return { year: parts.year, month: parts.month, day: parts.day };
}

export function platformDateString(value = new Date()) {
  const { year, month, day } = platformDateParts(value);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function adultCutoffDateString(value = new Date(), age = 18) {
  const { year, month, day } = platformDateParts(value);
  return `${year - age}-${pad2(month)}-${pad2(day)}`;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}
