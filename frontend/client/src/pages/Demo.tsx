/* Kith Soft Spatial Studio: deliberate live reads, tactile comparison surfaces, and responsible delight. */
import { useEffect, useMemo, useState } from "react";
import { Activity, ChevronDown, ChevronUp, Clock3, Copy, Database, ExternalLink, PenLine, RefreshCw, ShieldCheck, Sparkles, UsersRound, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  api,
  Briefing,
  EmptyState,
  PageShell,
  PresencePulse,
  SectionLabel,
  SignalTag,
  Surface,
  TactileButton,
  WatchItem,
  pollUntilDone,
  useMountedRef,
  PollAbortedError,
  PollTimeoutError,
} from "@/components/KithShell";

type Baseline = { question?: string; answer?: string; source?: string; note?: string };
type PronounIssue = { member: string; pronounUsed: string; context: string };
type LiveAnswer = { answer?: string; text?: string; capturedAt?: string; source?: string; pronounIssues?: PronounIssue[] };
type LiveStart = { alias: string; sentAt: string; afterFingerprint?: string; sentMessageText: string; before: number | null };
type LiveStatus = { done: boolean; answer?: string; capturedAt?: string; pronounIssues?: PronounIssue[] };
type DraftStart = { alias: string; sentAt: string; afterFingerprint?: string; sentMessageText: string; before: number | null; memberName?: string };
type DraftStatus = { done: boolean; draft?: string; capturedAt?: string };

// Real observed reply latency on this exact route has ranged from 13 seconds
// to 75+ minutes for the same kind of question, with no progress signal from
// the platform in between. So the pending ask is persisted to localStorage
// (just an alias and a timestamp — no credentials) and resumed automatically
// on reload, so "close the tab, check back later" is an actual supported
// path, not just a claim in the copy below.
const LIVE_PENDING_KEY = "kith-live-pending";

const fallbackWatch = { watching: [{ member: "Maya", headline: "Her Tuesday rhythm has gone quiet.", signals: ["gap drift", "contribution"], lastSeen: "active 2 days ago" }, { member: "Jonah", headline: "A newcomer got a hello, then no thread back.", signals: ["newcomer", "follow-up"], lastSeen: "active yesterday" }] as WatchItem[], quiet: false };
const fallbackBaseline: Baseline = { question: "Who in the community might need a little attention right now?", answer: "It may help to check in with members who have been less active recently.", source: "Same model. Memory disabled.", note: "A true answer, but one without a personal baseline." };
const fallbackLive: LiveAnswer = { answer: "Maya has gone quiet relative to her own Tuesday rhythm. She also welcomed a newcomer last week, then stopped replying.", capturedAt: "cached example", source: "Kith — reading the community it remembers." };
const fallbackBriefing: { cases: Briefing[] } = { cases: [{ headline: "Maya's rhythm is changing", member: "Maya", signals: ["gap drift", "contribution", "tone shift"], evidence: [{ timestamp: "Tue · 09:12", text: "Maya welcomed a new member into the thread.", source: "community memory" }, { timestamp: "Thu · 16:48", text: "Her usual follow-up did not arrive.", source: "personal baseline" }, { timestamp: "Today · 10:02", text: "No new contribution at her usual cadence.", source: "rhythm check" }] }] };

