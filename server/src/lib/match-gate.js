import { query, one } from '../db.js';
import { getSetting } from '../settings.js';
import { buildMatchQualification } from './match-qualification.js';

function settingValue(setting) {
  return setting && typeof setting === 'object' && 'value' in setting ? setting.value : setting;
}

export async function getMatchGateSettings() {
  return {
    requireTest: settingValue(await getSetting('match.require_faith_test')) !== false,
    requireEndorsement: settingValue(await getSetting('match.require_verified_pastor')) !== false,
    requireCourse: settingValue(await getSetting('match.require_light_course')) !== false,
    lightCourseId: settingValue(await getSetting('match.light_course_id')),
  };
}

export async function getMatchQualification(userId) {
  const gate = await getMatchGateSettings();
  const profile = await one('SELECT completion, privacy_ok FROM profiles WHERE user_id=$1', [userId]);
  const faith = await one('SELECT church_name, testimony FROM faith_profiles WHERE user_id=$1', [userId]);
  const testRow = await one(
    `SELECT passed FROM faith_tests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  const { rows: endorsements } = await query(
    `SELECT kind, state FROM endorsements WHERE user_id = $1`,
    [userId]
  );

  let lightCourseCompleted = true;
  if (gate.requireCourse) {
    lightCourseCompleted = false;
    if (gate.lightCourseId) {
      const done = await one(
        `SELECT 1 FROM course_progress WHERE user_id = $1 AND course_id = $2 AND state = 'completed' LIMIT 1`,
        [userId, gate.lightCourseId]
      );
      lightCourseCompleted = !!done;
    }
  }

  return buildMatchQualification({
    profile,
    faith,
    faithTestPassed: gate.requireTest ? !!testRow?.passed : true,
    endorsements: gate.requireEndorsement ? endorsements : [{ kind: 'pastor', state: 'verified' }],
    lightCourseCompleted,
  });
}

export async function isInMatchPool(userId) {
  return (await getMatchQualification(userId)).inPool;
}
