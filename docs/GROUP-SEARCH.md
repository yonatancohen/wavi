# Group Search — Why Recall Questions Often Come Up Empty

When you ask Wavi something like _“when was the last time someone was on a flight?”_, it can feel like a search over the group chat. It is not. This doc explains what actually happens, why those questions often return nothing, and what works better today.

---

## How group “search” actually works

When you tag Wavi, it does **not** grep the chat for keywords like “flight” or sort messages by date. Instead:

1. **Last 20 messages** — included verbatim in the conversation turns sent to Claude.
2. **Semantic vector search (RAG)** — for older history, Wavi embeds your question and searches `message_chunks` (50-message windows) and `episode_summaries` (~100-message LLM summaries) in pgvector.
3. **Similarity filter** — only chunks with cosine similarity **≥ 0.35** are kept, up to **5 chunks** and **3 episode summaries**.
4. **Prompt block** — if nothing passes the filter, the model sees: _“No relevant past context found.”_

Relevant code:

- `apps/api/src/ai/prompt.ts` — `fetchRAGContext()`, `RAG_SIMILARITY_THRESHOLD = 0.35`
- `apps/api/src/ai/prompt-build.ts` — Block 8 (“RELEVANT HISTORY”)
- `apps/api/src/ai/rag-query.ts` — `normalizeRagQuery()` strips `@wavi` and prepends recent message context before embedding

So “search the group” really means **“find chunks that feel semantically similar to your question”** — not “find every mention of X, newest first.”

See also [HOW-WAVI-WORKS.md](./HOW-WAVI-WORKS.md) for the full reply pipeline.

---

## Why a flight (or similar) question often returns nothing

### 1. That history may never have been indexed

Searchable history only exists if:

- You **uploaded a WhatsApp export** in the dashboard (bulk ingest), **or**
- Enough **live messages** have accumulated since Wavi joined — chunks flush every **50 messages** (with 25-message overlap).

Live path: `apps/api/src/jobs/chunker.ts` — `appendToChunkBuffer()` → `flushChunkBuffer()` when buffer reaches 50.

If the flight was mentioned **before** ingest, or only in the stretch **before the first 50-message flush**, it may not be in the vector store. Messages are always stored in `messages`, but **RAG only searches embedded chunks** in `message_chunks` / `episode_summaries`.

### 2. Semantic match ≠ keyword “flight”

Someone might have written “boarding now”, “landed in TLV”, “at the airport”, or “טסתי לחו״ל” — not the word “flight”. Embeddings can miss those if similarity stays below **0.35**, and those results are dropped entirely.

### 3. “Last time” is not how retrieval works

Questions like _“when was the **last** time…”_ are **temporal**. RAG returns the **most semantically similar** chunks, not the **most recent** event. Even a good hit might be an older flight mention — or nothing at all.

There is no date-range filter, no “ORDER BY timestamp DESC”, and no structured event index for casual chat.

### 4. The mention may be outside the 20-message window

If the flight talk was more than ~20 messages ago **and** RAG did not retrieve it, Wavi effectively has no signal about it.

### 5. Chunk size dilutes single mentions

History is embedded in **50-message windows** (25 overlap). One line about a flight buried in 49 unrelated messages weakens that chunk’s embedding, so it may not rank high enough to surface.

### 6. Recent-message dedup

RAG results that overlap the last 20 messages (by content) are filtered out as duplicates — the assumption is that recent context is already in the prompt. That is fine when the topic is recent; it does not help for older recall.

### 7. Web search is a different system

If **web search** is enabled for the group (`web_search_enabled` + `TAVILY_API_KEY`), factual questions can trigger **Tavily (the internet)** via `apps/api/src/lib/web-search.ts`. Group history still goes through RAG in parallel, but:

- Web search does not scan chat history.
- When web results are empty, the prompt tells Wavi **not** to say it will “check” or “search” — it should answer from knowledge or admit it does not have current data.

Do not confuse internet lookup with group recall.

### 8. `@wavi remember` is the reliable path

Explicit facts (`@wavi remember Dan flew to London on Tuesday`) go into **`group_memories`** and are always included in the prompt. Casual chat mentions about flights are **not** stored that way — they depend entirely on RAG working.

---

## What to check

| Check                             | How                                                                    |
| --------------------------------- | ---------------------------------------------------------------------- |
| Was history ingested?             | Dashboard upload status, or `bun run ingest-status` (API env required) |
| Are chunks populated?             | `message_chunks` count for the group (ingest-status / Supabase)        |
| Was the flight after Wavi joined? | Pre-Wavi messages need export upload                                   |
| How was it phrased?               | “Flight” vs boarding / airport / travel slang / Hebrew                 |
| How long ago?                     | Older than last 20 messages + failed RAG = invisible to the model      |
| Web search on?                    | May answer from the web, not from chat — separate from RAG             |

---

## What works better today

| Approach                                                                      | Reliability                                          |
| ----------------------------------------------------------------------------- | ---------------------------------------------------- |
| `@wavi remember X flew on DATE`                                               | **High** — structured `group_memories`               |
| Quote the message: reply to the flight message and ask `@wavi when was this?` | **Higher** — quoted text is injected into the prompt |
| `@wavi when was someone last on a flight?`                                    | **Low** — semantic recall, no date ordering          |
| Upload full chat export before asking about old history                       | **Required** for pre-Wavi messages                   |

---

## Technical summary

```
Tagged message
  → fetchStructuredContext()     last 20 msgs, profiles, memories, group summary
  → normalizeRagQuery()          strip @wavi, prepend 1–3 recent msgs for embedding
  → embed(query)                 OpenAI text-embedding-3-small
  → search_message_chunks()      top 10 by similarity, keep ≥ 0.35, max 5
  → search_episode_summaries()   top 5 by similarity, keep ≥ 0.35, max 3
  → buildSystemPrompt()          Block 8 = RAG hits or "No relevant past context found"
  → Claude reply
```

**Bottom line:** Wavi is built for vibe + relevant context, not precise group search. Flight-style questions fail when history is not embedded, wording does not match semantically, similarity scores fall below the threshold, or the event is too old and buried in chunk noise.

---

## Possible improvements (not implemented)

These would address common recall gaps; none ship today:

- Lower or tune `RAG_SIMILARITY_THRESHOLD` (currently `0.35`)
- Keyword / full-text fallback alongside vector search
- Time-aware retrieval for “when was the last…” (sort by `msg_to`, filter by topic)
- Smaller chunks or per-notable-message embeddings for sparse facts
- Explicit `@wavi search …` command that runs a dedicated retrieval pass and surfaces timestamps
