// ─────────────────────────────────────────────────────────────
// @wavi/shared — all types shared between API and dashboard
// ─────────────────────────────────────────────────────────────

// ── Enums ────────────────────────────────────────────────────

export type GroupStatus = 'pending_setup' | 'active' | 'paused';

/** Only active groups may send WhatsApp replies; pending_setup still ingests messages. */
export function isGroupReplyEnabled(status: GroupStatus): boolean {
  return status === 'active';
}

export const DRAFT_GROUP_PREFIX = 'draft:';

/** Placeholder wa_group_id for groups prepared before Wavi joins WhatsApp. */
export function isDraftGroup(waGroupId: string): boolean {
  return waGroupId.startsWith(DRAFT_GROUP_PREFIX);
}

export function createDraftWaGroupId(): string {
  return `${DRAFT_GROUP_PREFIX}${crypto.randomUUID()}`;
}

export type LanguageMode = 'auto' | 'he' | 'en' | 'ar' | 'es' | 'fr' | 'ru';

export type HumorType = 'sarcastic' | 'absurdist' | 'self-deprecating' | 'dad-jokes' | 'dry' | 'none';

export type PlanTier = 'free' | 'starter' | 'pro' | 'team';

// ── Owner ────────────────────────────────────────────────────

export interface Owner {
  id: string;
  email: string;
  plan: PlanTier;
  created_at: string;
}

// ── Agent ────────────────────────────────────────────────────

export interface Agent {
  id: string;
  owner_id: string;
  phone_number: string | null;
  agent_name: string;
  created_at: string;
}

export interface WaHealthState {
  consecutive_cdp_failures: number;
  last_forced_restart_at: string | null;
  restart_in_progress: boolean;
  cdp_op_in_flight: boolean;
  cdp_op_stuck_ms: number;
}

export type WaConnectionState = 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED';

export interface AgentStatusResponse {
  connected: boolean;
  connecting: boolean;
  state: WaConnectionState;
  phone_number: string | null;
  health: WaHealthState;
}

// ── Character Config ─────────────────────────────────────────

/** Grammatical gender for the agent persona — drives Hebrew verb/adjective agreement. */
export type AgentGender = 'זכר' | 'נקבה';

/** Legacy string emoji level — kept for backward-compat migration only. */
export type EmojiUsageLegacy = 'none' | 'low' | 'medium' | 'high';

/** Maps a legacy string emoji level or any raw value to a clean 0–100 number. */
export function migrateEmojiUsage(value: EmojiUsageLegacy | number | undefined): number {
  if (typeof value === 'number') return Math.max(0, Math.min(100, value));
  switch (value) {
    case 'none':
      return 0;
    case 'low':
      return 25;
    case 'high':
      return 85;
    case 'medium':
    default:
      return 55;
  }
}

export function emojiUsagePromptHint(level: number): string {
  if (level === 0) return 'never use emojis — plain text only';
  if (level < 30) return 'emojis very sparingly — at most one per message, only when it genuinely adds tone';
  if (level < 65) return 'emojis occasionally — natural WhatsApp style, not every message';
  return 'emojis freely — pepper replies with emojis like an expressive texter';
}

export interface PersonalitySliders {
  formality: number; // 0–100
  humor: number; // 0–100
  verbosity: number; // 0–100
  assertiveness: number; // 0–100
  empathy: number; // 0–100
  sarcasm: number; // 0–100: 0 = sincere/genuine, 100 = sharp sarcasm
  energy: number; // 0–100: 0 = chill/mellow, 100 = hype/enthusiastic
  emoji_usage: number; // 0–100
}

export type ReplyModel = 'claude-haiku-4-5' | 'claude-sonnet-4-6';

export const DEFAULT_REPLY_MODEL: ReplyModel = 'claude-haiku-4-5';

/** A single few-shot exchange that shows how Wavi sounds in this group. */
export interface VoiceExample {
  user: string; // what a group member says
  agent: string; // how Wavi replies — in character, correct length, right language
}

export interface CharacterConfig {
  voice: string; // 2-3 sentence voice description
  opinions: string[]; // 3-5 opinions on group-relevant topics
  signature_behavior: string; // one recurring quirk
  /** Short recurring expressions the character drops naturally — up to 3. */
  catchphrases?: string[];
  sliders: PersonalitySliders;
  preset: 'custom' | 'professional' | 'casual' | 'comedian' | 'warm';
  version: number;
  reply_model?: ReplyModel;
  examples?: VoiceExample[]; // 2-3 few-shot exchanges synthesized from group history
  /** Grammatical gender inferred from group context — drives Hebrew verb/adjective agreement. */
  agent_gender?: AgentGender;
}

