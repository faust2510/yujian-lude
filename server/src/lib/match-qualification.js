const ACTIONS = {
  profile: { key: 'profile', label: '完善成年个人资料并同意匿名匹配', to: '/profile' },
  faithProfile: { key: 'faithProfile', label: '补全信仰档案', to: '/profile' },
  faithTest: { key: 'faithTest', label: '通过信仰基础测试', to: '/faith-test' },
  endorsement: { key: 'endorsement', label: '获得牧者或引荐人背书', to: '/profile' },
  lightCourse: { key: 'lightCourse', label: '完成恋爱必修课', to: '/courses' },
};

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasDate(value) {
  if (hasText(value)) return true;
  return value instanceof Date && Number.isFinite(value.getTime());
}

function hasAdultBirthYear(value, now = new Date()) {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1940 && year <= now.getUTCFullYear() - 18;
}

function isProfileComplete(profile, now) {
  return !!profile?.privacy_ok &&
    Number(profile?.completion ?? 0) >= 100 &&
    hasAdultBirthYear(profile?.birth_year, now);
}

function isFaithProfileComplete(faith) {
  const faithYears = Number(faith?.faith_years);
  return !!faith &&
    hasText(faith.church_name) &&
    hasText(faith.presbytery) &&
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

  return {
    ...requirements,
    inPool: missing.length === 0,
    missing,
    nextActions: missing.map((key) => ACTIONS[key]),
    gate: '需出生年份符合平台成年范围，并完成资料、信仰档案、信仰基础测试、牧者或引荐人背书，以及恋爱必修课后进入匹配池',
  };
}
