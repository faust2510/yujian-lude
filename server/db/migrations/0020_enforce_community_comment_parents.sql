LOCK TABLE community_comments IN SHARE ROW EXCLUSIVE MODE;

-- Preserve legacy text while detaching links that violate the one-level model.
UPDATE community_comments child
   SET parent_id = NULL
  FROM community_comments parent
 WHERE child.parent_id = parent.id
   AND (
     child.id = parent.id
     OR child.post_id <> parent.post_id
     OR parent.parent_id IS NOT NULL
   );

CREATE OR REPLACE FUNCTION enforce_community_comment_parent()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parent community_comments%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE'
     AND (NEW.parent_id IS NOT NULL OR NEW.post_id IS DISTINCT FROM OLD.post_id)
     AND EXISTS (
       SELECT 1
         FROM community_comments child
        WHERE child.parent_id = OLD.id
     ) THEN
    IF NEW.parent_id IS NOT NULL THEN
      RAISE EXCEPTION '已有回复的评论不能改为回复' USING ERRCODE = '23514';
    END IF;
    RAISE EXCEPTION '已有回复的评论不能移动到其他帖子' USING ERRCODE = '23514';
  END IF;

  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION '评论不能回复自身' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO parent
    FROM community_comments
   WHERE id = NEW.parent_id
   FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '父评论不存在' USING ERRCODE = '23503';
  END IF;
  IF parent.post_id <> NEW.post_id THEN
    RAISE EXCEPTION '父评论不属于当前帖子' USING ERRCODE = '23514';
  END IF;
  IF parent.parent_id IS NOT NULL THEN
    RAISE EXCEPTION '仅支持一级回复' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_comments_enforce_parent ON community_comments;
CREATE TRIGGER community_comments_enforce_parent
BEFORE INSERT OR UPDATE OF post_id, parent_id ON community_comments
FOR EACH ROW
EXECUTE FUNCTION enforce_community_comment_parent();
