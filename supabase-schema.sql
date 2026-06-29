-- ─────────────────────────────────────────────────────────────
-- Wavi — Supabase Database Schema
-- Run this in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────

-- pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ── Core tables ───────────────────────────────────────────────

CREATE TABLE owners (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text UNIQUE NOT NULL,
  plan       text DEFAULT 'free',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE agents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid REFERENCES owners(id) ON DELETE CASCADE,
  phone_number    text,
  agent_name      text DEFAULT 'wavi',
  wa_session_data jsonb,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE groups (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id         uuid REFERENCES agents(id) ON DELETE CASCADE,
  wa_group_id      text UNIQUE NOT NULL,
  name             text,
  status           text DEFAULT 'pending_setup',
  character_config jsonb,
  character_locked boolean DEFAULT false,
  language_mode             text DEFAULT 'he', -- actively-tuned default; 'en'/'auto' also supported
  web_search_enabled        boolean DEFAULT false, -- Tavily web search for factual / current-info questions
  image_generation_enabled  boolean NOT NULL DEFAULT false,
  member_count              integer, -- last known WA participant count
  created_at                timestamptz DEFAULT now()
);

CREATE TABLE messages (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id       uuid REFERENCES groups(id) ON DELETE CASCADE,
  sender_wa_id   text NOT NULL,
  sender_name    text,
  body           text,
  is_agent_reply boolean DEFAULT false,
  flagged_miss   boolean DEFAULT false,
  timestamp      timestamptz NOT NULL,
  created_at     timestamptz DEFAULT now()
);
CREATE INDEX idx_messages_group_time ON messages (group_id, timestamp DESC);
CREATE INDEX idx_messages_sender     ON messages (group_id, sender_wa_id);

-- ── RAG tables ─────────────────────────────────────────────────

CREATE TABLE message_chunks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid REFERENCES groups(id) ON DELETE CASCADE,
  content    text,
  summary    text,
  embedding  vector(1536),
  msg_from   timestamptz,
  msg_to     timestamptz,
  members    text[],
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_chunks_group ON message_chunks (group_id);
CREATE INDEX idx_chunks_vec   ON message_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE TABLE episode_summaries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid REFERENCES groups(id) ON DELETE CASCADE,
  summary    text,
  embedding  vector(1536),
  msg_from   timestamptz,
  msg_to     timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_episodes_group ON episode_summaries (group_id);
CREATE INDEX idx_episodes_vec   ON episode_summaries
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

-- ── Intelligence tables ────────────────────────────────────────

CREATE TABLE user_profiles (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id           uuid REFERENCES groups(id) ON DELETE CASCADE,
  wa_user_id         text NOT NULL,
  display_name       text,
  profile_data       jsonb,
  behavioral_summary text,
  msg_count          int DEFAULT 0,
  last_updated       timestamptz DEFAULT now(),
  UNIQUE(group_id, wa_user_id)
);

CREATE TABLE relationship_map (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id          uuid REFERENCES groups(id) ON DELETE CASCADE,
  user_a_wa_id      text NOT NULL,
  user_b_wa_id      text NOT NULL,
  user_a_name       text,
  user_b_name       text,
  interaction_score float DEFAULT 0,
  conflict_score    float DEFAULT 0,
  solidarity_score  float DEFAULT 0,
  signals           jsonb,
  narrative         text,
  last_updated      timestamptz DEFAULT now(),
  UNIQUE(group_id, user_a_wa_id, user_b_wa_id),
  CONSTRAINT relationship_pair_order CHECK (user_a_wa_id < user_b_wa_id)
);

CREATE TABLE group_contexts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id          uuid REFERENCES groups(id) ON DELETE CASCADE,
  summary_text      text,
  character_version int DEFAULT 1,
  generated_at      timestamptz DEFAULT now()
);

