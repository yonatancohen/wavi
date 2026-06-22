# Wavi — Product Specification v1.3

> WhatsApp AI Group Agent · Personal-first launch · RAG architecture  
> Stack: Vue 3 · Node.js/Fastify · Supabase · pgvector · Claude API

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Users & Use Cases](#2-users--use-cases)
3. [The Character System](#3-the-character-system)
4. [RAG Architecture & Context Strategy](#4-rag-architecture--context-strategy)
5. [Database Schema](#5-database-schema)
6. [Feature Specification](#6-feature-specification)
7. [Technical Stack](#7-technical-stack)
8. [Cost Model](#8-cost-model)
9. [MVP Scope & Build Sequence](#9-mvp-scope--build-sequence)
10. [Risks & Mitigations](#10-risks--mitigations)
11. [Architecture Decisions Log](#11-architecture-decisions-log)

---

## 1. Product Vision

Wavi is a configurable AI agent that lives inside WhatsApp group chats. It learns the dynamics of each group — who talks to whom, each person's humor and tone, the relationships and ongoing threads — and shows up as a character that genuinely fits that group's energy.

**The core promise:** Wavi should feel like a group member who happens to know everyone really well, not a bot you're operating. Members interact by tagging it. No app to install. No new interface to learn.

The product launches personally — the owner adds it to their own friend groups first. Real groups, real dynamics, real feedback before opening to others.

### 1.1 The Problem

| Pain point                              | Description                                                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------------- |
| Generic bots feel robotic               | Existing bots don't adapt to group culture — every reply feels like it came from a stranger  |
| No sense of who they're talking to      | The group joker and the quiet one get identical responses                                    |
| Character is pre-configured, not earned | You set sliders before the bot knows anything — it performs a personality it hasn't earned   |
| No relationship awareness               | Bots miss the most fun layer: the dynamics between people, not just each person individually |
| Context window limitations              | Can't stuff full history into every prompt — naive implementations go blind or get expensive |
| Bad first impressions                   | Bots go live cold — first replies are generic, users lose interest immediately               |

### 1.2 The Solution

- Wavi reads the group's history before going live — understanding vibe, relationships, and recurring themes
- It builds a character that fits the group: its humor level, its tone, its opinions
- A RAG layer means it can always retrieve the most relevant history — not just the last N messages
- When tagged, it replies as that character — aware of who asked, their relationship to others, and what's going on
- When it gets it wrong, it recovers in character — not with a corporate apology

### 1.3 What Makes This Different

|                        | Wavi                               | Everything else             |
| ---------------------- | ---------------------------------- | --------------------------- |
| Character origin       | Derived from group history         | Pre-configured by owner     |
| Relationship awareness | Tracks pairs, not just individuals | Individual profiles only    |
| History retrieval      | RAG over full history              | Last N messages only        |
| Cold start             | Reads history before first reply   | Goes live knowing nothing   |
| Mistakes               | Recovers in character              | Generic apology or silence  |
| Primary use            | Social / friend groups             | Work tools, task automation |

---

## 2. Users & Use Cases

### 2.1 Launch Approach

Wavi launches as a personal tool. The owner adds the agent to their own WhatsApp groups first — real groups, real dynamics, fast feedback loop. Multi-owner support comes later.

### 2.2 User Types

**The Owner**  
Creates the Wavi account, connects groups, tunes the agent's character. Accesses the web dashboard. In MVP: one person — the builder.

**Group Members**  
Everyone in the group. No account needed. Interact by tagging `@wavi`. Experience should feel like tagging a person.

### 2.3 Use Case Matrix

| Use case           | Who triggers it           | What Wavi does                                                |
| ------------------ | ------------------------- | ------------------------------------------------------------- |
| Answer a question  | Member tags Wavi          | Responds using web knowledge + RAG history + personality      |
| Settle a debate    | @wavi settle this…        | Takes a side in the agent's voice — not neutral               |
| Roast someone      | @wavi roast Dan           | Uses Dan's profile + RAG history for a personalized roast     |
| Summarize chat     | @wavi summarize           | Reads last N messages, returns summary in agent's voice       |
| Plan something     | @wavi plan a dinner Sat   | Suggests based on RAG-retrieved group preferences and history |
| Remember something | @wavi remember X          | Stores a group memory tied to that group                      |
| Recall memory      | @wavi what does Dan owe?  | Retrieves from structured memory store + semantic search      |
| Group digest       | Scheduled by owner        | Posts morning/weekly summary in character                     |
| Explain the vibe   | @wavi describe this group | Character sketch of the group, in Wavi's voice                |

---

## 3. The Character System

The agent's character is not configured — it is **discovered** from the group's history. Then it can be tuned. This is the core design decision that separates Wavi from every other WhatsApp bot.

### 3.1 Character Formation

**Step 1 — History Ingestion**  
Owner exports WhatsApp chat as `.txt` and uploads to dashboard. Wavi processes in 50-message chunks, embedding each chunk into pgvector and extracting behavioral signals.

**Step 2 — Character Synthesis**  
After ingestion, Claude synthesizes a character profile designed to fit the group — a slightly exaggerated version of the group's own energy.

| Character trait     | How it's derived                                                          |
| ------------------- | ------------------------------------------------------------------------- |
| Humor level         | If the group is 70% jokes, Wavi mirrors that — then goes slightly further |
| Tone                | Matches the dominant register: casual / sarcastic / warm / dry            |
| Opinions            | Takes positions on topics the group frequently debates                    |
| Catchphrase         | Synthesized from recurring group phrases or invented to fit               |
| Relationship stance | Knows who to tease gently, who to handle more carefully                   |

**Step 3 — Owner Review**  
Before going live, owner sees the synthesized character card: description, sample replies, personality sliders pre-set. Owner can adjust or regenerate before activating.

### 3.2 Character Components

| Component           | Description                                                           |
| ------------------- | --------------------------------------------------------------------- |
| Name                | Set by owner. Default: wavi. Groups often rename their bots.          |
| Voice               | 2-3 sentence description of how the agent talks. Generated, editable. |
| Opinions            | 3-5 positions on topics relevant to this group.                       |
| Signature behavior  | One recurring quirk. E.g. "Ends long replies with a one-liner."       |
| Personality sliders | Formality / Humor / Verbosity / Assertiveness / Empathy               |

### 3.3 Personality Sliders

| Slider        | Low (0)                      | High (100)                        |
| ------------- | ---------------------------- | --------------------------------- |
| Formality     | Slang, abbreviations, casual | Structured, precise, professional |
| Humor         | Straight-faced, factual      | Jokes in almost every reply       |
| Verbosity     | One-liners only              | Full explanations with context    |
| Assertiveness | Hedged, neutral, both-sides  | Takes hard positions, confident   |
| Empathy       | Task-focused, efficient      | Warm, reads the room emotionally  |

### 3.4 Character Evolution

- Profiles refresh every 200 new group messages
- Owner notified on dashboard when a significant character update is detected
- Owner can lock character to prevent drift
- Owner can manually trigger re-synthesis at any time

---

## 4. RAG Architecture & Context Strategy

A busy group generates thousands of messages. You can't stuff full history into every prompt — it's too expensive and too noisy. RAG solves this: instead of sending everything, retrieve only what's relevant to the current request.

### 4.1 The Three-Layer Context Model

Context is split across three layers with different retrieval strategies. All three are assembled at reply time.

**Layer 1 — Structured DB** _(always included, fast Postgres queries)_

- Character config (voice, opinions, personality dials)
- Last 20 messages verbatim (sliding window)
- Sender's user profile (JSON)
- Top 3 relationship pairs involving the sender
- Group memories (explicit `remember` commands)
- Rolling group context summary (pre-computed)

**Layer 2 — Vector Store / RAG** _(retrieved per request via pgvector)_

- All group messages, chunked into 50-message windows with 25-message overlap
- Past agent replies (tagged as agent output)
- Episode summaries (auto-generated every 100 messages)
- Query: embed the incoming message → cosine similarity search → top 5 chunks + top 3 summaries

**Layer 3 — Compressed Summaries** _(pre-computed, always included)_

- Rolling group context: what's been happening in the last 100 messages (~150 tokens)
- Per-user behavioral summary: not raw messages, just distilled traits (~100 tokens)
- Relationship narrative: prose description of key pairs ("Dan and Sara frequently clash…")
- Regenerated on a background schedule — never computed at reply time

### 4.2 Why pgvector (Not Pinecone / Weaviate)

Wavi already runs on Supabase (Postgres). pgvector is a native Postgres extension — Supabase includes it on the free tier:

- Zero additional service — one less thing to manage and pay for
- SQL joins work across messages and vectors in the same query
- Filter by `group_id`, timestamp, member — before the vector search, not after
- At this scale (thousands of messages per group) pgvector with an IVFFlat index is fast enough

> At millions of messages across hundreds of groups, revisit Pinecone or Qdrant. Not a concern for MVP.

### 4.3 Embedding Strategy

Not every message is embedded individually — that's noisy and wasteful. Three granularities:

| Granularity                  | What gets embedded                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| 50-message chunks (primary)  | Sliding window of 50 messages with 25 overlap. Captures conversation flow, not isolated messages.         |
| Notable individual messages  | High-engagement messages (many replies), messages that triggered agent replies, explicit memory commands. |
| Episode summaries (cheapest) | 2-3 sentence LLM-generated summary of every 100-message block. Embedded and stored. Cheapest to retrieve. |

### 4.4 Embedding Model

| Model                             | Notes                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| `text-embedding-3-small` (OpenAI) | **Recommended.** $0.02/1M tokens. 1536 dimensions. Excellent for conversational text. |
| `text-embedding-3-large` (OpenAI) | $0.13/1M tokens. 3072 dimensions. Overkill for chat — skip.                           |
| Claude embeddings                 | Not available — Claude API does not expose an embedding endpoint.                     |

> **Cost check:** 10,000 messages × ~20 tokens = 200k tokens → **$0.004** total. Embedding a full group history costs less than half a cent.

### 4.5 Ingestion Pipeline

**Bulk — WhatsApp `.txt` Export**

```
Upload .txt file
  → parse into structured messages
     (iOS:     [DD/MM/YYYY, HH:MM:SS] Name: message)
     (Android: DD/MM/YYYY, HH:MM - Name: message)
  → normalize sender names to wa_user_ids where possible
  → batch into 50-message chunks (25 overlap)
  → for each chunk:
       → embed via text-embedding-3-small
       → store in message_chunks (pgvector)
       → extract member activity signals → update user_profiles
  → after all chunks processed:
       → generate episode summaries every 100 msgs (LLM call)
       → synthesize character from summaries + profiles (LLM call)
       → update group_contexts table

5,000 messages ≈ 30–60 seconds · shown as progress bar in dashboard
```

**Streaming — Live Messages**

```
New message arrives via whatsapp-web.js
  → store in messages table immediately
  → append to in-memory chunk buffer (per group, Redis)
  → if buffer.length === 50:
       → flush: embed chunk → store in message_chunks
       → clear buffer (keep last 25 for overlap)
  → every 100 messages:
       → generate episode summary (background job)
       → refresh user profiles and relationship scores
       → update rolling group context
```

### 4.6 Retrieval Flow (Per Reply)

When a member tags Wavi, the system runs two fetches in parallel — targeting a ~200ms total retrieval budget before the Claude call.

```
Incoming: "@wavi settle this — who's been right more, Dan or Sara?"

PARALLEL FETCH
──────────────────────────────────────────────────────────────
[A] Supabase structured query (~10ms)
    SELECT character_config FROM groups WHERE id = ?
    SELECT * FROM user_profiles WHERE group_id = ? AND wa_user_id = sender
    SELECT * FROM relationship_map WHERE group_id = ?
      AND (user_a = sender OR user_b = sender)
      ORDER BY interaction_score DESC LIMIT 3
    SELECT * FROM group_memories WHERE group_id = ?
    SELECT summary FROM group_contexts WHERE group_id = ?
      ORDER BY generated_at DESC LIMIT 1
    SELECT body FROM messages WHERE group_id = ?
      ORDER BY timestamp DESC LIMIT 20

[B] pgvector similarity search (~30ms)
    query_embedding = embed("settle this who has been right more Dan Sara")
    SELECT content, summary, members, msg_from, msg_to
      FROM message_chunks
      WHERE group_id = ?
      ORDER BY embedding <=> query_embedding
      LIMIT 5

    SELECT summary FROM episode_summaries
      WHERE group_id = ?
      ORDER BY embedding <=> query_embedding
      LIMIT 3

ASSEMBLE PROMPT → CALL CLAUDE → SEND REPLY
```

### 4.7 Prompt Token Budget

Target: ~3,000 tokens per reply. Keeps cost at ~$0.001/reply on Haiku.

| Block                                    | Tokens     |
| ---------------------------------------- | ---------- |
| Identity + character + personality dials | ~400       |
| Rolling group context summary (Layer 3)  | ~150       |
| Sender profile summary (Layer 3)         | ~100       |
| Relationship narrative (Layer 3)         | ~150       |
| Group memories (Layer 1)                 | ~200       |
| RAG: top 5 message chunks (Layer 2)      | ~500       |
| RAG: top 3 episode summaries (Layer 2)   | ~300       |
| Last 20 messages verbatim (Layer 1)      | ~800       |
| Current tagged message                   | ~100       |
| Buffer                                   | ~300       |
| **TOTAL**                                | **~3,000** |

### 4.8 Prompt Assembly (Full Structure)

```
SYSTEM PROMPT
─────────────────────────────────────────────────────────
BLOCK 1 — Identity
  You are {agent_name}, a member of a WhatsApp group called {group_name}.

BLOCK 2 — Character
  {voice_description}
  Your opinions: {opinions_list}
  Signature behavior: {signature_behavior}

BLOCK 3 — Personality dials
  Formality: {n}/100. Humor: {n}/100. Verbosity: {n}/100.
  Assertiveness: {n}/100. Empathy: {n}/100.

BLOCK 4 — Group context (Layer 3, pre-computed)
  {rolling_group_context_summary}

BLOCK 5 — Sender profile (Layer 3)
  The person tagging you is {name}.
  {behavioral_summary}. Humor type: {type}. Sensitivity flags: {flags}.

BLOCK 6 — Relationship context (Layer 1 + 3)
  {relationship_narrative_for_relevant_pairs}

BLOCK 7 — Retrieved history (Layer 2, RAG)
  Relevant past context:
  {top_5_chunk_summaries}
  {top_3_episode_summaries}

BLOCK 8 — Rules
  Reply in the same language as the message.
  Stay in character at all times. Never break the fourth wall unless asked.
  If someone reacts negatively, apologize in your own voice — not formally.

USER TURNS (Layer 1 — last 20 messages verbatim)
  [message history as user/assistant turns]

USER: {the tagged message}
```

---

## 5. Database Schema

All data lives in Supabase (Postgres). pgvector extension enabled for embedding columns. Supabase Realtime used for dashboard live updates.

### 5.1 Core Tables

```sql
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
  status           text DEFAULT 'pending_setup', -- pending_setup|active|paused
  character_config jsonb,
  character_locked boolean DEFAULT false,
  language_mode    text DEFAULT 'auto',           -- 'auto'|'he'|'en'|'ar'|etc
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
```

### 5.2 RAG Tables

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE message_chunks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid REFERENCES groups(id) ON DELETE CASCADE,
  content    text,
  summary    text,
  embedding  vector(1536),   -- text-embedding-3-small
  msg_from   timestamptz,
  msg_to     timestamptz,
  members    text[],
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_chunks_vec ON message_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_chunks_group ON message_chunks (group_id);

CREATE TABLE episode_summaries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid REFERENCES groups(id) ON DELETE CASCADE,
  summary    text,
  embedding  vector(1536),
  msg_from   timestamptz,
  msg_to     timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_episodes_vec ON episode_summaries
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
```

### 5.3 Intelligence Tables

```sql
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
  interaction_score float DEFAULT 0,
  conflict_score    float DEFAULT 0,
  solidarity_score  float DEFAULT 0,
  signals           jsonb,
  narrative         text,
  last_updated      timestamptz DEFAULT now(),
  UNIQUE(group_id, user_a_wa_id, user_b_wa_id)
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

-- Redis key: ratelimit:{group_id}:{wa_user_id}  TTL: 3600s  Max: 20/hr
```

### 5.4 pgvector RPC Functions

```sql
CREATE OR REPLACE FUNCTION search_message_chunks(
  p_group_id uuid, p_embedding vector(1536), p_limit int DEFAULT 5
) RETURNS TABLE (id uuid, content text, summary text, members text[],
                 msg_from timestamptz, msg_to timestamptz, similarity float)
LANGUAGE sql STABLE AS $$
  SELECT id, content, summary, members, msg_from, msg_to,
         1 - (embedding <=> p_embedding) AS similarity
  FROM message_chunks WHERE group_id = p_group_id
  ORDER BY embedding <=> p_embedding LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION search_episode_summaries(
  p_group_id uuid, p_embedding vector(1536), p_limit int DEFAULT 3
) RETURNS TABLE (id uuid, summary text, msg_from timestamptz,
                 msg_to timestamptz, similarity float)
LANGUAGE sql STABLE AS $$
  SELECT id, summary, msg_from, msg_to,
         1 - (embedding <=> p_embedding) AS similarity
  FROM episode_summaries WHERE group_id = p_group_id
  ORDER BY embedding <=> p_embedding LIMIT p_limit;
$$;
```

---

## 6. Feature Specification

### F-01 — Group Connection & Cold Start

- Owner adds agent's number as WA contact, invites to group
- Group shows as `pending_setup` in dashboard
- Owner uploads WA chat export (`.txt`) — iOS and Android formats both supported
- Processing runs as background job — progress bar shown on dashboard
- On complete: character card shown with voice, opinions, sample replies, preset sliders
- Owner reviews → optionally tweaks → clicks **Go Live**
- Agent sends welcome message in its synthesized character voice

> **Fallback if owner skips upload:** agent goes live with neutral character, builds profile from live messages. Dashboard clearly warns that first 2 weeks will feel generic.

### F-02 — Tag & Reply

- Detects tag by configured name (default `@wavi`, owner can change)
- Parallel fetch: structured context (Layer 1+3) + pgvector RAG (Layer 2)
- Prompt assembled with full 8-block structure (see Section 4.8)
- Reply delivered as WA message quoting the original
- Ambiguous request: asks one clarifying question in character
- Logged to dashboard activity feed in real time via Supabase Realtime

### F-03 — User Profiling Engine

| Profile field       | How it's derived                                             |
| ------------------- | ------------------------------------------------------------ |
| Communication style | Vocabulary, sentence length, emoji usage, punctuation habits |
| Humor signature     | Sarcastic / absurdist / self-deprecating / dad jokes / none  |
| Activity level      | Frequency, time-of-day patterns, response rate to others     |
| Dominant topics     | Subjects they initiate or engage with most                   |
| Sensitivity signals | Topics or tones that got no response or negative reactions   |

> Profiles regenerate every 50 new messages from that user. Stored as JSON + pre-computed prose summary for fast prompt injection.

### F-04 — Relationship Mapping

| Signal                 | How it shapes replies                                            |
| ---------------------- | ---------------------------------------------------------------- |
| High mutual reply rate | Strong bond — Wavi can reference their dynamic explicitly        |
| Recurring disagreement | Wavi knows who to pit against who in debates                     |
| One-sided high rate    | Handled with awareness — not made obvious                        |
| Protective pattern     | C often defends D — Wavi doesn't go too hard on D with C present |
| Silence between two    | Wavi doesn't assume familiarity between them                     |

### F-05 — Group Context Engine

- Rolling 100-message summary — regenerated as background job
- Covers: active threads, recurring topics, current group tone, recent memorable moments
- Visible read-only in dashboard — owner can add manual annotation notes

### F-06 — Group Memory

- `@wavi remember: [fact]` — stored in `group_memories` table
- `@wavi what do you remember?` — returns full memory list
- `@wavi forget [thing]` — semantic match to find and delete
- Owner can view and manage all memories from dashboard

### F-07 — Error Recovery

**Trigger:** member explicitly complains OR owner flags a reply as a miss

- Wavi issues an in-character apology immediately in the group
- Tone matches character — a sarcastic agent apologizes differently than a warm one
- High humor example: _"Ok ok, that one didn't land. I'll retire that joke. Probably."_
- Low humor example: _"That was off — sorry. Let me try again."_
- Original reply flagged as **Miss** in dashboard
- Owner can add note: what went wrong, to improve future prompts

### F-08 — Scheduled Posts _(owner-activated)_

- Daily morning digest: summary of past 24h in character
- Weekly highlight reel: top moments, most debated topic, open plans
- Custom slot: owner writes template, Wavi fills with current context
- All scheduled posts previewed 1 hour before sending — owner can cancel

---

## 7. Technical Stack

| Layer            | Technology                    | Free tier    | Notes                                                  |
| ---------------- | ----------------------------- | ------------ | ------------------------------------------------------ |
| Frontend         | Vue 3 + Vite + Pinia          | Unlimited    | Pinia for global state; Vue Router for dashboard pages |
| UI               | shadcn-vue + Tailwind         | Unlimited    | Clean design system, low overhead                      |
| Backend          | Bun + Fastify                 | —            | Runs TypeScript natively, no build step; fast startup  |
| WhatsApp (MVP)   | whatsapp-web.js               | Free         | QR-based, no Meta approval; runs on Railway            |
| WhatsApp (v2)    | Meta Cloud API                | 1k convos/mo | Migrate post-traction; needs Meta approval             |
| Database         | Supabase Postgres             | 500MB        | Realtime subscriptions for dashboard live feed         |
| Vector store     | pgvector (Supabase)           | Included     | Native Postgres extension; no extra service            |
| Embeddings       | OpenAI text-embedding-3-small | $5 credit    | ~$0.02/1M tokens; negligible at this scale             |
| AI replies       | Anthropic Claude API          | $5 credit    | Haiku for replies; Sonnet for synthesis jobs           |
| Cache / Queue    | Upstash Redis                 | 10k req/day  | Chunk buffer + reply queue + rate limiting             |
| Auth             | Supabase Auth                 | 50k users    | Google OAuth, zero config                              |
| Backend hosting  | Railway                       | 500 hrs/mo   | Persistent WA session; always-on process               |
| Frontend hosting | Vercel                        | Unlimited    | Static deploys; env vars for API keys                  |

### 7.1 Service Responsibilities

| Service        | What it owns                                                                |
| -------------- | --------------------------------------------------------------------------- |
| Fastify server | WA message events, webhook handling, reply queue workers, ingestion jobs    |
| Supabase       | All persistent data: messages, profiles, chunks, embeddings, memories, auth |
| Upstash Redis  | In-flight chunk buffer per group, reply job queue, rate limit counters      |
| OpenAI API     | Embedding generation only (`text-embedding-3-small`)                        |
| Anthropic API  | All text generation: replies, summaries, character synthesis, apologies     |
| Vue dashboard  | Owner UI: group management, character editor, profiles, activity feed       |

### 7.2 Full Message Flow

```
──── INCOMING MESSAGE ────────────────────────────────────────────
1.  whatsapp-web.js emits 'message' event
2.  Fastify handler: store in Supabase messages table
3.  Push to Redis chunk buffer (key: chunk:{group_id})
4.  If buffer.length >= 50:
      → dequeue 50 messages
      → embed via OpenAI → store in message_chunks (pgvector)
5.  Check if message tags the agent:
      → if yes: push to Redis reply queue (key: reply_jobs)
6.  Background jobs (on schedule):
      → every 100 messages: generate episode summary → embed → store
      → every 50 msgs per user: regenerate user profile
      → every 100 msgs: regenerate group context summary
      → every 200 msgs: check for character drift

──── REPLY WORKER ────────────────────────────────────────────────
7.  Worker pulls job from Redis reply queue
8.  PARALLEL FETCH (target: <200ms):
      [A] Supabase: character, last 20 msgs, sender profile,
                    relationship pairs, memories, group context
      [B] pgvector: embed query → top 5 chunks + top 3 summaries
9.  Assemble 8-block prompt (~3,000 tokens)
10. Call Claude Haiku API
11. Receive reply text
12. Send via whatsapp-web.js (quoted reply)
13. Store in replies table
14. Supabase Realtime pushes update to dashboard

──── ERROR RECOVERY ──────────────────────────────────────────────
15. Monitor for negative reactions (60s window after each reply)
16. If detected: generate in-character apology → send immediately
17. Flag original reply as 'miss' in DB → notify owner on dashboard
```

### 7.3 Monorepo Structure

```
wavi/
├── apps/
│   ├── api/                   Node.js + Fastify
│   │   └── src/
│   │       ├── index.ts       Server entry point
│   │       ├── whatsapp/      WA client + message handlers
│   │       ├── ai/            Prompt builder, worker, recovery, summarizer
│   │       ├── jobs/          Chunk buffer, background crons
│   │       ├── routes/        HTTP endpoints
│   │       ├── db/            Supabase client
│   │       └── lib/           Redis, embeddings, parser
│   └── dashboard/             Vue 3 + Vite
│       └── src/
│           ├── views/         Page components
│           ├── stores/        Pinia stores (groups, replies)
│           ├── components/    UI components
│           └── lib/           Router, API client
├── packages/
│   └── shared/                TypeScript types shared by both apps
├── scripts/                   Dev, deploy, DB, health check scripts
├── supabase-schema.sql        Full DB schema with pgvector
└── bunfig.toml
```

---

## 8. Cost Model

### 8.1 Personal Launch Cost

_Estimate: 5 groups · ~30 agent replies/day · 1,000 new messages/day_

| Line item                               | Daily cost                    |
| --------------------------------------- | ----------------------------- |
| Claude Haiku replies (30 × ~3k tokens)  | ~$0.07                        |
| OpenAI embeddings (1k msgs × 20 tokens) | ~$0.0004                      |
| Supabase, Redis, Railway, Vercel        | $0 (free tiers)               |
| **Total**                               | **~$0.08/day → ~$2.50/month** |

### 8.2 LLM Routing Strategy

| Task                   | Model                    | Reason                                |
| ---------------------- | ------------------------ | ------------------------------------- |
| Tag & Reply            | `claude-haiku-4-5`       | Fast, cheap, good enough              |
| Character synthesis    | `claude-sonnet-4-6`      | Only on setup + periodic re-synthesis |
| Episode summaries      | `claude-haiku-4-5`       | Background job, not latency-sensitive |
| User profile synthesis | `claude-haiku-4-5`       | Background job                        |
| In-character apology   | `claude-haiku-4-5`       | Needs to be fast                      |
| Embeddings             | `text-embedding-3-small` | Claude has no embedding API           |

### 8.3 Cost Optimization Tactics

- Cache group context summaries — regenerate every 100 msgs, not per reply
- Cache user profile prose — regenerate every 50 new msgs from that user
- IVFFlat index on pgvector — fast approximate search, not full scan
- Chunk buffer in Redis — batch embed 50 messages at once, not 1-by-1
- Hard monthly spend cap via Anthropic + OpenAI dashboards
- Alert at 80% of monthly budget

---

## 9. MVP Scope & Build Sequence

### 9.1 MVP — What Ships

**In scope for v1:**

- ✅ WhatsApp connection via whatsapp-web.js (QR scan)
- ✅ History upload + chunked ingestion pipeline
- ✅ pgvector embeddings for all message chunks
- ✅ Character synthesis from history (Sonnet)
- ✅ Character card review before go-live
- ✅ Tag detection + reply with 8-block RAG prompt
- ✅ User profiling (background job)
- ✅ Relationship mapping (pair signals)
- ✅ Episode summaries (background job)
- ✅ Negative reaction detection + in-character apology
- ✅ Group memory (remember / forget)
- ✅ Vue dashboard: group mgmt, character editor, activity feed, member profiles

**Deferred:**

- ❌ Scheduled posts (v2)
- ❌ Character drift notifications (v2)
- ❌ Relationship map visualization in dashboard (v2)
- ❌ Multi-owner support (v3)

### 9.2 Build Sequence

| Phase                       | What gets built                                                               | Exit criteria                                                           |
| --------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **0 — Foundation**          | Supabase schema + pgvector, Fastify skeleton, Vue scaffold + auth             | Owner can log in, sees empty dashboard. DB tables created.              |
| **1 — WhatsApp core**       | whatsapp-web.js client, QR connect, message storage, tag detection            | Messages stored in DB; tags detected; chunk buffer running in Redis     |
| **2 — Ingestion + RAG**     | History upload UI, .txt parser, chunking, OpenAI embeddings, pgvector storage | Owner uploads history; chunks embedded and searchable                   |
| **3 — Character synthesis** | Synthesis prompt, character card UI, owner review + edit flow, go-live button | Owner sees generated character, tweaks it, activates group              |
| **4 — AI replies**          | 8-block prompt builder, parallel fetch, Claude Haiku call, reply sender       | Agent replies in WA when tagged; RAG context visibly influences replies |
| **5 — Intelligence jobs**   | User profiling cron, relationship mapping cron, group context refresh         | Profiles and relationships updating in background                       |
| **6 — Recovery**            | Negative reaction detection, apology generator, miss flagging                 | Bad replies trigger in-character recovery                               |
| **7 — Dashboard + polish**  | Full character editor, member profiles, activity feed, memory manager         | All features accessible from dashboard; ready for daily use             |

---

## 10. Risks & Mitigations

| Risk                             | Likelihood | Mitigation                                                                                                                        |
| -------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| WA bans number (whatsapp-web.js) | Medium     | Rate-limit to max 1 reply/30s per group; migrate to official API at scale; keep backup number                                     |
| Cold start without history       | Medium     | Clear dashboard warning. Fallback: short "tell me about the group" form as manual seed.                                           |
| Character synthesis off-target   | Medium     | Always show character card for review before go-live. Owner can regenerate or manually edit. Never auto-publish.                  |
| RAG retrieves irrelevant chunks  | Low-Med    | Use metadata filters (group_id, timestamp range) before vector search. Monitor miss-flagged replies to tune chunk size / overlap. |
| pgvector slow at scale           | Low        | IVFFlat handles millions of rows. At 100k+ chunks per group, migrate to HNSW index or Qdrant.                                     |
| OpenAI embedding costs spike     | Low        | $0.02/1M tokens. Set hard cap on OpenAI dashboard.                                                                                |
| Apology worsens situation        | Low        | Apology template editable in character editor. Owner can disable auto-apology.                                                    |
| WA session drops overnight       | Medium     | Persist session tokens in Supabase. Auto-reconnect with exponential backoff. Owner push notification on disconnect.               |
| Privacy concern from members     | Medium     | Welcome message states AI is present. Owner agrees to terms. One-command data deletion. No data sold.                             |

---

## 11. Architecture Decisions Log

Final decisions made before development begins.

| Decision                               | Resolution                                                                                                                                                                                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **D-01 WhatsApp identity model**       | One phone number per agent. The number joins all groups. Group identity is `group_id` — same agent instance, different `character_config` per group. No multi-number complexity in MVP.                                                                                        |
| **D-02 .txt export parser resilience** | Parser handles iOS format (`[DD/MM/YYYY, HH:MM:SS] Name:`), Android format (`DD/MM/YYYY, HH:MM - Name:`), Hebrew/RTL names, reversed date locales, system messages, and media placeholders. Tested against real exports before ingestion pipeline is wired.                    |
| **D-03 QR code delivery to dashboard** | SSE (Server-Sent Events) from Fastify to Vue. Fastify streams QR data as base64 PNG; Vue renders as `<img>`. One-directional, no WebSocket overhead. Connection closes after successful auth.                                                                                  |
| **D-04 In-chat owner commands**        | None in MVP. All management via dashboard only. Message handler only detects member tags — no owner command parsing. In-chat shortcuts can be added post-MVP.                                                                                                                  |
| **D-05 Language handling**             | Language mode configurable per group. Options: `auto` (reply in same language as incoming message) or force a specific code (`he`, `en`, `ar`, etc.). Default: `auto`. Stored as `language_mode` in groups table. Character synthesis prompt also runs in configured language. |
| **D-06 Rate limiting**                 | 20 tags per member per hour per group. Redis key: `ratelimit:{group_id}:{wa_user_id}`, TTL: 3600s. On limit hit: agent sends one in-character response, then silences that member for the remainder of the hour. Event logged to dashboard.                                    |

---

_Confidential — Personal Project_
