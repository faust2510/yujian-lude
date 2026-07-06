-- Some upgraded databases already had these enum types before newer community
-- features added extra states. Keep this separate from 0006 because 0006 may
-- already be applied and checksummed.

ALTER TYPE post_state ADD VALUE IF NOT EXISTS 'removed';
ALTER TYPE post_state ADD VALUE IF NOT EXISTS 'featured';

ALTER TYPE notif_kind ADD VALUE IF NOT EXISTS 'post_featured';
ALTER TYPE notif_kind ADD VALUE IF NOT EXISTS 'event_new';
ALTER TYPE notif_kind ADD VALUE IF NOT EXISTS 'report_resolved';
