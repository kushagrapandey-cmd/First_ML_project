CREATE TABLE IF NOT EXISTS ytguide_migrations(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
-- statement
CREATE TABLE IF NOT EXISTS learner_profiles(user_id text PRIMARY KEY, display_name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
-- statement
CREATE TABLE IF NOT EXISTS learner_lessons(user_id text NOT NULL REFERENCES learner_profiles(user_id) ON DELETE CASCADE, video_id text NOT NULL CHECK(video_id ~ '^[A-Za-z0-9_-]{11}$'), metadata jsonb NOT NULL, saved boolean NOT NULL DEFAULT false, completed boolean NOT NULL DEFAULT false, position_seconds integer NOT NULL DEFAULT 0 CHECK(position_seconds BETWEEN 0 AND 604800), version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,video_id));
-- statement
CREATE TABLE IF NOT EXISTS lesson_notes(user_id text NOT NULL, video_id text NOT NULL, content text NOT NULL DEFAULT '' CHECK(length(content)<=8000), version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,video_id), FOREIGN KEY(user_id,video_id) REFERENCES learner_lessons(user_id,video_id) ON DELETE CASCADE);
-- statement
CREATE TABLE IF NOT EXISTS lesson_bookmarks(id uuid NOT NULL, user_id text NOT NULL, video_id text NOT NULL, seconds integer NOT NULL CHECK(seconds BETWEEN 0 AND 604800), label text NOT NULL CHECK(length(label) BETWEEN 1 AND 200), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,id), FOREIGN KEY(user_id,video_id) REFERENCES learner_lessons(user_id,video_id) ON DELETE CASCADE);
-- statement
CREATE TABLE IF NOT EXISTS study_collections(id uuid NOT NULL, user_id text NOT NULL REFERENCES learner_profiles(user_id) ON DELETE CASCADE, name text NOT NULL CHECK(length(name) BETWEEN 1 AND 60), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,id), UNIQUE(user_id,name));
-- statement
CREATE TABLE IF NOT EXISTS collection_lessons(user_id text NOT NULL, collection_id uuid NOT NULL, video_id text NOT NULL, added_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,collection_id,video_id), FOREIGN KEY(user_id,collection_id) REFERENCES study_collections(user_id,id) ON DELETE CASCADE, FOREIGN KEY(user_id,video_id) REFERENCES learner_lessons(user_id,video_id) ON DELETE CASCADE);
-- statement
CREATE TABLE IF NOT EXISTS workspace_imports(user_id text NOT NULL REFERENCES learner_profiles(user_id) ON DELETE CASCADE, import_id uuid NOT NULL, imported_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,import_id));
-- statement
CREATE TABLE IF NOT EXISTS workspace_rate_limits(user_id text NOT NULL REFERENCES learner_profiles(user_id) ON DELETE CASCADE, window_start timestamptz NOT NULL, request_count integer NOT NULL DEFAULT 1, PRIMARY KEY(user_id,window_start));
-- statement
CREATE INDEX IF NOT EXISTS learner_lessons_recent ON learner_lessons(user_id,updated_at DESC);
-- statement
CREATE INDEX IF NOT EXISTS lesson_bookmarks_video ON lesson_bookmarks(user_id,video_id,seconds);
-- statement
INSERT INTO ytguide_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;