export const DEFAULT_SLIDERS: PersonalitySliders = {
  formality: 35,
  humor: 65,
  verbosity: 50,
  assertiveness: 60,
  empathy: 70,
  sarcasm: 25,
  energy: 55,
  emoji_usage: 55,
};

export type CharacterPreset = 'custom' | 'professional' | 'casual' | 'comedian' | 'warm';

export const PRESET_SLIDERS: Record<CharacterPreset, PersonalitySliders> = {
  professional: { formality: 85, humor: 15, verbosity: 60, assertiveness: 70, empathy: 40, sarcasm: 10, energy: 30, emoji_usage: 10 },
  casual: { formality: 25, humor: 60, verbosity: 45, assertiveness: 50, empathy: 65, sarcasm: 30, energy: 55, emoji_usage: 55 },
  comedian: { formality: 10, humor: 95, verbosity: 55, assertiveness: 75, empathy: 45, sarcasm: 65, energy: 80, emoji_usage: 85 },
  warm: { formality: 40, humor: 50, verbosity: 60, assertiveness: 35, empathy: 90, sarcasm: 5, energy: 60, emoji_usage: 55 },
  custom: DEFAULT_SLIDERS,
};

export function normalizePersonalitySliders(sliders: Partial<PersonalitySliders & { emoji_usage: EmojiUsageLegacy | number }> | undefined): PersonalitySliders {
  return {
    formality: sliders?.formality ?? DEFAULT_SLIDERS.formality,
    humor: sliders?.humor ?? DEFAULT_SLIDERS.humor,
    verbosity: sliders?.verbosity ?? DEFAULT_SLIDERS.verbosity,
    assertiveness: sliders?.assertiveness ?? DEFAULT_SLIDERS.assertiveness,
    empathy: sliders?.empathy ?? DEFAULT_SLIDERS.empathy,
    sarcasm: sliders?.sarcasm ?? DEFAULT_SLIDERS.sarcasm,
    energy: sliders?.energy ?? DEFAULT_SLIDERS.energy,
    emoji_usage: migrateEmojiUsage(sliders?.emoji_usage as EmojiUsageLegacy | number | undefined),
  };
}

// ── Group ────────────────────────────────────────────────────

export interface Group {
  id: string;
  agent_id: string;
  wa_group_id: string;
  name: string;
  status: GroupStatus;
  character_config: CharacterConfig | null;
  character_locked: boolean;
  language_mode: LanguageMode;
  /** When true, Wavi may search the web for factual / current-info questions. */
  web_search_enabled: boolean;
  image_generation_enabled: boolean;
  created_at: string;
}

export interface GroupWithStats extends Group {
  is_draft: boolean;
  /** WhatsApp group participants when linked; null for drafts or when WA is unavailable. */
  member_count: number | null;
  /** Member profiles Wavi has built for this group. */
  profile_count: number;
  message_count_today: number;
  reply_count_today: number;
  last_activity: string | null;
}

export interface CreateGroupRequest {
  wa_group_id: string;
  name?: string;
}

export interface CreateDraftGroupRequest {
  name: string;
}

export interface LinkGroupRequest {
  wa_group_id: string;
  name?: string;
}

export interface DiscoveredWaGroup {
  wa_group_id: string;
  name: string;
  participant_count: number | null;
  last_activity: string | null;
  registered: boolean;
  group_id: string | null;
  status: GroupStatus | null;
}

// ── Messages ─────────────────────────────────────────────────

export interface Message {
  id: string;
  group_id: string;
  sender_wa_id: string;
  sender_name: string;
  body: string;
  is_agent_reply: boolean;
  flagged_miss: boolean;
  timestamp: string;
  created_at: string;
}

export interface MessagesPage {
  messages: Message[];
  has_more: boolean;
}

// ── User Profiles ────────────────────────────────────────────

/** Dashboard edits preserved across merge-mode re-ingest. */
export interface ProfileCuration {
  display_name_locked?: boolean;
  summary_locked?: boolean;
  /** Aliases as of last full (non-merge) ingest — used by dashboard reset. */
  source_aliases?: string[];
}

export interface UserProfileData {
  humor_type: HumorType;
  humor_score: number; // 0–100 how humorous they are
  formality_score: number; // 0–100
  activity_level: 'high' | 'medium' | 'low' | 'lurker';
  dominant_topics: string[];
  sensitivity_flags: string[]; // topics/tones to avoid
  emoji_usage: 'heavy' | 'moderate' | 'rare' | 'none';
  avg_message_length: 'long' | 'medium' | 'short' | 'terse';
  aliases?: string[];
  curation?: ProfileCuration;
}

