CREATE TABLE IF NOT EXISTS ytguide_feedback_limits (
 bucket text PRIMARY KEY,
 hits integer NOT NULL CHECK(hits>0),
 created_at timestamptz NOT NULL DEFAULT now()
);
-- statement
CREATE INDEX IF NOT EXISTS ytguide_feedback_limits_created ON ytguide_feedback_limits(created_at);
