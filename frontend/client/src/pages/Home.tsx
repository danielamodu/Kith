/* Kith Soft Spatial Studio: editorial warmth, tactile surfaces, and a clear path into the live Mind. */
import { ArrowDown, ArrowRight, ArrowUpRight, Eye, Heart, Layers3, Sparkles, WandSparkles } from "lucide-react";
import { Link } from "wouter";
import { PageShell, SectionLabel, SignalTag, Surface, TactileButton, PresencePulse, assetUrls } from "@/components/KithShell";

const exampleSignals = ["contribution", "gap drift", "tone shift"];

export default function Home() {
  return (
    <PageShell>
      <section className="hero container">
        <div className="hero-copy">
          <div className="eyebrow-row"><span className="eyebrow-pill"><Sparkles size={13} /> Community memory, with a pulse</span><span className="eyebrow-note">for the people who make things together</span></div>
          <h1>The people you’re missing are usually the <em>quiet ones.</em></h1>
          <p className="hero-sub">Kith remembers the shape of your community, then gently points to what a busy creator can no longer see.</p>
          <div className="hero-actions"><TactileButton href="/demo">Show me what Kith remembers</TactileButton><Link href="/how-it-works" className="text-link">See the thinking <ArrowRight size={15} /></Link></div>
          <div className="hero-proof"><span className="avatar-stack"><i>J</i><i>M</i><i>R</i></span><span><b>A small mind for a big room.</b><br />No surveillance. Just a little more continuity.</span></div>
        </div>
        <div className="hero-art-wrap">
          <div className="hero-art-card"><img src={assetUrls.hero} alt="Soft spatial studio with floating memory cards" /><div className="hero-art-overlay"><div className="mini-presence"><PresencePulse tone="mint" label="quietly present" /><span>quietly present</span></div><strong>Marisol has been here<br />less than usual.</strong><span className="hero-art-caption">Kith noticed the change in her rhythm.</span></div></div>
          <div className="hero-float hero-float--top"><span className="float-kicker">new thread</span><b>someone arrived</b><span className="float-line" /></div>
          <div className="hero-float hero-float--bottom"><span className="float-dot" /> warm follow-up <ArrowUpRight size={14} /></div>
        </div>
        <div className="hero-scroll"><ArrowDown size={14} /><span>scroll to meet the Mind</span></div>
      </section>

      <section className="section container problem-section">
        <div className="section-intro"><SectionLabel tone="coral">the room gets bigger</SectionLabel><h2>Past a few hundred people, “keeping up” becomes a <em>feeling.</em></h2></div>
        <div className="problem-grid"><div className="problem-copy"><p>You remember the loud moments. The launches. The brilliant threads. But the quiet drift is different: a regular who stops contributing, a newcomer who never gets a reply, a tone that shortens one week at a time.</p><p>Kith gives the creator a second set of eyes—one that remembers each person’s baseline instead of applying one blunt rule to everyone.</p></div><div className="noticing-card"><div className="noticing-header"><span><PresencePulse tone="butter" label="noticing" /> noticing, not nudging</span><span className="mono-label">MIND / 001</span></div><div className="noticing-body"><div className="noticing-avatar">m</div><div><h3>quiet signals, held lightly</h3><p>“Maya’s usual rhythm is changing, but not in the same way Priya’s did last month.”</p></div></div><div className="noticing-footer"><SignalTag tone="mint">personal baseline</SignalTag><SignalTag tone="lavender">context, not score</SignalTag></div></div></div>
      </section>

      <section className="section container proof-section"><div className="section-intro"><SectionLabel tone="mint">the difference memory makes</SectionLabel><h2>Same model. <em>More of the room.</em></h2><p className="section-lede">An illustrative example of what Kith adds when the conversation has a history.</p></div><div className="compare-preview"><div className="answer-card answer-card--quiet"><div className="answer-top"><span className="answer-label">without memory</span><span className="answer-chip">example output</span></div><p>“It may help to check in with members who have been less active recently.”</p><span className="answer-foot">true, but thin.</span></div><div className="compare-arrow"><ArrowRight size={20} /></div><div className="answer-card answer-card--kith"><div className="answer-top"><span className="answer-label"><PresencePulse tone="mint" /> Kith remembers</span><span className="answer-chip answer-chip--warm">3 receipts</span></div><p>“Maya has gone quiet relative to her own Tuesday rhythm. She also welcomed a newcomer last week, then stopped replying.”</p><span className="answer-foot">specific enough to care.</span></div></div></section>

      <section className="section container properties-section"><div className="section-intro"><SectionLabel tone="lavender">three ways to keep seeing</SectionLabel><h2>A little continuity for the <em>human work.</em></h2></div><div className="property-grid"><PropertyCard index="01" title="Memory" text="Kith remembers every member’s normal rhythm, not just the loudest moments." icon={<Layers3 />} image={assetUrls.memory} tone="butter" /><PropertyCard index="02" title="Continuity" text="It connects the small signals that get lost between tabs, threads, and busy weeks." icon={<Heart />} image={assetUrls.continuity} tone="mint" /><PropertyCard index="03" title="Autonomous follow-up" text="When the room changes, Kith can gently raise its hand—without waiting for another prompt." icon={<Eye />} image={assetUrls.signal} tone="coral" /></div></section>

      <section className="cta-band container"><div><span className="eyebrow-pill"><WandSparkles size={13} /> one live Mind, ready to look</span><h2>Come see what the room is saying.</h2><p>The demo is public, deliberate, and honest about what it costs to ask Kith live.</p></div><TactileButton variant="dark" href="/demo">Open the live demo</TactileButton></section>

      <section className="section container vision-section"><div className="vision-copy"><SectionLabel tone="butter">available now</SectionLabel><h2>Your own Mind can become a Kith today.</h2><p>Kith is published as a Skill on the Minds Bazaar. Equip it on your own Mind and it starts reasoning the same way, over your own community — nothing hosted by us, nothing routed through us. Find it by searching "Kith," or run <code>minds mind skills equip --id EFCE4B3E-F36B-1410-8466-00039CE7DF11</code> directly.</p><a className="text-link" href="https://hellominds.ai/bazaar/skills" target="_blank" rel="noreferrer">Find "Kith" in the Bazaar <ArrowRight size={15} /></a></div><div className="vision-orbit"><div className="orbit orbit--one" /><div className="orbit orbit--two" /><div className="orbit-core"><img src={assetUrls.mark} alt="" /><span>mind<br />to mind</span></div><div className="orbit-note orbit-note--a">memory</div><div className="orbit-note orbit-note--b">care</div><div className="orbit-note orbit-note--c">context</div></div></section>
    </PageShell>
  );
}

function PropertyCard({ index, title, text, icon, image, tone }: { index: string; title: string; text: string; icon: React.ReactNode; image: string; tone: "butter" | "mint" | "coral" }) {
  return <Surface className={`property-card property-card--${tone}`}><div className="property-top"><span className="property-index">{index}</span><span className="property-icon">{icon}</span></div><div className="property-image"><img src={image} alt="" /></div><h3>{title}</h3><p>{text}</p></Surface>;
}
