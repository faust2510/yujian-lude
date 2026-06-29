const ACTIONS = {
  profile: { key: 'profile', label: '完善个人资料并同意匿名匹配', to: '/profile' },
  faithProfile: { key: 'faithProfile', label: '补全信仰档案', to: '/profile' },
  faithTest: { key: 'faithTest', label: '通过信仰基础测试', to: '/faith-test' },
  endorsement: { key: 'endorsement', label: '获得牧者或成熟引荐人背书', to: '/profile' },
  lightCourse: { key: 'lightCourse', label: '完成恋爱必修课', to: '/courses' },
};

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isProfileComplete(profile) {
  return !!profile?.privacy_ok && Number(profile?.completion ?? 0) >= 100;
}

function isFaithProfileComplete(faith) {
  return !!faith && hasText(faith.church_name) && hasText(faith.testimony);
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
}) {
  const requirements = {
    profileComplete: isProfileComplete(profile),
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
    gate: '需完成资料、信仰档案、信仰基础测试、牧者或成熟引荐人背书，以及恋爱必修课后进入匹配池',
  };
}
