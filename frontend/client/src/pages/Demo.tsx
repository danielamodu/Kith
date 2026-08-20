/* Kith Soft Spatial Studio: deliberate live reads, tactile comparison surfaces, and responsible delight. */
import { useEffect, useMemo, useState } from "react";
import { Activity, ChevronDown, ChevronUp, Clock3, Database, ExternalLink, RefreshCw, ShieldCheck, Sparkles, UsersRound, Zap } from "lucide-react";
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
            // one of up to 40 poll requests.
            sentMessageText: start.sentMessageText.slice(0, 300),
            afterFingerprint: start.afterFingerprint,
            sentAfter: start.sentAt,
            before: start.before,
          }),
        { isMounted: () => mountedRef.current },
      );
      setLive({ answer: status.answer, capturedAt: status.capturedAt, pronounIssues: status.pronounIssues });
      toast("The Mind has a fresh read.");
      setLiveStart(null);
      setLiveError(null);
    } catch (err) {
      if (err instanceof PollAbortedError) return;
      if (err instanceof PollTimeoutError) {
        setLiveError(
          "Still no reply after 2 minutes. Nothing indicates the send failed — this is most likely just slow, not broken. Hit \"Check again\".",
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
    toast("Sent — this can take a minute or two while Kith actually reads it.");
    await waitForLive(start);
  }

  return <PageShell eyebrow="Live community mind · public demo" showBudget>
    <div className="container demo-page">
      <div className="demo-heading"><div><SectionLabel tone="mint">Beat A · the memory reveal</SectionLabel><h1>What the Mind is <em>holding.</em></h1><p>Kith looks for changes in a person’s own rhythm—not a generic activity score.</p></div><div className="demo-heading-meta"><div className="live-status"><PresencePulse tone="mint" label="live mind online" /><span>Mind online</span></div>{usingFallback && <span className="fixture-note">illustrative fixture</span>}</div></div>

      <section className="dashboard-grid">
        <Surface className="watchlist-panel" accent="mint"><div className="panel-heading"><div><span className="panel-kicker"><UsersRound size={14} /> watchlist</span><h2>People to hold lightly.</h2></div><span className="count-bubble">{watchCount}</span></div>{watchCount ? <div className="watch-list">{watch.watching.map((item, index) => <WatchCard key={`${item.member || item.name}-${index}`} item={item} index={index} />)}</div> : <EmptyState />}</Surface>
        <div className="comparison-zone"><div className="comparison-heading"><div><span className="panel-kicker"><Sparkles size={14} /> comparison</span><h2>Same question. Different memory.</h2></div><span className="comparison-caption">Beat A</span></div><div className="answer-grid"><AnswerCard kind="baseline" source={baseline.source || "Same model. Memory disabled."} answer={baseline.answer || "No answer captured yet."} foot={baseline.note || "A useful start, without continuity."} /><div className="answer-bridge"><span>vs.</span></div><AnswerCard kind="kith" source={live.source || "Kith — reading the community it remembers."} answer={unsafe ? "This cached answer needs a gentle pause before it goes on camera." : liveText || "No cached answer yet."} foot={unsafe ? "Pronoun safety guard engaged." : live.capturedAt ? `captured ${live.capturedAt}` : "cached, not a new spend"} unsafe={unsafe} pronounIssues={pronounIssues} /></div><div className="comparison-actions"><button className="receipts-toggle" onClick={() => setReceipts((value) => !value)}>{receipts ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {receipts ? "Hide receipts" : `Open receipts · ${evidence.length || 3}`}</button><TactileButton variant="primary" onClick={() => setConfirmOpen(true)} disabled={loading || waiting || Boolean(liveStart && liveError)}><Zap size={15} /> {waiting ? "Kith is thinking…" : loading ? "Sending…" : "Ask Kith live"}</TactileButton></div>{receipts && <div className="receipts-panel">{evidence.length ? evidence.map((item, index) => <div className="receipt-row" key={`${item.timestamp}-${index}`}><span className="receipt-time"><Clock3 size={13} /> {item.timestamp || "recently"}</span><p>{item.text || item.detail}</p><span className="receipt-source">{item.source || "memory"}</span></div>) : <p className="muted-copy">The Mind has not left receipts for this read yet.</p>}</div>}
        {liveError && <div className="step-result step-result--error"><ShieldCheck size={16} /><span>{liveError}</span>{liveStart && <button className="text-button" onClick={() => { setLiveError(null); waitForLive(liveStart); }} disabled={waiting}>Check again</button>}</div>}</div>
      </section>

      <section className="demo-note-grid"><Surface className="demo-note demo-note--soft"><ShieldCheck size={22} /><div><h3>Careful by design</h3><p>Every live read is user-initiated, confirmed, and visible in the budget strip above. No auto-refresh. No hidden spend.</p></div></Surface><Surface className="demo-note demo-note--violet"><Database size={22} /><div><h3>Memory is personal</h3><p>Kith compares a person with their own pattern. The same silence can mean different things to different people.</p></div></Surface></section>
      <div className="demo-foot-links"><span>Want the autonomy proof?</span><a href="/demo/feed">Watch the live feed <ExternalLink size={14} /></a></div>
    </div>
    {confirmOpen && <div className="modal-backdrop" role="presentation"><div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><div className="confirm-icon"><Zap size={23} /></div><span className="panel-kicker">one deliberate look</span><h2 id="confirm-title">This spends real cognition.</h2><p>Kith will ask the Mind for a fresh read. It costs a small amount, and the result will be cached here for the demo.</p><div className="confirm-actions"><button className="text-button" onClick={() => setConfirmOpen(false)}>Not yet</button><TactileButton variant="dark" onClick={askLive}>Yes, ask Kith <ArrowRightIcon /></TactileButton></div></div></div>}
  </PageShell>;
}

function WatchCard({ item, index }: { item: WatchItem; index: number }) {
  const name = item.member || item.name || item.alias || "Someone in the room";
  const tags = item.signals || (item.signal ? [item.signal] : ["quiet signal"]);
  return <div className="watch-card" style={{ "--stagger": `${index * 55}ms` } as React.CSSProperties}><div className="watch-card-top"><div className="member-avatar">{name.slice(0, 1).toLowerCase()}</div><div className="member-ident"><div><h3>{name}</h3><PresencePulse tone={index === 0 ? "butter" : "mint"} label="presence noticed" /></div><span>{item.lastSeen || "rhythm changed recently"}</span></div><button className="dots-button" aria-label={`More about ${name}`} onClick={() => toast(`${name} is being held in context.`)}>•••</button></div><p>{item.headline || item.reason || "A small change in the usual rhythm."}</p><div className="signal-row">{tags.slice(0, 3).map((tag, i) => <SignalTag key={tag} tone={i === 0 ? "butter" : i === 1 ? "mint" : "lavender"}>{tag}</SignalTag>)}</div></div>;
}

function AnswerCard({ kind, source, answer, foot, unsafe = false, pronounIssues = [] }: { kind: "baseline" | "kith"; source: string; answer: string; foot: string; unsafe?: boolean; pronounIssues?: { member: string; pronounUsed: string }[] }) {
  return <div className={`answer-card answer-card--${kind} ${unsafe ? "answer-card--unsafe" : ""}`}><div className="answer-top"><span className="answer-label">{kind === "kith" && <PresencePulse tone="mint" />}{source}</span><span className={`answer-chip ${kind === "kith" ? "answer-chip--warm" : ""}`}>{kind === "kith" ? "remembered" : "example"}</span></div>{unsafe ? <div className="gentle-pause"><ShieldCheck size={19} /><div><strong>Wait—this doesn’t feel right.</strong><span>{pronounIssues.length ? pronounIssues.map((issue, i) => <span key={issue.member}>{i > 0 && ", "}{issue.member} was called "{issue.pronounUsed}"</span>) : "A gendered pronoun was used somewhere in this answer."} — refresh before using it on camera.</span></div></div> : <p>{answer}</p>}<span className="answer-foot">{foot}</span></div>;
}

function ArrowRightIcon() { return <RefreshCw size={15} />; }
