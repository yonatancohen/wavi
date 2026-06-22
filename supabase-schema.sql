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
  language_mode    text DEFAULT 'he', -- actively-tuned default; 'en'/'auto' also supported
  created_at       timestamptz DEFAULT now()
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
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX idx_replies_group ON replies (group_id, created_at DESC);

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

-- ── Supabase Realtime ─────────────────────────────────────────
-- Enable realtime on tables the dashboard subscribes to

ALTER PUBLICATION supabase_realtime ADD TABLE replies;
ALTER PUBLICATION supabase_realtime ADD TABLE groups;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
