/* Kith Soft Spatial Studio: shared shell with tactile confirmation, warm pastels, and a calm spatial rail. */
import { ReactNode, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowUpRight, CircleHelp, Command, ExternalLink, Sparkles } from "lucide-react";
import { toast } from "sonner";

// Was /manus-storage/... — Manus's own dev-time storage proxy, which only
// exists inside their environment. Switched to self-hosted copies (see
// assets/kith/README.md) so these actually load once served from anywhere
// else, including here.
export const assetUrls = {
  hero: "/assets/kith/kith-hero-studio.jpg",
  memory: "/assets/kith/kith-memory-scene.jpg",
  continuity: "/assets/kith/kith-continuity-scene.jpg",
  signal: "/assets/kith/kith-signal-scene.jpg",
  mark: "/assets/kith/kith-mark.png",
  lockup: "/assets/kith/kith-logo-transparent.png",
};

export type WatchItem = {
  member?: string;
  name?: string;
  alias?: string;
  signal?: string;
  signals?: string[];
  headline?: string;
  reason?: string;
  lastSeen?: string;
};

export type Evidence = { timestamp?: string; text?: string; source?: string; detail?: string };

export type Briefing = {
  headline?: string;
  member?: string;
  signals?: string[];
  evidence?: Evidence[];
};

export const api = {
  async get<T>(path: string, fallback: T): Promise<T> {
    try {
      const response = await fetch(path, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`Request failed: ${response.status}`);
      return (await response.json()) as T;
    } catch {
      return fallback;
    }
  },
  async post<T>(path: string, body: unknown, fallback: T): Promise<T> {
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`Request failed: ${response.status}`);
      return (await response.json()) as T;
    } catch {
      return fallback;
    }
  },
  // For actions where a failure must never look like success — spending
  // real cognition and silently falling back to filler text is actively
  // misleading, unlike a read falling back to illustrative fixture data,
  // which is a deliberate and honest degradation. Throws instead of
  // swallowing, so the caller can show what actually happened.
  async postOrThrow<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}) as Record<string, unknown>);
    if (!response.ok) {
      throw new Error(typeof data.error === "string" ? data.error : `Request failed: ${response.status}`);
    }
    return data as T;
  },
};

/** Tracks whether the calling component is still mounted, for loops that outlive one render. */
export function useMountedRef() {
  const ref = useRef(true);
  useEffect(() => {
    ref.current = true;
    return () => {
      ref.current = false;
    };
  }, []);
  return ref;
}

export class PollAbortedError extends Error {}
export class PollTimeoutError extends Error {}

/**
 * Poll `check` on an interval until it reports `{ done: true }`.
 *
 * Two failure modes this exists to avoid, both real bugs found in an
 * earlier version of this pattern (the setup wizard's push flow and Beat
 * A's live-answer refresh both wait on a Mind reply that can take 76-111s,
 * longer than any single request should be held open for):
 *   1. Wrapping the whole multi-minute loop in one try/catch — a single
 *      transient failure (one flaky network blip) would abort the entire
 *      wait and report "failed" even though the underlying send succeeded
 *      and the very next check would likely have found the reply. Fixed
 *      here by isolating each attempt and only giving up after several
 *      *consecutive* failures, not the first one.
 *   2. No tie to component lifecycle — if the user navigates away mid-poll,
 *      the loop kept firing requests and eventually called setState on an
 *      unmounted component. Fixed by checking `isMounted` before every
 *      sleep and every attempt, throwing PollAbortedError rather than
 *      continuing (or setting state) once it returns false.
 */
export async function pollUntilDone<T extends { done: boolean }>(
  check: () => Promise<T>,
  opts: { intervalMs?: number; maxAttempts?: number; maxConsecutiveFailures?: number; isMounted?: () => boolean } = {},
): Promise<T> {
  const intervalMs = opts.intervalMs ?? 3000;
  const maxAttempts = opts.maxAttempts ?? 40;
  const maxConsecutiveFailures = opts.maxConsecutiveFailures ?? 3;
  let consecutiveFailures = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    if (opts.isMounted && !opts.isMounted()) {
      throw new PollAbortedError("Stopped polling — the page navigated away.");
    }
    try {
      const result = await check();
      consecutiveFailures = 0;
      if (result.done) return result;
    } catch (err) {
      consecutiveFailures++;
      if (consecutiveFailures >= maxConsecutiveFailures) throw err;
    }
  }
  throw new PollTimeoutError(`Still not done after ${maxAttempts} checks.`);
}

export function useBudget() {
  const fallback = { liveCallCount: 0, totalSpent: 0, entries: [] as unknown[] };
  const [budget, setBudget] = useState(fallback);
  useEffect(() => {
    let active = true;
    api.get("/api/budget", fallback).then((data) => active && setBudget(data));
    return () => { active = false; };
  }, []);
  return budget;
}