export interface UserProfile {
  id: string;
  group_id: string;
  wa_user_id: string;
  display_name: string;
  profile_data: UserProfileData;
  behavioral_summary: string; // pre-computed prose for prompt injection
  msg_count: number;
  last_updated: string;
}

// ── Relationship Map ─────────────────────────────────────────

export interface RelationshipCuration {
  narrative_locked?: boolean;
}

export interface RelationshipSignals {
  reply_count_a_to_b: number;
  reply_count_b_to_a: number;
  agreement_count: number;
  disagreement_count: number;
  defense_count: number; // times one defended the other
  curation?: RelationshipCuration;
}

export interface RelationshipPair {
  id: string;
  group_id: string;
  user_a_wa_id: string;
  user_b_wa_id: string;
  user_a_name: string;
  user_b_name: string;
  interaction_score: number; // 0–1 normalized
  conflict_score: number; // 0–1
  solidarity_score: number; // 0–1
  signals: RelationshipSignals;
  narrative: string; // pre-computed prose: "Dan and Sara frequently clash..."
  last_updated: string;
}

// ── Group Context ─────────────────────────────────────────────

export interface GroupContext {
  id: string;
  group_id: string;
  summary_text: string;
  character_version: number;
  generated_at: string;
}

// ── Group Memory ─────────────────────────────────────────────

export interface GroupMemory {
  id: string;
  group_id: string;
  memory_text: string;
  added_by_wa_id: string;
  added_by_name: string;
  created_at: string;
}

// ── Reply flows (in-flight tag → reply pipeline) ─────────────

export type ReplyFlowStatus = 'queued' | 'processing';

export interface ReplyFlow {
  id: string;
  group_id: string;
  group_name: string;
  sender_name: string;
  message_preview: string;
  status: ReplyFlowStatus;
  queued_at: string;
}

export interface ActiveReplyFlows {
  total: number;
  flows: ReplyFlow[];
  queue_depth: number;
  queued_count: number;
  processing_count: number;
  peak_inflight_today: number;
}

// ── Usage observability ──────────────────────────────────────

export const USAGE_REQUEST_TYPES = ['whatsapp_reply', 'test_chat', 'synthesis', 'embedding', 'image_generation', 'recovery'] as const;

export type UsageRequestType = (typeof USAGE_REQUEST_TYPES)[number];

export interface UsageTypeStats {
  type: UsageRequestType;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  spent_usd_estimate: number;
}

export interface UsagePeriodStats {
  requests: number;
  input_tokens: number;
  output_tokens: number;
  spent_usd_estimate: number;
  avg_latency_ms: number | null;
  breakdown: UsageTypeStats[];
}

export interface UsageReplyExtreme {
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  spent_usd_estimate: number;
  group_id: string;
  group_name: string;
  created_at: string;
}

export interface GroupUsageRank {
  group_id: string;
  group_name: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  spent_usd_estimate: number;
}

export interface AgentUsageStats {
  today: UsagePeriodStats;
  week: UsagePeriodStats;
  month: UsagePeriodStats;
  all_time: UsagePeriodStats;
  top_groups: GroupUsageRank[];
  min_reply: UsageReplyExtreme | null;
  max_reply: UsageReplyExtreme | null;
  budget_usd: number | null;
  budget_exceeded: boolean;
  auto_paused: boolean;
  week_starts_on: 'sunday';
}

export interface GroupUsageStats {
  group_id: string;
  today: UsagePeriodStats;
  week: UsagePeriodStats;
  month: UsagePeriodStats;
  all_time: UsagePeriodStats;
  min_reply: UsageReplyExtreme | null;
  max_reply: UsageReplyExtreme | null;
  week_starts_on: 'sunday';
}

// ── Replies ──────────────────────────────────────────────────

export interface Reply {
  id: string;
  message_id: string;
  group_id: string;
  body: string;
  prompt_tokens: number;
  completion_tokens: number;
  latency_ms: number;
  flagged_miss: boolean;
  /** Storage path in DB; API returns a signed URL when present. */
  image_url?: string | null;
  created_at: string;
  // joined
  group_name?: string;
  triggered_by_name?: string;
  triggered_by_message?: string;
}

/** Where a failed reply broke: while generating text/image, or while delivering to WhatsApp. */
export type FailedReplyStage = 'generation' | 'delivery';

/** A reply that never reached the group — generation threw or delivery exhausted its retries. */
export interface FailedReply {
  id: string;
  message_id: string | null;
  group_id: string;
  stage: FailedReplyStage;
  error_message: string | null;
  attempted_body: string | null;
  trigger_name: string | null;
  trigger_body: string | null;
  attempts: number;
  created_at: string;
  // joined
  group_name?: string;
}

