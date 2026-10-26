CREATE TABLE IF NOT EXISTS ytguide_search_cache (
 cache_key text PRIMARY KEY,
 payload jsonb,
 expires_at timestamptz NOT NULL,
 lease_until timestamptz
);
-- statement
ALTER TABLE ytguide_search_cache ALTER COLUMN payload DROP NOT NULL;
-- statement
ALTER TABLE ytguide_search_cache ADD COLUMN IF NOT EXISTS lease_until timestamptz;
-- statement
CREATE INDEX IF NOT EXISTS ytguide_search_cache_expiry ON ytguide_search_cache(expires_at);
-- statement
CREATE TABLE IF NOT EXISTS ytguide_search_budget (
 day date PRIMARY KEY,
 units integer NOT NULL CHECK(units>=0)
);
