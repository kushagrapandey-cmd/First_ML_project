-- Coordinate collection creation/import across requests for the same learner.
CREATE OR REPLACE FUNCTION enforce_collection_limit() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM learner_profiles WHERE user_id=NEW.user_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM study_collections WHERE user_id=NEW.user_id AND (id=NEW.id OR name=NEW.name)) THEN
    RETURN NEW;
  END IF;
  IF (SELECT count(*) FROM study_collections WHERE user_id=NEW.user_id)>=50 THEN
    RAISE EXCEPTION 'The 50-collection limit was reached.'
      USING ERRCODE='23514', CONSTRAINT='study_collection_limit';
  END IF;
  RETURN NEW;
END;
$$;
-- statement
CREATE OR REPLACE TRIGGER study_collection_limit
BEFORE INSERT ON study_collections
FOR EACH ROW EXECUTE FUNCTION enforce_collection_limit();
-- statement
INSERT INTO ytguide_migrations(version) VALUES(5) ON CONFLICT DO NOTHING;
