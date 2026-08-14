-- Paste into the Supabase SQL editor. Safe to re-run.
-- Adds durable group events (facts), separate from @wavi remember.

CREATE TABLE IF NOT EXISTS group_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id           uuid REFERENCES groups(id) ON DELETE CASCADE,
  who                text[] DEFAULT '{}',
  what               text NOT NULL,
  occurred_on        timestamptz,
  why_it_matters     text,
  source_episode_id  uuid REFERENCES episode_summaries(id) ON DELETE SET NULL,
  created_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_events_group
  ON group_events (group_id, occurred_on DESC NULLS LAST, created_at DESC);
