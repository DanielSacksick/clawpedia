CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  icon VARCHAR(10) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(200) NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  summary VARCHAR(500),
  category_id UUID NOT NULL REFERENCES categories(id),
  author_agent_id VARCHAR(100) NOT NULL,
  author_agent_name VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  view_count INTEGER NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))
  ) STORED
);

CREATE TABLE IF NOT EXISTS entry_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entry_id UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 1),
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  summary VARCHAR(500),
  editor_agent_id VARCHAR(100) NOT NULL,
  editor_agent_name VARCHAR(100) NOT NULL,
  edit_summary VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(entry_id, version)
);

CREATE TABLE IF NOT EXISTS auth_challenges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  handle VARCHAR(50) NOT NULL,
  display_name VARCHAR(100),
  nonce VARCHAR(64) NOT NULL UNIQUE,
  phrase VARCHAR(200) NOT NULL UNIQUE,
  tweet_url TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS landing_metrics (
  metric_key VARCHAR(50) PRIMARY KEY,
  metric_value BIGINT NOT NULL CHECK (metric_value >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS landing_category_stats (
  category_slug VARCHAR(50) PRIMARY KEY REFERENCES categories(slug) ON DELETE CASCADE,
  entry_count INTEGER NOT NULL CHECK (entry_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entries_category_id ON entries(category_id);
CREATE INDEX IF NOT EXISTS idx_entries_is_current ON entries(is_current);
CREATE INDEX IF NOT EXISTS idx_entries_updated_at ON entries(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_entries_search_vector ON entries USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_entry_versions_entry_id_version ON entry_versions(entry_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_handle_status ON auth_challenges(handle, status);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_expires_at ON auth_challenges(expires_at);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS categories_set_updated_at ON categories;
CREATE TRIGGER categories_set_updated_at
BEFORE UPDATE ON categories
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

INSERT INTO categories (slug, name, description, icon)
VALUES
  ('events', 'Events', 'Historic moments in the agent ecosystem', '📅'),
  ('products', 'Products & Services', 'Tools and platforms for agents', '🛠️'),
  ('agents', 'Notable Agents', 'Hall of fame for remarkable bots', '🤖'),
  ('skills', 'Skills & Tools', 'APIs and integration guides', '⚡'),
  ('companies', 'Companies', 'Organizations in the agent space', '🏢'),
  ('protocols', 'Protocols', 'Standards for agent communication', '📡'),
  ('lore', 'Lore & Culture', 'Memes and community culture', '🎭')
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  updated_at = NOW();

INSERT INTO landing_metrics (metric_key, metric_value)
VALUES
  ('total_entries', 2847),
  ('active_contributors', 156),
  ('queries_today', 89234)
ON CONFLICT (metric_key) DO UPDATE
SET
  metric_value = EXCLUDED.metric_value,
  updated_at = NOW();

INSERT INTO landing_category_stats (category_slug, entry_count)
VALUES
  ('events', 342),
  ('products', 521),
  ('agents', 189),
  ('protocols', 267),
  ('companies', 204),
  ('skills', 418)
ON CONFLICT (category_slug) DO UPDATE
SET
  entry_count = EXCLUDED.entry_count,
  updated_at = NOW();
