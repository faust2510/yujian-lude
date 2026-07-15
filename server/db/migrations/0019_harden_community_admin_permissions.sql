-- Keep one pending application per user and authority scope.
LOCK TABLE community_admin_applications IN SHARE ROW EXCLUSIVE MODE;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, group_id
           ORDER BY created_at ASC, id ASC
         ) AS row_number
    FROM community_admin_applications
   WHERE state = 'pending'
)
DELETE FROM community_admin_applications applications
 USING ranked
 WHERE applications.id = ranked.id
   AND ranked.row_number > 1;

-- Bring legacy approved group applications in line with membership authority.
WITH approved_group_applications AS (
  SELECT DISTINCT ON (user_id, group_id)
         user_id, group_id, reviewed_by
    FROM community_admin_applications
   WHERE state = 'approved'
     AND group_id IS NOT NULL
   ORDER BY user_id, group_id, reviewed_at DESC NULLS LAST, created_at DESC, id DESC
)
UPDATE community_memberships m
   SET role = 'admin',
       approved_by = COALESCE(applications.reviewed_by, m.approved_by)
  FROM approved_group_applications applications
 WHERE m.user_id = applications.user_id
   AND m.group_id = applications.group_id
   AND m.state = 'approved'
   AND m.role = 'member';

CREATE UNIQUE INDEX IF NOT EXISTS idx_community_admin_applications_global_pending
    ON community_admin_applications(user_id)
    WHERE state = 'pending' AND group_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_community_admin_applications_group_pending
    ON community_admin_applications(user_id, group_id)
    WHERE state = 'pending' AND group_id IS NOT NULL;
