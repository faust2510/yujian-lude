import { adultCutoffDateString, platformDateString } from './platform-date.js';

const ACTIONS = {
  profile: { key: 'profile', label: '补全出生日期及成年个人资料，并同意匿名匹配', to: '/profile' },
  faithProfile: { key: 'faithProfile', label: '补全信仰档案中的地区、宗派等必填信息', to: '/profile' },
  faithTest: { key: 'faithTest', label: '通过信仰基础测试', to: '/faith-test' },
  endorsement: { key: 'endorsement', label: '获得牧者或引荐人背书', to: '/profile' },
  lightCourse: { key: 'lightCourse', label: '完成恋爱必修课', to: '/courses' },
  relationship: { key: 'relationship', label: '当前有进行中的关系，结束后可重新进入匹配池', to: '/relationships' },
};

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasDate(value) {
  if (hasText(value)) return true;
  return value instanceof Date && Number.isFinite(value.getTime());
}

function isValidDateString(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() === Number(match[2]) - 1 &&
    date.getUTCDate() === Number(match[3]);
}

function asDateString(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return platformDateString(value);
  }
  if (typeof value !== 'string') return null;
  const input = value.trim();
  return isValidDateString(input) ? input : null;
}

function hasAdultBirthDate(value, now = new Date()) {
  const birthDate = asDateString(value);
  if (!birthDate || birthDate < '1940-01-01') return false;
  return birthDate <= adultCutoffDateString(now);
}

function isProfileComplete(profile, now) {
  return !!profile?.privacy_ok &&
    Number(profile?.completion ?? 0) >= 100 &&
    hasAdultBirthDate(profile?.birth_date, now);
}

function isFaithProfileComplete(faith) {
  const faithYears = Number(faith?.faith_years);
  return !!faith &&
    hasText(faith.church_name) &&
    hasText(faith.presbytery) &&
    hasText(faith.region) &&
    hasText(faith.denomination) &&
    hasDate(faith.baptism_date) &&
    Number.isInteger(faithYears) && faithYears >= 0 &&
    hasText(faith.testimony);
}

function hasVerifiedEndorsement(endorsements = []) {
  return endorsements.some((item) =>
    ['pastor', 'referrer'].includes(item.kind) && item.state === 'verified'
  );
}

export function buildMatchQualification({
  profile,
  faith,
  faithTestPassed,
  endorsements,
  lightCourseCompleted,
  relationshipBlocked = false,
  now = new Date(),
}) {
  const requirements = {
    profileComplete: isProfileComplete(profile, now),
    faithProfileComplete: isFaithProfileComplete(faith),
    faithTestPassed: !!faithTestPassed,
    endorsementVerified: hasVerifiedEndorsement(endorsements),
    lightCourseCompleted: !!lightCourseCompleted,
  };

  const missing = [];
  if (!requirements.profileComplete) missing.push('profile');
  if (!requirements.faithProfileComplete) missing.push('faithProfile');
  if (!requirements.faithTestPassed) missing.push('faithTest');
  if (!requirements.endorsementVerified) missing.push('endorsement');
  if (!requirements.lightCourseCompleted) missing.push('lightCourse');
  if (relationshipBlocked) missing.push('relationship');

  return {
    ...requirements,
    relationshipBlocked: !!relationshipBlocked,
    inPool: missing.length === 0,
    missing,
    nextActions: missing.map((key) => ACTIONS[key]),
    gate: '需填写出生日期并年满 18 周岁，补全含地区、宗派在内的信仰档案，通过信仰基础测试，获得牧者或引荐人背书，并完成恋爱必修课后进入匹配池',
  };
}
