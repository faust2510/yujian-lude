function certificationIsApproved(certification) {
  if (Array.isArray(certification)) return certification.some(certificationIsApproved);
  if (typeof certification === 'string') return certification === 'approved';
  if (certification === true) return true;
  return certification?.state === 'approved';
}

export function isCertifiedPastor(user, certification) {
  if (!user) return false;
  const certificationRecord = certification
    ?? user.certifications
    ?? user.certification
    ?? user.certification_state
    ?? user.pastor_certification_state
    ?? user.has_approved_certification;

  return user.email_verified === true
    && user.is_banned === false
    && user.role === 'pastor'
    && certificationIsApproved(certificationRecord);
}

export const canAuthorCourse = isCertifiedPastor;