export function PresencePulse({ tone = "mint", label = "presence" }: { tone?: "mint" | "butter" | "coral"; label?: string }) {
  return <span className={`presence-pulse presence-pulse--${tone}`} aria-label={label} title={label} />;
}

export function TactileButton({
  children,
  variant = "primary",
  onClick,
  href,
  disabled = false,
  className = "",
  type = "button",
}: {
  children: ReactNode;
  variant?: "primary" | "soft" | "quiet" | "dark" | "danger";
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  const classes = `tactile-button tactile-button--${variant} ${className}`;
  const [magnet, setMagnet] = useState({ x: 0, y: 0 });
  function moveMagnet(event: React.MouseEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setMagnet({ x: (event.clientX - (rect.left + rect.width / 2)) * 0.08, y: (event.clientY - (rect.top + rect.height / 2)) * 0.08 });
  }
  const tactileProps = { className: classes, style: { "--magnet-x": `${magnet.x}px`, "--magnet-y": `${magnet.y}px` } as React.CSSProperties, onMouseMove: moveMagnet, onMouseLeave: () => setMagnet({ x: 0, y: 0 }) };
  if (href) return <Link href={href} {...tactileProps}>{children}<ArrowUpRight size={16} strokeWidth={2.4} /></Link>;
  return <button type={type} {...tactileProps} onClick={onClick} disabled={disabled}>{children}</button>;
}

export function PageShell({ children, eyebrow, showBudget = false }: { children: ReactNode; eyebrow?: string; showBudget?: boolean }) {
  const [location] = useLocation();
  const budget = useBudget();
  const live = location.startsWith("/demo");
  return (
    <div className="kith-app">
      <div className="kith-noise" aria-hidden="true" />
      <header className="topbar">
        <Link href="/" className="brand" aria-label="Kith home">
          <span className="brand-mark"><img src={assetUrls.mark} alt="" /></span>
          <span className="brand-word">kith<span className="brand-dot">.</span></span>
        </Link>
        <div className="topbar-center">{eyebrow || (live ? "Live community mind" : "A gentle edge for creator communities")}</div>
        <nav className="topnav" aria-label="Primary navigation">
          <Link href="/demo" className={location === "/demo" ? "is-active" : ""}>Demo</Link>
          <Link href="/demo/feed" className={location === "/demo/feed" ? "is-active" : ""}>Live feed</Link>
          <Link href="/how-it-works" className={location === "/how-it-works" ? "is-active" : ""}>How it works</Link>
          <Link href="/setup" className={location === "/setup" ? "is-active" : ""}>Set up yours</Link>
          <button className="icon-button" onClick={() => toast("Kith notices the quiet parts.")} aria-label="About Kith"><CircleHelp size={17} /></button>
        </nav>
      </header>
      {showBudget && <div className="budget-strip"><span><Sparkles size={14} /> Mind budget</span><b>{budget.liveCallCount} live {budget.liveCallCount === 1 ? "read" : "reads"}</b><span className="budget-separator">·</span><span>{budget.totalSpent ? `${budget.totalSpent.toFixed(1)} cognition spent` : "No cognition spent yet"}</span><span className="budget-honest"><Command size={13} /> Deliberate reads only</span></div>}
      <main>{children}</main>
      <footer className="footer"><span>Built for creators who notice people.</span><span className="footer-links"><Link href="/docs">Docs</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><a href="https://github.com/danielamodu/Kith" target="_blank" rel="noreferrer">GitHub <ExternalLink size={12} /></a><span>Creative Minds Jam · Hong Kong</span></span></footer>
    </div>
  );
}

export function SectionLabel({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "mint" | "butter" | "coral" | "lavender" }) {
  return <span className={`section-label section-label--${tone}`}><span className="section-label-dot" />{children}</span>;
}

export function SignalTag({ children, tone = "mint" }: { children: ReactNode; tone?: "mint" | "coral" | "lavender" | "butter" }) {
  return <span className={`signal-tag signal-tag--${tone}`}>{children}</span>;
}

export function Surface({
  children,
  className = "",
  accent = "",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  accent?: "" | "mint" | "butter" | "coral" | "lavender";
} & React.HTMLAttributes<HTMLElement>) {
  return <section className={`surface ${accent ? `surface--${accent}` : ""} ${className}`} {...rest}>{children}</section>;
}

export function EmptyState({ title = "All quiet — nobody needs you right now.", body = "Kith is holding the room open. When something changes, it will be here." }: { title?: string; body?: string }) {
  return <div className="empty-state"><img className="empty-lockup" src={assetUrls.lockup} alt="kith" /><div className="empty-orbit"><PresencePulse tone="mint" label="all quiet" /><span /><span /></div><h3>{title}</h3><p>{body}</p></div>;
}