// ── Rate Limit ───────────────────────────────────────────────

export const RATE_LIMIT_MAX = 20; // per hour
export const RATE_LIMIT_WINDOW = 3600; // seconds

// ── Ingestion ────────────────────────────────────────────────

export interface ParsedWAMessage {
  timestamp: Date;
  sender_name: string;
  /** Canonical id when known (phone number from export, live wa id, or aligned label). */
  sender_wa_id?: string;
  body: string;
  is_system_message: boolean;
  is_media_omitted: boolean;
}

export interface UpdateMemberRequest {
  display_name?: string;
  behavioral_summary?: string;
  add_alias?: string;
  /** Add several aliases at once (comma-separated strings in each entry are split). */
  add_aliases?: string[];
  remove_alias?: string;
  /** Remove every alias for this member (display name unchanged). */
  clear_aliases?: boolean;
  /** Restore aliases to last ingest snapshot (or recompute from messages if missing). */
  reset_aliases?: boolean;
}

export interface UpdateRelationshipRequest {
  narrative?: string;
}

export interface MergeMembersRequest {
  keep_profile_id: string;
  merge_profile_id: string;
}

export interface IngestionProgress {
  group_id: string;
  total_messages: number;
  processed_messages: number;
  chunks_embedded: number;
  stage: 'parsing' | 'embedding' | 'profiling' | 'relationships' | 'context' | 'synthesizing' | 'done' | 'error';
  error?: string;
}

// ── API Response Shapes ──────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  error: null;
}

export interface ApiError {
  data: null;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResult<T> = ApiResponse<T> | ApiError;

// ── Dashboard Realtime Events ─────────────────────────────────

export type RealtimeEvent =
  | { type: 'new_reply'; payload: Reply }
  | { type: 'miss_flagged'; payload: { reply_id: string; group_id: string } }
  | { type: 'group_updated'; payload: Partial<Group> & { id: string } }
  | { type: 'ingestion_progress'; payload: IngestionProgress }
  | { type: 'wa_disconnected'; payload: { agent_id: string } }
  | { type: 'rate_limited'; payload: { group_id: string; wa_user_id: string; user_name: string } }
  | { type: 'reply_flow_updated'; payload: ActiveReplyFlows };

// ── Prompt Assembly ──────────────────────────────────────────

export interface QuotedMessageContext {
  body: string;
  sender_wa_id: string;
  sender_name: string;
}

export interface MentionedPerson {
  display_name: string;
  aliases?: string[];
  behavioral_summary: string;
  sensitivity_flags: string[];
  relationships: string[];
}

export interface WebSearchSnippet {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchContext {
  query: string;
  answer?: string;
  results: WebSearchSnippet[];
}

export interface PromptContext {
  character_config: CharacterConfig;
  group_name: string;
  language_mode: LanguageMode;
  group_context_summary: string;
  sender_profile: UserProfile;
  relevant_relationships: RelationshipPair[];
  group_memories: GroupMemory[];
  mentioned_people: MentionedPerson[];
  rag_chunks: string[]; // top 5 message chunk summaries
  rag_episode_summaries: string[]; // top 3 episode summaries
  recent_messages: Message[]; // last 20 verbatim
  resolved_display_names: Record<string, string>;
  quoted_message?: QuotedMessageContext | null;
  current_message: string;
  web_search_enabled: boolean;
  web_search?: WebSearchContext | null;
  image_generation_enabled: boolean;
}

// ── Cost observability ───────────────────────────────────────

export interface CostStats {
  month: string;
  total_input_tokens: number;
  total_output_tokens: number;
  total_replies: number;
  avg_latency_ms: number;
  budget_usd: number | null;
  spent_usd_estimate: number;
  budget_exceeded: boolean;
  auto_paused: boolean;
  test_chat: TestChatCostStats;
}

export interface TestChatCostStats {
  input_tokens: number;
  output_tokens: number;
  replies: number;
  spent_usd_estimate: number;
}

// ── Test Chat (admin preview) ────────────────────────────────

export interface TestReplyHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
  sender_name?: string;
}

export interface TestReplyRequest {
  message: string;
  sender_name?: string;
  sender_wa_id?: string;
  history?: TestReplyHistoryTurn[];
}

export interface TestReplyResponse {
  reply: string;
  latency_ms: number;
  prompt_tokens: number;
  completion_tokens: number;
  image_prompt?: string;
  image_caption?: string;
}

export interface TestImagePreviewRequest {
  prompt: string;
}

export interface TestImagePreviewResponse {
  image_base64: string;
  mimetype: string;
}
