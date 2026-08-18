/* Kith Soft Spatial Studio: Docs, Privacy, and Terms of Service pages maintaining the parchment/tactile aesthetic. */
import { ArrowRight, BookOpen, Lock, Scale, ShieldCheck, Sparkles } from "lucide-react";
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
        </section>
        <div className="how-cta" style={{ marginTop: "60px" }}>
          <div>
            <h2>Ready to test the endpoints?</h2>
            <p>Check the live demo or inspect the code on GitHub.</p>
          </div>
          <TactileButton href="/demo">Open live demo</TactileButton>
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
            <p>The pronoun safety guard checks cached responses for stale data and gendered pronouns before anything reaches the creator or demo screen.</p>
          </Surface>
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
            <p>Kith is provided as-is for demonstration and educational purposes. No simulated accounts or paid subscriptions are required or provisioned in this public preview.</p>
          </Surface>
          <Surface className="mechanism-card" accent="mint">
            <span className="panel-kicker"><Sparkles size={14} /> open collaboration</span>
            <h2>Fork & Build</h2>
            <p>You are welcome to inspect, test, and adapt the Kith frontend and backend architecture for your own creator communities.</p>
          </Surface>
        </section>
        <div className="how-cta" style={{ marginTop: "60px" }}>
          <div>
            <h2>Explore the codebase</h2>
            <p>View the repository and documentation on GitHub.</p>
          </div>
          <TactileButton href="/">Return home</TactileButton>
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
