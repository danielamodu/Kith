/* Kith Soft Spatial Studio: Docs, Privacy, and Terms of Service pages maintaining the parchment/tactile aesthetic. */
import { ArrowRight, BookOpen, CircleAlert, Database, Github, HeartHandshake, Lock, Scale, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { Link, useRoute } from "wouter";
import { PageShell, SectionLabel, Surface, TactileButton, assetUrls } from "@/components/KithShell";

export function DocsPage() {
  return (
    <PageShell eyebrow="Developer documentation · Kith Mind">
      <div className="container how-page" style={{ padding: "74px 0 80px" }}>
        <div className="how-hero">
          <div>
            <SectionLabel tone="butter">API & Architecture</SectionLabel>
            <h1>How Kith talks to the <em>Mind.</em></h1>
            <p>Kith is built on top of Minds by Animoca Brands. The backend server manages secure CLI calls, watches local state, and serves a crisp JSON API.</p>
          </div>
          <div className="how-hero-orb">
            <img src={assetUrls.mark} alt="" />
            <span>api<br />contract</span>
          </div>
        </div>
        <section className="mechanism-grid">
          <Surface className="mechanism-card" accent="mint">
            <span className="panel-kicker"><BookOpen size={14} /> watch endpoints</span>
            <h2>The Watchlist & Briefing</h2>
            <p><code>GET /api/watchlist</code> returns currently flagged members with signal tags like gap-drift and tone-shift. <code>GET /api/briefing</code> provides timestamped evidence for the Mind's answers.</p>
          </Surface>
          <Surface className="mechanism-card" accent="lavender">
            <span className="panel-kicker"><Sparkles size={14} /> cognition gating</span>
            <h2>Deliberate Refreshes</h2>
            <p><code>POST /api/live-answer/refresh</code> requires an explicit <code>&#123; confirm: true &#125;</code> body. This prevents accidental billing and ensures every live read is intentional.</p>
          </Surface>
          <Surface className="mechanism-card" accent="butter">
            <span className="panel-kicker"><Database size={14} /> the registry</span>
            <h2>Members & Baseline</h2>
            <p><code>GET /api/registry</code> returns every member's personal baseline — posting rhythm, contribution, tone norm. <code>GET /api/baseline</code> serves the hand-authored "memory disabled" comparison panel.</p>
          </Surface>
          <Surface className="mechanism-card" accent="coral">
            <span className="panel-kicker"><ShieldCheck size={14} /> autonomy proof</span>
            <h2>Session & Live Feed</h2>
            <p><code>GET /api/live-feed</code> reads the fixed conversation Beat B watches. <code>POST /api/session/mark-restart</code> sets the marker an unprompted reply gets checked against — never editable from the UI, so an old thread can't accidentally get reopened.</p>
          </Surface>
        </section>
        <section className="honesty-section">
          <div className="honesty-intro">
            <SectionLabel tone="mint">two ways to run it</SectionLabel>
            <h2>Equip the <em>Skill</em>, or run your <em>own instance.</em></h2>
            <p>Both talk to the same underlying mechanism. Pick whichever fits how you want to operate.</p>
          </div>
          <div className="honesty-cards">
            <div className="honesty-item">
              <Sparkles size={20} />
              <div>
                <h3>Equip the Bazaar Skill</h3>
                <p><code>minds mind skills equip --id EFCE4B3E-F36B-1410-8466-00039CE7DF11</code> on your own Mind. Your Mind now reasons like Kith over whatever registry-shaped Artifact it has — nothing hosted by us.</p>
              </div>
            </div>
            <div className="honesty-item">
              <Github size={20} />
              <div>
                <h3>Run your own instance</h3>
                <p>Clone the repo, point it at your own Mind and your own Discord or Telegram community. Full walkthrough in <code>docs/self-hosting.md</code> on GitHub.</p>
              </div>
            </div>
          </div>
        </section>
        <div className="how-cta" style={{ marginTop: "60px" }}>
          <div>
            <h2>Ready to test the endpoints?</h2>
            <p>Check the live demo or inspect the code on GitHub.</p>
          </div>
          <a href="https://github.com/danielamodu/Kith" target="_blank" rel="noreferrer" className="tactile-button tactile-button--primary">Open GitHub</a>
        </div>
      </div>
    </PageShell>
  );
}

export function PrivacyPage() {
  return (
    <PageShell eyebrow="Privacy & Trust · Kith">
      <div className="container how-page" style={{ padding: "74px 0 80px" }}>
        <div className="how-hero">
          <div>
            <SectionLabel tone="mint">Care without surveillance</SectionLabel>
            <h1>Privacy is about <em>respect.</em></h1>
            <p>Kith is designed to help creators notice people who are drifting away—not to police or surveil community activity.</p>
          </div>
          <div className="how-hero-orb">
            <img src={assetUrls.mark} alt="" />
            <span>no<br />surveillance</span>
          </div>
        </div>
        <section className="mechanism-grid">
          <Surface className="mechanism-card" accent="butter">
            <span className="panel-kicker"><Lock size={14} /> local baseline</span>
            <h2>Personal Rhythms</h2>
            <p>Kith measures each member against their own historical cadence rather than applying a global activity threshold. Data is handled transparently and honestly.</p>
          </Surface>
          <Surface className="mechanism-card" accent="coral">
            <span className="panel-kicker"><ShieldCheck size={14} /> pronoun safety</span>
            <h2>Built-in Safeguards</h2>
            <p>The pronoun safety guard checks cached responses for gendered pronouns before anything reaches the creator or demo screen. Kith never infers a pronoun from a name.</p>
          </Surface>
          <Surface className="mechanism-card" accent="mint">
            <span className="panel-kicker"><Database size={14} /> where it lives</span>
            <h2>Nothing Routes Through Us</h2>
            <p>Whether you equip the Bazaar Skill or self-host, your community's data lives in your own Discord or Telegram and your own Mind's memory. We don't run a central server that sees it, store a copy, or have access to it.</p>
          </Surface>
          <Surface className="mechanism-card" accent="lavender">
            <span className="panel-kicker"><Wallet size={14} /> optional payout</span>
            <h2>Off By Default</h2>
            <p>Kith can optionally settle recognition as a stablecoin payout through the Mind's own wallet. It ships disabled. Turning it on is the creator's decision, made on their own Mind — we never handle or see any payout data.</p>
          </Surface>
        </section>
        <section className="honesty-section">
          <div className="honesty-intro">
            <SectionLabel tone="coral">what kith never does</SectionLabel>
            <h2>Stated <em>plainly,</em> not implied.</h2>
          </div>
          <div className="honesty-cards">
            <div className="honesty-item">
              <HeartHandshake size={20} />
              <div>
                <h3>Never contacts a member directly</h3>
                <p>Kith tells the creator what it noticed. The creator decides whether and how to reach out — Kith doesn't message, moderate, or take action on its own.</p>
              </div>
            </div>
            <div className="honesty-item">
              <CircleAlert size={20} />
              <div>
                <h3>Never asserts a cause for silence</h3>
                <p>A gap in someone's activity is treated as a question, not a diagnosis. Kith proposes categories — illness, a holiday, burnout, disengagement — and never concludes which one is true.</p>
              </div>
            </div>
          </div>
        </section>
        <section className="data-disclosure">
          <div><Sparkles size={18} /><span>Current demo data</span></div>
          <p>The public live demo runs on a disclosed synthetic community, not real member data — labelled as such on screen, never presented as real. If a real community's history is used, it requires explicit consent from the community owner, and separately from anyone featured by name.</p>
        </section>
        <div className="how-cta" style={{ marginTop: "60px" }}>
          <div>
            <h2>Have privacy questions?</h2>
            <p>Reach out via our GitHub repository or community channels.</p>
          </div>
          <TactileButton href="/how-it-works">Read the mechanism</TactileButton>
        </div>
      </div>
    </PageShell>
  );
}

export function TermsPage() {
  return (
    <PageShell eyebrow="Terms of Service · Kith">
      <div className="container how-page" style={{ padding: "74px 0 80px" }}>
        <div className="how-hero">
          <div>
            <SectionLabel tone="coral">Jam scope & license</SectionLabel>
            <h1>Open source & <em>transparent.</em></h1>
            <p>Kith was built for Creative Minds Jam #1 in Hong Kong, leveraging Minds by Animoca Brands under open hackathon terms.</p>
          </div>
          <div className="how-hero-orb">
            <img src={assetUrls.mark} alt="" />
            <span>jam<br />terms</span>
          </div>
        </div>
        <section className="mechanism-grid">
          <Surface className="mechanism-card" accent="lavender">
            <span className="panel-kicker"><Scale size={14} /> hackathon scope</span>
            <h2>As-Is Software</h2>
            <p>Kith is provided as-is for demonstration and educational purposes, with no warranty of any kind, express or implied. No simulated accounts or paid subscriptions are required or provisioned in this public preview.</p>
          </Surface>
          <Surface className="mechanism-card" accent="mint">
            <span className="panel-kicker"><Sparkles size={14} /> open collaboration</span>
            <h2>Fork & Build</h2>
            <p>Licensed under MIT — see the <code>LICENSE</code> file in the repository. You're welcome to inspect, test, fork, and adapt Kith's frontend and backend for your own creator communities, commercially or otherwise.</p>
          </Surface>
          <Surface className="mechanism-card" accent="butter">
            <span className="panel-kicker"><Database size={14} /> platform terms</span>
            <h2>Minds Applies Too</h2>
            <p>Equipping the Kith Skill or running your own Mind means you're also bound by Minds by Animoca Brands' own terms of service — Kith doesn't override or replace them.</p>
          </Surface>
          <Surface className="mechanism-card" accent="coral">
            <span className="panel-kicker"><Wallet size={14} /> if you enable payouts</span>
            <h2>You Handle Your Own Tax</h2>
            <p>The optional stablecoin payout layer settles through your own Mind's wallet. Any tax or regulatory obligations from enabling it are yours to handle — Kith doesn't provide financial, tax, or legal advice.</p>
          </Surface>
        </section>
        <div className="how-cta" style={{ marginTop: "60px" }}>
          <div>
            <h2>Explore the codebase</h2>
            <p>View the repository, license, and documentation on GitHub.</p>
          </div>
          <a href="https://github.com/danielamodu/Kith" target="_blank" rel="noreferrer" className="tactile-button tactile-button--primary">View on GitHub</a>
        </div>
      </div>
    </PageShell>
  );
}

export default function LegalRouter() {
  const [matchDocs] = useRoute("/docs");
  const [matchPrivacy] = useRoute("/privacy");
  const [matchTerms] = useRoute("/terms");
  if (matchDocs) return <DocsPage />;
  if (matchPrivacy) return <PrivacyPage />;
  if (matchTerms) return <TermsPage />;
  return null;
}
