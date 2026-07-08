-- Older databases may already have community_groups from the first community
-- prototype, but without the columns used by the current group routes.

ALTER TABLE community_groups ADD COLUMN IF NOT EXISTS category group_category NOT NULL DEFAULT 'interest';
ALTER TABLE community_groups ADD COLUMN IF NOT EXISTS join_policy group_join_policy NOT NULL DEFAULT 'apply';
ALTER TABLE community_groups ADD COLUMN IF NOT EXISTS cover_image TEXT;
