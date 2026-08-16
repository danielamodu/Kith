/**
 * Telegram Desktop export schema (subset we care about) plus our normalised form.
 *
 * The raw schema is loose in two places that matter:
 *   - `text` is either a plain string OR an array mixing plain strings and entity objects
 *   - service messages (joins, leaves) use `actor`/`action` instead of `from`/`text`
 * Both are handled in ingest.ts. Everything downstream sees only `Message`.
 */

// ---------- raw Telegram export ----------

export type RawTextEntity = {
  type: string;
  text: string;
};

/** Either "hello", or ["hello ", {type:"link", text:"..."}, " world"] */
export type RawText = string | Array<string | RawTextEntity>;

export type RawMessage = {
  id: number;
  type: "message" | "service";
  date: string;
  date_unixtime?: string;

  // message
  from?: string;
  from_id?: string;
  text?: RawText;
  reply_to_message_id?: number;

  // service
  actor?: string;
  actor_id?: string;
  action?: string;
  members?: string[];
};

export type RawExport = {
  name?: string;
  type?: string;
  id?: number;
  messages: RawMessage[];
};

// ---------- normalised ----------

export type Message = {
  /**
   * String, not number. Discord IDs are snowflakes — 64-bit values well beyond
   * Number.MAX_SAFE_INTEGER — so storing them numerically silently corrupts the
   * low bits, which is exactly where the per-millisecond increment lives. Reply
   * links would break, and reply links are what D1 and D4 are built on.
   * Telegram's numeric ids are widened to string on ingest so both platforms
   * share one identity space.
   */
  id: string;
  ts: Date;
  authorId: string;
  authorName: string;
  text: string;
  /** character length of text, precomputed — used by D3 */
  length: number;
  replyToId?: string;
};

/** Joins/leaves, kept separate: they mark tenure but are not participation. */
export type MembershipEvent = {
  ts: Date;
  actorId: string;
  actorName: string;
  action: string;
  kind: "join" | "leave" | "other";
};

export type Community = {
  name: string;
  messages: Message[];
  events: MembershipEvent[];
  /** earliest and latest message timestamps */
  from: Date;
  to: Date;
};

// ---------- per-member state ----------

/**
 * Everything a detector needs about one person, all of it relative to that
 * person rather than to a global threshold. See docs/perception-spec.md.
 */
export type MemberState = {
  id: string;
  name: string;

  /** first message or join event, whichever is earlier */
  firstSeen: Date;
  lastSeen: Date;
  /** how long they have been a member, measured to the analysis instant */
  tenureDays: number;
  /** span between their first and last message — activity, not membership */
  activeSpanDays: number;

  messageCount: number;

  /** median gap between consecutive messages, in hours — this person's rhythm */
  medianGapHours: number;
  /** median absolute deviation of gaps, in hours — how irregular they are */
  gapMadHours: number;
  /** hours since their last message, as of the analysis instant */
  currentGapHours: number;

  /** median message length in characters — this person's normal */
  medianLength: number;
  /** median length of their most recent messages, for comparison */
  recentMedianLength: number;

  /** replies this member sent that answered someone else's question */
  answersGiven: number;
  /** distinct members they replied to */
  distinctRepliedTo: number;
  /** replies they sent to members newer than themselves */
  answersToNewcomers: number;

  /** whether they announced leaving — suppresses drift signals */
  saidFarewell: boolean;
};
