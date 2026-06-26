export type SSEClient = { send: (data: string) => void; close: () => void };

export type GroupSummary = {
  wa_group_id: string;
  name: string;
  participant_count: number | null;
  last_activity: string | null;
};

/** Provider-agnostic inbound message. Each backend maps its native event to this. */
export type QuotedMessage = {
  body: string;
  senderWaId: string;
  senderName: string;
  /** True when the quoted message was sent by the linked WhatsApp account (Wavi). */
  fromMe?: boolean;
};

export type InboundMessage = {
  waGroupId: string;
  isGroup: boolean;
  chatName: string;
  senderWaId: string;
  body: string;
  /** Unix ms */
  timestampMs: number;
  waMsgId: string;
  mentionedIds: string[];
  quotedMessage?: QuotedMessage;
  /** Resolves the sender's push name (display name). May perform a network call. */
  resolvePushName(): Promise<string>;
};

/** An emoji reaction to a group message, normalised across providers. */
export type InboundReaction = {
  waGroupId: string;
  reactorWaId: string;
  /** WA message ID of the message being reacted to */
  targetMsgId: string;
  /** Emoji used — empty string means the reaction was removed */
  emoji: string;
  /** True when the reacted-to message was originally sent by the agent */
  fromMe: boolean;
};

export type WaHealthState = {
  consecutive_cdp_failures: number;
  last_forced_restart_at: string | null;
  restart_in_progress: boolean;
  cdp_op_in_flight: boolean;
  cdp_op_stuck_ms: number;
};

/** Optional image attachment for WhatsApp delivery. */
export type ReplyMedia = {
  data: Buffer;
  mimetype: string;
  caption?: string;
};

export interface WhatsAppProvider {
  start(): Promise<void> | void;
  stop(): Promise<void>;
  restart(): Promise<void>;
  subscribeToQR(client: SSEClient): () => void;
  getConnectionState(): { connected: boolean; connecting: boolean; phone_number: string | null };
  getHealthState(): WaHealthState;
  /** Snapshot of the linked account identity — safe to call any time. */
  getIdentitySnapshot(): { wid: string | null; phone: string | null };
  listGroupChats(): Promise<GroupSummary[]>;
  sendReply(waGroupId: string, body: string, quotedMsgId?: string, media?: ReplyMedia): Promise<void>;
  /**
   * Decide whether an otherwise-unhandled process error originated from this
   * backend's internals and is safe to recover from (by restarting the client).
   * Returns true if recovery was triggered (caller should swallow the error).
   */
  recoverFromUnhandledError(err: unknown): boolean;
}