CREATE TABLE group_memories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        uuid REFERENCES groups(id) ON DELETE CASCADE,
  memory_text     text NOT NULL,
  added_by_wa_id  text,
  added_by_name   text,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE replies (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id        uuid REFERENCES messages(id),
  group_id          uuid REFERENCES groups(id),
  body              text,
  prompt_tokens     int,
  completion_tokens int,
  latency_ms        int,
  flagged_miss      boolean DEFAULT false,
  image_url         text,
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX idx_replies_group ON replies (group_id, created_at DESC);

-- Replies that never reached the group: delivery exhausted all retries, or
-- generation threw. Kept separate from `replies` (which is the success log) so
-- the dashboard can surface delivery/generation incidents without polluting the
-- activity feed. `stage` records where it broke; `attempts` is the retry count.
CREATE TABLE failed_replies (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id     uuid REFERENCES messages(id),
  group_id       uuid REFERENCES groups(id) ON DELETE CASCADE,
  stage          text NOT NULL DEFAULT 'delivery', -- 'generation' | 'delivery'
  error_message  text,
  attempted_body text,            -- the reply text we tried to send, if generation got that far
  trigger_name   text,            -- who tagged Wavi
  trigger_body   text,            -- the message that triggered the (failed) reply
  attempts       int DEFAULT 1,
  created_at     timestamptz DEFAULT now()
);
CREATE INDEX idx_failed_replies_group ON failed_replies (group_id, created_at DESC);

-- ── pgvector RPC functions ─────────────────────────────────────
-- Called from API via supabase.rpc()

CREATE OR REPLACE FUNCTION search_message_chunks(
  p_group_id uuid,
  p_embedding vector(1536),
  p_limit     int DEFAULT 5
)
RETURNS TABLE (
  id        uuid,
  content   text,
  summary   text,
  members   text[],
  msg_from  timestamptz,
  msg_to    timestamptz,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    id,
    content,
    summary,
    members,
    msg_from,
    msg_to,
    1 - (embedding <=> p_embedding) AS similarity
  FROM message_chunks
  WHERE group_id = p_group_id
  ORDER BY embedding <=> p_embedding
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION search_episode_summaries(
  p_group_id uuid,
  p_embedding vector(1536),
  p_limit     int DEFAULT 3
)
RETURNS TABLE (
  id         uuid,
  summary    text,
  msg_from   timestamptz,
  msg_to     timestamptz,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    id,
    summary,
    msg_from,
    msg_to,
    1 - (embedding <=> p_embedding) AS similarity
  FROM episode_summaries
  WHERE group_id = p_group_id
  ORDER BY embedding <=> p_embedding
  LIMIT p_limit;
$$;

-- ── Reminders ─────────────────────────────────────────────────
-- Scheduled messages set by group members via "@wavi remind me ..."
-- or Hebrew equivalents. The reminder worker polls this table every
-- 30 s and fires due rows by sending a WA message to wa_group_id.

CREATE TABLE reminders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id       uuid REFERENCES groups(id) ON DELETE CASCADE,
  wa_group_id    text NOT NULL,
  sender_wa_id   text NOT NULL,
  sender_name    text,
  reminder_text  text NOT NULL,
  fire_at        timestamptz NOT NULL,
  sent_at        timestamptz,
  created_at     timestamptz DEFAULT now()
);
-- Partial index: only unsent reminders need to be scanned by the worker.
CREATE INDEX idx_reminders_due ON reminders (fire_at) WHERE sent_at IS NULL;
CREATE INDEX idx_reminders_sender ON reminders (group_id, sender_wa_id) WHERE sent_at IS NULL;

-- ── Group automations ─────────────────────────────────────────
-- Proactive wake-up messages: silence nudge, daily digest, scheduled post.
-- Polled by the automation worker; configurable from the dashboard.

CREATE TABLE group_automations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     uuid REFERENCES groups(id) ON DELETE CASCADE,
  type         text NOT NULL,          -- 'silence_nudge' | 'daily_digest' | 'scheduled_post'
  enabled      boolean DEFAULT false,
  config       jsonb NOT NULL DEFAULT '{}',
  -- silence_nudge: { threshold_hours: 24 }
  -- daily_digest:  { time: "09:00", timezone: "Asia/Jerusalem", frequency: "daily"|"weekly", weekday?: 0-6 }
  -- scheduled_post:{ time: "09:00", frequency: "daily"|"weekly", weekday?: 0-6, template?: string }
  last_fired_at  timestamptz,
  next_fire_at   timestamptz,
  created_at     timestamptz DEFAULT now(),
  UNIQUE (group_id, type)
);
CREATE INDEX idx_automations_due ON group_automations (next_fire_at)
  WHERE enabled = true AND next_fire_at IS NOT NULL;

-- ── Group Automations ─────────────────────────────────────────
-- Owner-configured proactive automations (silence nudge, digest, scheduled post).
-- The automation worker polls next_fire_at every 5 minutes.

CREATE TABLE group_automations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     uuid REFERENCES groups(id) ON DELETE CASCADE,
  type         text NOT NULL,          -- 'silence_nudge' | 'daily_digest' | 'scheduled_post'
  enabled      boolean DEFAULT false,
  config       jsonb NOT NULL DEFAULT '{}',
  -- silence_nudge: { threshold_hours: 24 }
  -- daily_digest:  { time: "09:00", timezone: "Asia/Jerusalem", frequency: "daily"|"weekly", weekday?: 0-6 }
  -- scheduled_post:{ time: "09:00", frequency: "daily"|"weekly", weekday?: 0-6, template?: string }
  last_fired_at  timestamptz,
  next_fire_at   timestamptz,          -- precomputed; polled by worker
  created_at     timestamptz DEFAULT now(),
  UNIQUE (group_id, type)
);
CREATE INDEX idx_automations_due ON group_automations (next_fire_at)
  WHERE enabled = true AND next_fire_at IS NOT NULL;

-- ── Supabase Realtime ─────────────────────────────────────────
-- Enable realtime on tables the dashboard subscribes to

ALTER PUBLICATION supabase_realtime ADD TABLE replies;
ALTER PUBLICATION supabase_realtime ADD TABLE groups;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- ── Rotation tracker (who brought what) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS rotation_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id       uuid REFERENCES groups(id) ON DELETE CASCADE,
  item           text NOT NULL,
  person_wa_id   text NOT NULL,
  person_name    text NOT NULL,
  added_by_wa_id text,
  brought_at     timestamptz DEFAULT now(),
  created_at     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rotation_group_item ON rotation_log (group_id, item, brought_at DESC);