export default function Demo() {
  const [watch, setWatch] = useState(fallbackWatch);
  const [baseline, setBaseline] = useState(fallbackBaseline);
  const [live, setLive] = useState(fallbackLive);
  const [briefing, setBriefing] = useState(fallbackBriefing);
  const [receipts, setReceipts] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [usingFallback, setUsingFallback] = useState(true);
  const [liveError, setLiveError] = useState<string | null>(null);
  // Kept so a failed *poll* (the send already went through) can be resumed
  // with "Check again" instead of "Ask Kith live" starting an entirely new
  // send — same double-charge risk Setup.tsx's push flow guards against.
  const [liveStart, setLiveStart] = useState<LiveStart | null>(null);
  // Draft-not-send: at most one member's draft is in flight or shown at a
  // time, keyed by watchlist key. Nothing here ever gets sent anywhere —
  // the draft text IS the deliverable; sending it is left as a deliberate
  // human step (copy, paste, send yourself).
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const [draftConfirmOpen, setDraftConfirmOpen] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftWaiting, setDraftWaiting] = useState(false);
  const [draftText, setDraftText] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftStart, setDraftStart] = useState<DraftStart | null>(null);
  const mountedRef = useMountedRef();

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get("/api/watchlist", fallbackWatch),
      api.get("/api/baseline", fallbackBaseline),
      api.get("/api/live-answer", fallbackLive),
      api.get("/api/briefing", fallbackBriefing),
    ]).then(([nextWatch, nextBaseline, nextLive, nextBriefing]) => {
      if (!active) return;
      setWatch(nextWatch);
      setBaseline(nextBaseline);
      setLive(nextLive);
      setBriefing(nextBriefing);
      setUsingFallback(nextWatch === fallbackWatch);
    });
    return () => { active = false; };
  }, []);

  // Resume a check that was still pending when this tab was last closed or
  // reloaded — the whole point of persisting it. Runs once on mount.
  useEffect(() => {
    const raw = localStorage.getItem(LIVE_PENDING_KEY);
    if (!raw) return;
    try {
      const pending = JSON.parse(raw) as LiveStart;
      if (!pending?.alias || !pending?.sentAt) {
        localStorage.removeItem(LIVE_PENDING_KEY);
        return;
      }
      setLiveStart(pending);
      toast("Picking up the read you asked for earlier — still checking.");
      void waitForLive(pending);
    } catch {
      localStorage.removeItem(LIVE_PENDING_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const liveText = live.answer || live.text || "";
  const pronounIssues = live.pronounIssues || [];
  const unsafe = pronounIssues.length > 0;
  const evidence = briefing.cases?.[0]?.evidence || [];
  const watchCount = watch.watching?.length || 0;

  // Shared by a fresh ask and a "Check again" recovery after a poll
  // failure — resumes against the SAME alias/start rather than starting a
  // new one, so a flaky poll can't turn into a second real send and a
  // second real charge.
  async function waitForLive(start: LiveStart) {
    setWaiting(true);
    try {
      const status = await pollUntilDone<LiveStatus>(
        () =>
          api.postOrThrow<LiveStatus>("/api/live-answer/status", {
            alias: start.alias,
            // Truncated — only used server-side for a dedup check, and
            // there's no reason to re-upload the full sent text on every
            // poll request.
            sentMessageText: start.sentMessageText.slice(0, 300),
            afterFingerprint: start.afterFingerprint,
            sentAfter: start.sentAt,
            before: start.before,
          }),
        // 5s x 180 = 15 minutes of active checking, well past the typical
        // case (13s-8min observed live) but still short of the worst case
        // (75+ min observed once) — hence the timeout copy below treating a
        // timeout as "still normal," not "broken," and reload as the
        // intended way to keep waiting past this window.
        { isMounted: () => mountedRef.current, intervalMs: 5000, maxAttempts: 180 },
      );
      setLive({ answer: status.answer, capturedAt: status.capturedAt, pronounIssues: status.pronounIssues });
      toast("The Mind has a fresh read.");
      setLiveStart(null);
      setLiveError(null);
      localStorage.removeItem(LIVE_PENDING_KEY);
    } catch (err) {
      if (err instanceof PollAbortedError) return;
      if (err instanceof PollTimeoutError) {
        setLiveError(
          "No reply yet after 15 minutes of checking. That's within the normal range for this Mind — we've seen it " +
            "take over an hour with no error and no lost send. You can close this tab; reopening this page will pick " +
            "the check back up on its own. Or hit \"Check again\" now.",
        );
      } else {
        setLiveError(
          `Checking the reply failed: ${err instanceof Error ? err.message : "unknown error"} — hit "Check again", the send may still have gone through.`,
        );
      }
    } finally {
      if (mountedRef.current) setWaiting(false);
    }
  }

  // The send is quick; a real reply has measured 76-111s live — longer than
  // any single request should be held open for (see minds-client.ts's
  // sendAndVerify comment). Kicked off here, then polled via pollUntilDone
  // rather than blocked on in one call.
  async function askLive() {
    setConfirmOpen(false);
    setLoading(true);
    setLiveError(null);
    setLiveStart(null);
    localStorage.removeItem(LIVE_PENDING_KEY);
    toast("Kith is taking one deliberate look…");
    let start: LiveStart;
    try {
      start = await api.postOrThrow<LiveStart>("/api/live-answer/refresh", { confirm: true });
    } catch (err) {
      toast(`Live read failed: ${err instanceof Error ? err.message : "unknown error"}`);
      setLoading(false);
      return;
    }
    setLoading(false);
    setLiveStart(start);
    localStorage.setItem(LIVE_PENDING_KEY, JSON.stringify(start));
    toast("Sent. Real replies have taken anywhere from under a minute to well over an hour — feel free to close this tab, it'll pick back up when you return.");
    await waitForLive(start);
  }

  // Same send+poll shape as waitForLive, scoped to one member's draft.
  async function waitForDraft(start: DraftStart) {
    setDraftWaiting(true);
    try {
      const status = await pollUntilDone<DraftStatus>(
        () =>
          api.postOrThrow<DraftStatus>("/api/draft/status", {
            alias: start.alias,
            sentMessageText: start.sentMessageText.slice(0, 300),
            afterFingerprint: start.afterFingerprint,
            sentAfter: start.sentAt,
            before: start.before,
          }),
        { isMounted: () => mountedRef.current, intervalMs: 5000, maxAttempts: 180 },
      );
      setDraftText(status.draft ?? "");
      setDraftError(null);
    } catch (err) {
      if (err instanceof PollAbortedError) return;
      if (err instanceof PollTimeoutError) {
        setDraftError(
          "No draft yet after 15 minutes of checking. That's within the normal range for this Mind, not a failure " +
            "— hit \"Check again\".",
        );
      } else {
        setDraftError(
          `Checking the draft failed: ${err instanceof Error ? err.message : "unknown error"} — hit "Check again", the send may still have gone through.`,
        );
      }
    } finally {
      if (mountedRef.current) setDraftWaiting(false);
    }
  }

  function requestDraft(item: WatchItem) {
    if (!item.key) {
      toast("This member has no stable key to draft against — try reloading the page.");
      return;
    }
    setDraftKey(item.key);
    setDraftConfirmOpen(true);
  }

  async function askDraft() {
    if (!draftKey) return;
    setDraftConfirmOpen(false);
    setDraftLoading(true);
    setDraftError(null);
    setDraftText(null);
    setDraftStart(null);
    let start: DraftStart;
    try {
      start = await api.postOrThrow<DraftStart>("/api/draft/refresh", { confirm: true, memberKey: draftKey });
    } catch (err) {
      setDraftError(`Draft request failed: ${err instanceof Error ? err.message : "unknown error"}`);
      setDraftLoading(false);
      return;
    }
    setDraftLoading(false);
    setDraftStart(start);
    await waitForDraft(start);
  }

  async function copyDraft() {
    if (!draftText) return;
    try {
      await navigator.clipboard.writeText(draftText);
      toast("Copied — paste it wherever you'd actually send it.");
    } catch {
      toast("Couldn't copy automatically — select the text and copy it manually.");
    }
  }

  return <PageShell eyebrow="Live community mind · public demo" showBudget>
    <div className="container demo-page">
      <div className="demo-heading"><div><SectionLabel tone="mint">Beat A · the memory reveal</SectionLabel><h1>What the Mind is <em>holding.</em></h1><p>Kith looks for changes in a person’s own rhythm—not a generic activity score.</p></div><div className="demo-heading-meta"><div className="live-status"><PresencePulse tone="mint" label="live mind online" /><span>Mind online</span></div>{usingFallback && <span className="fixture-note">illustrative fixture</span>}</div></div>

      <section className="dashboard-grid">
        <Surface className="watchlist-panel" accent="mint"><div className="panel-heading"><div><span className="panel-kicker"><UsersRound size={14} /> watchlist</span><h2>People to hold lightly.</h2></div><span className="count-bubble">{watchCount}</span></div>{watchCount ? <div className="watch-list">{watch.watching.map((item, index) => <WatchCard
          key={`${item.key || item.member || item.name}-${index}`}
          item={item}
          index={index}
          onDraft={requestDraft}
          isDraftTarget={Boolean(item.key) && item.key === draftKey}
          draftLoading={draftLoading}
          draftWaiting={draftWaiting}
          draftText={draftText}
          draftError={draftError}
          onCheckDraftAgain={() => { setDraftError(null); if (draftStart) waitForDraft(draftStart); }}
          onCopyDraft={copyDraft}
        />)}</div> : <EmptyState />}</Surface>
        <div className="comparison-zone"><div className="comparison-heading"><div><span className="panel-kicker"><Sparkles size={14} /> comparison</span><h2>Same question. Different memory.</h2></div><span className="comparison-caption">Beat A</span></div><div className="answer-grid"><AnswerCard kind="baseline" source={baseline.source || "Same model. Memory disabled."} answer={baseline.answer || "No answer captured yet."} foot={baseline.note || "A useful start, without continuity."} /><div className="answer-bridge"><span>vs.</span></div><AnswerCard kind="kith" source={live.source || "Kith — reading the community it remembers."} answer={unsafe ? "This cached answer needs a gentle pause before it goes on camera." : liveText || "No cached answer yet."} foot={unsafe ? "Pronoun safety guard engaged." : live.capturedAt ? `captured ${live.capturedAt}` : "cached, not a new spend"} unsafe={unsafe} pronounIssues={pronounIssues} /></div><div className="comparison-actions"><button className="receipts-toggle" onClick={() => setReceipts((value) => !value)}>{receipts ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {receipts ? "Hide receipts" : `Open receipts · ${evidence.length || 3}`}</button><TactileButton variant="primary" onClick={() => setConfirmOpen(true)} disabled={loading || waiting || Boolean(liveStart && liveError)}><Zap size={15} /> {waiting ? "Kith is thinking…" : loading ? "Sending…" : "Ask Kith live"}</TactileButton></div>{receipts && <div className="receipts-panel">{evidence.length ? evidence.map((item, index) => <div className="receipt-row" key={`${item.timestamp}-${index}`}><span className="receipt-time"><Clock3 size={13} /> {item.timestamp || "recently"}</span><p>{item.text || item.detail}</p><span className="receipt-source">{item.source || "memory"}</span></div>) : <p className="muted-copy">The Mind has not left receipts for this read yet.</p>}</div>}
        {liveError && <div className="step-result step-result--error"><ShieldCheck size={16} /><span>{liveError}</span>{liveStart && <button className="text-button" onClick={() => { setLiveError(null); waitForLive(liveStart); }} disabled={waiting}>Check again</button>}</div>}</div>
      </section>

      <section className="demo-note-grid"><Surface className="demo-note demo-note--soft"><ShieldCheck size={22} /><div><h3>Careful by design</h3><p>Every live read is user-initiated, confirmed, and visible in the budget strip above. No auto-refresh. No hidden spend.</p></div></Surface><Surface className="demo-note demo-note--violet"><Database size={22} /><div><h3>Memory is personal</h3><p>Kith compares a person with their own pattern. The same silence can mean different things to different people.</p></div></Surface></section>
      <div className="demo-foot-links"><span>Want the autonomy proof?</span><a href="/demo/feed">Watch the live feed <ExternalLink size={14} /></a></div>
    </div>
    {confirmOpen && <div className="modal-backdrop" role="presentation"><div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><div className="confirm-icon"><Zap size={23} /></div><span className="panel-kicker">one deliberate look</span><h2 id="confirm-title">This spends real cognition.</h2><p>Kith will ask the Mind for a fresh read. It costs a small amount, and the result will be cached here for the demo.</p><div className="confirm-actions"><button className="text-button" onClick={() => setConfirmOpen(false)}>Not yet</button><TactileButton variant="dark" onClick={askLive}>Yes, ask Kith <ArrowRightIcon /></TactileButton></div></div></div>}
    {draftConfirmOpen && <div className="modal-backdrop" role="presentation"><div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="draft-confirm-title"><div className="confirm-icon"><PenLine size={23} /></div><span className="panel-kicker">draft, don't send</span><h2 id="draft-confirm-title">This spends real cognition too.</h2><p>Kith will draft a short check-in message. Nothing is ever sent to anyone automatically — you'll get text to copy and send yourself, or not, entirely your call.</p><div className="confirm-actions"><button className="text-button" onClick={() => setDraftConfirmOpen(false)}>Not yet</button><TactileButton variant="dark" onClick={askDraft}>Yes, draft it <PenLine size={15} /></TactileButton></div></div></div>}
  </PageShell>;
}

function WatchCard({
  item,
  index,
  onDraft,
  isDraftTarget,
  draftLoading,
  draftWaiting,
  draftText,
  draftError,
  onCheckDraftAgain,
  onCopyDraft,
}: {
  item: WatchItem;
  index: number;
  onDraft: (item: WatchItem) => void;
  isDraftTarget: boolean;
  draftLoading: boolean;
  draftWaiting: boolean;
  draftText: string | null;
  draftError: string | null;
  onCheckDraftAgain: () => void;
  onCopyDraft: () => void;
}) {
  const name = item.member || item.name || item.alias || "Someone in the room";
  const tags = item.signals || (item.signal ? [item.signal] : ["quiet signal"]);
  const showDraftUi = isDraftTarget && (draftLoading || draftWaiting || draftText !== null || draftError);
  return <div className="watch-card" style={{ "--stagger": `${index * 55}ms` } as React.CSSProperties}><div className="watch-card-top"><div className="member-avatar">{name.slice(0, 1).toLowerCase()}</div><div className="member-ident"><div><h3>{name}</h3><PresencePulse tone={index === 0 ? "butter" : "mint"} label="presence noticed" /></div><span>{item.lastSeen || "rhythm changed recently"}</span></div><button className="dots-button" aria-label={`More about ${name}`} onClick={() => toast(`${name} is being held in context.`)}>•••</button></div><p>{item.headline || item.reason || "A small change in the usual rhythm."}</p><div className="signal-row">{tags.slice(0, 3).map((tag, i) => <SignalTag key={tag} tone={i === 0 ? "butter" : i === 1 ? "mint" : "lavender"}>{tag}</SignalTag>)}</div>
    <button className="text-button draft-trigger" onClick={() => onDraft(item)} disabled={isDraftTarget && (draftLoading || draftWaiting)}>
      <PenLine size={13} /> {isDraftTarget && draftWaiting ? "Drafting…" : isDraftTarget && draftLoading ? "Sending…" : "Draft a check-in"}
    </button>
    {showDraftUi && <div className="draft-panel">
      {draftError
        ? <div className="step-result step-result--error"><ShieldCheck size={15} /><span>{draftError}</span><button className="text-button" onClick={onCheckDraftAgain} disabled={draftWaiting}>Check again</button></div>
        : draftText !== null
          ? <div className="draft-result"><p>{draftText}</p><button className="text-button" onClick={onCopyDraft}><Copy size={13} /> Copy</button></div>
          : <div className="step-result step-result--warn"><span>Kith is drafting — same real latency as a live read, up to 15 minutes actively checked here.</span></div>}
    </div>}
  </div>;
}

function AnswerCard({ kind, source, answer, foot, unsafe = false, pronounIssues = [] }: { kind: "baseline" | "kith"; source: string; answer: string; foot: string; unsafe?: boolean; pronounIssues?: { member: string; pronounUsed: string }[] }) {
  return <div className={`answer-card answer-card--${kind} ${unsafe ? "answer-card--unsafe" : ""}`}><div className="answer-top"><span className="answer-label">{kind === "kith" && <PresencePulse tone="mint" />}{source}</span><span className={`answer-chip ${kind === "kith" ? "answer-chip--warm" : ""}`}>{kind === "kith" ? "remembered" : "example"}</span></div>{unsafe ? <div className="gentle-pause"><ShieldCheck size={19} /><div><strong>Wait—this doesn’t feel right.</strong><span>{pronounIssues.length ? pronounIssues.map((issue, i) => <span key={issue.member}>{i > 0 && ", "}{issue.member} was called "{issue.pronounUsed}"</span>) : "A gendered pronoun was used somewhere in this answer."} — refresh before using it on camera.</span></div></div> : <p>{answer}</p>}<span className="answer-foot">{foot}</span></div>;
}

function ArrowRightIcon() { return <RefreshCw size={15} />; }
