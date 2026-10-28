-- Enforce the same quota for individual bookmarks and atomic guest imports.
-- Lock the parent row before counting so concurrent requests cannot share a slot.
CREATE OR REPLACE FUNCTION enforce_bookmark_lesson_limit() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM learner_lessons
    WHERE user_id=NEW.user_id AND video_id=NEW.video_id FOR UPDATE;
  -- ON CONFLICT retries must remain harmless, including when the lesson is full.
  IF EXISTS (SELECT 1 FROM lesson_bookmarks WHERE user_id=NEW.user_id AND id=NEW.id) THEN
    RETURN NULL;
  END IF;
  IF (SELECT count(*) FROM lesson_bookmarks WHERE user_id=NEW.user_id AND video_id=NEW.video_id)>=100 THEN
    RAISE EXCEPTION 'The 100-bookmark lesson limit was reached.'
      USING ERRCODE='23514', CONSTRAINT='bookmark_lesson_limit';
  END IF;
  RETURN NEW;
END;
$$;
-- statement
CREATE OR REPLACE TRIGGER bookmark_lesson_limit
BEFORE INSERT ON lesson_bookmarks
FOR EACH ROW EXECUTE FUNCTION enforce_bookmark_lesson_limit();
-- statement
INSERT INTO ytguide_migrations(version) VALUES(4) ON CONFLICT DO NOTHING;
