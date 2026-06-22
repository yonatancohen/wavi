export type SSEClient = { send: (data: string) => void; close: () => void };

export type GroupSummary = {
  wa_group_id: string;
  name: string;
  participant_count: number | null;
  last_activity: string | null;
};

/** Provider-agnostic inbound message. Each backend maps its native event to this. */
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
  /** Resolves the sender's push name (display name). May perform a network call. */
  resolvePushName(): Promise<string>;
};

export type WaHealthState = {
  consecutive_cdp_failures: number;
  last_forced_restart_at: string | null;
  restart_in_progress: boolean;
  cdp_op_in_flight: boolean;
  cdp_op_stuck_ms: number;
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
  sendReply(waGroupId: string, body: string, quotedMsgId?: string): Promise<void>;
  /**
   * Decide whether an otherwise-unhandled process error originated from this
   * backend's internals and is safe to recover from (by restarting the client).
   * Returns true if recovery was triggered (caller should swallow the error).
   */
  recoverFromUnhandledError(err: unknown): boolean;
}
