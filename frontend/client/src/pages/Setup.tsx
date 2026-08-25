/* Kith Soft Spatial Studio: the web setup wizard — connect Discord, build a registry, push it to your own Mind. */
import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Hash,
  Loader2,
  Send,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import {
  api,
  PageShell,
  SectionLabel,
  Surface,
  TactileButton,
  assetUrls,
  pollUntilDone,
  useMountedRef,
  PollAbortedError,
  PollTimeoutError,
} from "@/components/KithShell";

type DiscordChannel = { id: string; name: string };
type ChannelCheck = { ok: boolean; sampled: number; withContent: number };
type BuildResult = {
  registry: { memberCount: number; members: unknown[] };
  briefing: { cases: Array<{ headline: string; member: string }> };
  watchlist: { watching: unknown[] };
  tokens: { registry: number; briefing: number; watchlist: number };
  stats: { pages: number; messagesSeen: number; windowDays: number; capped: boolean; oldest?: string };
};
type PushStart = { alias: string; sentAt: string; afterFingerprint?: string; sentMessageText: string; before: number | null };
type PushStatus = { done: boolean; text?: string; createdAt?: string; spent?: number | null };

export default function Setup() {
  // step 1 — invite the hosted bot, detect the server. No token paste: the
  // hosted bot is ours; the creator just adds it. The old paste-a-token
  // path survives as a fallback for when the deployment has no hosted bot.
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [hostedUnavailable, setHostedUnavailable] = useState(false);
  const [guilds, setGuilds] = useState<Array<{ id: string; name: string }>>([]);
  const [detecting, setDetecting] = useState(false);
  const [guildName, setGuildName] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  // step 2 — channel
  const [guildId, setGuildId] = useState("");
  const [channelId, setChannelId] = useState("");
  const [digestChannelId, setDigestChannelId] = useState("");
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [listingChannels, setListingChannels] = useState(false);
  const [checkingChannel, setCheckingChannel] = useState(false);
  const [channelCheck, setChannelCheck] = useState<ChannelCheck | null>(null);
  const [channelError, setChannelError] = useState<string | null>(null);

  // step 3 — build
  const [communityName, setCommunityName] = useState("");
  const [sinceDays, setSinceDays] = useState(14);
  const [building, setBuilding] = useState(false);
  const [buildResult, setBuildResult] = useState<BuildResult | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);

  // step 4 — push
  const [mindId, setMindId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [confirmPush, setConfirmPush] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushWaiting, setPushWaiting] = useState(false);
  const [pushResult, setPushResult] = useState<{ text: string; createdAt: string } | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushSpent, setPushSpent] = useState<number | null>(null);
  // null = not attempted yet; true/false = whether the guild registered for
  // the hosted cycle after the push landed
  const [cycleRegistered, setCycleRegistered] = useState<boolean | null>(null);
  // Kept so a failed *poll* (send already went through) can be resumed
  // with "Check again" instead of the user hitting "push" a second time
  // and creating an entirely separate conversation on their Mind.
  const [pushStart, setPushStart] = useState<PushStart | null>(null);
  const mountedRef = useMountedRef();

  const step2Open = Boolean(guildId) && (Boolean(guildName) || Boolean(botUsername));
  const step3Open = Boolean(channelCheck?.ok);
  const step4Open = Boolean(buildResult);

  async function loadInvite() {
    try {
      const result = await api.getOrThrow<{ url: string }>("/api/invite-url");
      setInviteUrl(result.url);
      window.open(result.url, "_blank", "noopener");
      toast("Invited Kith? Hit \"Detect my server\" next.");
    } catch {
      setHostedUnavailable(true);
    }
  }

  async function detectGuilds() {
    setDetecting(true);
    setTokenError(null);
    try {
      const result = await api.getOrThrow<{ guilds: Array<{ id: string; name: string }> }>("/api/setup/guilds");
      setGuilds(result.guilds);
      if (result.guilds.length === 0) {
        toast("Kith isn't in any server yet — use the invite button first.");
      }
    } catch (err) {
      setTokenError(err instanceof Error ? err.message : "Couldn't detect servers.");
    } finally {
      setDetecting(false);
    }
  }

  async function verifyToken() {
    setVerifying(true);
    setTokenError(null);
    try {
      const result = await api.postOrThrow<{ username: string }>("/api/setup/verify-discord", { token });
      setBotUsername(result.username);
      toast(`Connected as ${result.username}.`);
    } catch (err) {
      setBotUsername(null);
      setTokenError(err instanceof Error ? err.message : "Couldn't verify that token.");
    } finally {
      setVerifying(false);
    }
  }

  async function listChannels() {
    setListingChannels(true);
    setChannelError(null);
    try {
      const result = await api.postOrThrow<{ channels: DiscordChannel[] }>("/api/setup/list-channels", {
        token,
        guildId,
      });
      setChannels(result.channels);
      if (result.channels.length === 0) {
        setChannelError("No text channels visible to the bot in that server.");
      }
    } catch (err) {
      setChannelError(err instanceof Error ? err.message : "Couldn't list channels.");
    } finally {
      setListingChannels(false);
    }
  }

  async function checkChannel(id: string) {
    setChannelId(id);
    setCheckingChannel(true);
    setChannelError(null);
    setChannelCheck(null);
    try {
      const result = await api.postOrThrow<ChannelCheck>("/api/setup/check-channel", { token, channelId: id });
      setChannelCheck(result);
      if (!result.ok) {
        setChannelError(
          "Message Content Intent looks off — every sampled message came back empty. Enable it in the Discord Developer Portal (Bot → Message Content Intent), then check again.",
        );
      }
    } catch (err) {
      setChannelError(err instanceof Error ? err.message : "Couldn't read that channel.");
    } finally {
      setCheckingChannel(false);
    }
  }

  async function build() {
    setBuilding(true);
    setBuildError(null);
    try {
      const result = await api.postOrThrow<BuildResult>("/api/setup/build", {
        token,
        channelId,
        guildId: guildId || undefined,
        communityName: communityName || undefined,
        sinceDays,
      });
      setBuildResult(result);
      toast(`Built a memory for ${result.registry.memberCount} members.`);
    } catch (err) {
      setBuildResult(null);
      setBuildError(err instanceof Error ? err.message : "Couldn't build the registry.");
    } finally {
      setBuilding(false);
    }
  }

  // Shared by a fresh push and a "check again" recovery after a poll
  // failure — resumes against the SAME alias/start rather than starting a
  // new one, so a flaky poll can't turn into a second real conversation
  // and a second real charge on the user's Mind.
  async function waitForPush(start: PushStart) {
    setPushWaiting(true);
    try {
      const status = await pollUntilDone<PushStatus>(
        () =>
          api.postOrThrow<PushStatus>("/api/setup/push/status", {
            apiKey,
            mindId,
            alias: start.alias,
            // Truncated, not the full instruction text (which embeds the
            // whole registry — can be tens of KB): this is only compared
            // for a dedup check server-side, and the server-side sender-type
            // check alone already excludes our own sent message from being
            // mistaken for a reply. No need to re-upload the full payload
            // on every poll request.
            sentMessageText: start.sentMessageText.slice(0, 300),
            afterFingerprint: start.afterFingerprint,
            sentAfter: start.sentAt,
            before: start.before,
          }),
        // 5s x 180 = 15 minutes of active checking. Real observed reply
        // latency on this Mind has ranged 13s to 75+ minutes for a
        // comparable send, so a timeout here is not evidence of failure —
        // see the copy below and "Check again", which resumes against the
        // same alias rather than sending a second time.
        { isMounted: () => mountedRef.current, intervalMs: 5000, maxAttempts: 180 },
      );
      setPushResult({ text: status.text ?? "", createdAt: status.createdAt ?? "" });
      setPushSpent(status.spent ?? null);
      toast("Stored. Your Mind now holds this as a durable Artifact.");
      setPushStart(null);
    } catch (err) {
      if (err instanceof PollAbortedError) return; // navigated away — nothing to show
      if (err instanceof PollTimeoutError) {
        setPushError(
          "No reply yet after 15 minutes of checking. That's within the normal range we've seen for this Mind — " +
            "nothing indicates the send failed. Hit \"Check again\" below without reloading this page (reloading " +
            "loses track of this send — check `minds history` on your Mind directly if that happens), or copy " +
            "the registry JSON above and push it with `npm run push`.",
        );
      } else {
        setPushError(
          err instanceof Error
            ? err.message
            : "Checking the reply failed. Hit \"Check again\" — the send may still have gone through.",
        );
      }
    } finally {
      if (mountedRef.current) setPushWaiting(false);
    }
  }

  async function push() {
    if (!buildResult) return;
    setConfirmPush(false);
    setPushing(true);
    setPushError(null);
    setPushResult(null);
    setPushSpent(null);
    setPushStart(null);
    try {
      const start = await api.postOrThrow<PushStart>("/api/setup/push", {
        apiKey,
        mindId,
        registry: buildResult.registry,
        watchlist: buildResult.watchlist,
        confirm: true,
      });
      // Register the guild for the hosted cycle IMMEDIATELY after the send
      // — not after the reply lands. The artifacts are sent; the Mind's
      // confirmation only gates the success message, and its latency is
      // unbounded (observed: under a minute to over an hour). A creator who
      // gives up during the wait must still leave with the product switched
      // on: the first nightly cycle re-pushes and confirms on its own.
      try {
        await api.postOrThrow("/api/setup/connect", {
          guildId,
          guildName: guildName ?? undefined,
          channelIds: [channelId],
          ...(digestChannelId.trim() ? { digestChannelId: digestChannelId.trim() } : {}),
          apiKey,
          mindId,
        });
        setCycleRegistered(true);
      } catch {
        setCycleRegistered(false);
      }
      toast("Sent. Real replies have taken anywhere from under a minute to well over an hour — this page will keep checking, and you're already registered either way.");
      setPushStart(start);
      setPushing(false);
      await waitForPush(start);
    } catch (err) {
      setPushError(
        err instanceof Error
          ? err.message
          : "Push failed. Copy the registry JSON above and push it yourself with `npm run push`.",
      );
      setPushing(false);
    }
  }

  async function copyRegistry() {
    if (!buildResult) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(buildResult.registry, null, 2));
      toast("Registry JSON copied.");
    } catch {
      toast("Couldn't copy — your browser blocked the clipboard write. Try Download instead.");
    }
  }

  function downloadRegistry() {
    if (!buildResult) return;
    const blob = new Blob([JSON.stringify(buildResult.registry, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kith-registry.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Deferred, not called synchronously right after click(): some browsers
    // schedule the actual download read asynchronously, and revoking the
    // object URL immediately can race it into an empty/broken file.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <PageShell eyebrow="Set up your own Kith · Web wizard">
      <div className="container how-page" style={{ padding: "74px 0 90px" }}>
        <div className="how-hero">
          <div>
            <SectionLabel tone="coral">Give your Mind a memory</SectionLabel>
            <h1>Invite Kith. Pick a channel. <em>Done.</em></h1>
            <p>
              Four steps, no terminal, no developer portal: invite the bot, pick a channel, build the memory,
              push it into your own Mind. After the push, the nightly cycle takes over — Kith keeps reading,
              keeps remembering, and posts a digest only when something needs you.
            </p>
          </div>
          <div className="how-hero-orb">
            <img src={assetUrls.mark} alt="" />
            <span>your<br />memory</span>
          </div>
        </div>

        <div className="data-disclosure" style={{ marginBottom: "40px" }}>
          <div><ShieldCheck size={18} /><span>What happens to your credentials</span></div>
          <p>
            The hosted bot reads your server's public history — that is its whole function, and it never writes
            to your server except the digest channel you choose. Your Minds Builder API key is sent once, at
            connect time, encrypted at rest (AES-256-GCM) and decrypted only when a cycle talks to your Mind.
            It is never logged or displayed. Prefer nothing of yours on our side at all? The identical pipeline
            runs entirely on your own machine via <code>npm run setup</code> — see{" "}
            <a href="https://github.com/danielamodu/Kith/blob/main/docs/self-hosting.md" target="_blank" rel="noreferrer">
              docs/self-hosting.md
            </a>.
          </p>
        </div>

        <div className="wizard-steps">
          {/* Step 1 */}
          <Surface className="wizard-step" accent="butter">
            <StepHead num={1} done={step2Open} title="Invite Kith to your server" desc="One click, no developer portal. Kith reads history and stays quiet — members never see it post." />
            <div className="wizard-step-body">
              <div className="field-inline">
                <TactileButton variant="primary" onClick={loadInvite} disabled={!inviteUrl && hostedUnavailable}>
                  <Bot size={15} /> {inviteUrl ? "Invite again" : "Add Kith to my server"}
                </TactileButton>
                <TactileButton variant="soft" onClick={detectGuilds} disabled={detecting}>
                  {detecting ? <Loader2 size={15} className="spin" /> : <Check size={15} />}
                  {detecting ? "Looking…" : "Detect my server"}
                </TactileButton>
              </div>
              {guilds.length > 0 && (
                <div className="channel-list">
                  {guilds.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      className={`channel-chip ${guildId === g.id ? "is-selected" : ""}`}
                      onClick={() => { setGuildId(g.id); setGuildName(g.name); }}
                    >
                      {g.name}
                    </button>
                  ))}
                </div>
              )}
              {guildId && guildName && (
                <div className="step-result step-result--ok"><CheckCircle2 size={16} /> Watching <b>{guildName}</b>.</div>
              )}
              {!inviteUrl && !hostedUnavailable && (
                <p className="field-hint">Click the invite button — it opens Discord's own permission screen and nothing else.</p>
              )}
              {hostedUnavailable && (
                <>
                  <p className="field-hint">
                    This deployment isn't running a hosted bot. Self-host path: paste your own bot token below —
                    Discord Developer Portal → New Application → Bot → Reset Token, then enable{" "}
                    <b>Message Content Intent</b> on the Bot page.
                  </p>
                  <div className="field-inline">
                    <div className="field">
                      <label htmlFor="discord-token">Your bot token</label>
                      <input
                        id="discord-token"
                        type="password"
                        autoComplete="off"
                        placeholder="MTA1..."
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                      />
                    </div>
                    <TactileButton variant="primary" onClick={verifyToken} disabled={!token || verifying}>
                      {verifying ? <Loader2 size={15} className="spin" /> : <Bot size={15} />}
                      {verifying ? "Checking…" : "Verify bot"}
                    </TactileButton>
                  </div>
                </>
              )}
              {botUsername && (
                <div className="step-result step-result--ok"><CheckCircle2 size={16} /> Connected as <b>{botUsername}</b>.</div>
              )}
              {tokenError && <div className="step-result step-result--error"><AlertTriangle size={16} /> {tokenError}</div>}
            </div>
          </Surface>

          {/* Step 2 */}
          <Surface className="wizard-step" accent="mint" aria-disabled={!step2Open}>
            <StepHead num={2} done={step3Open} title="Pick a channel" desc="List your server's channels, or paste a channel id directly." />
            {step2Open && (
              <div className="wizard-step-body">
                <div className="field-inline">
                  <div className="field">
                    <label htmlFor="guild-id">Server (guild) id — optional, to list channels</label>
                    <input id="guild-id" placeholder="1234567890123456" value={guildId} onChange={(e) => setGuildId(e.target.value)} />
                  </div>
                  <TactileButton variant="soft" onClick={listChannels} disabled={!guildId || listingChannels}>
                    <Hash size={15} /> {listingChannels ? "Listing…" : "List channels"}
                  </TactileButton>
                </div>
                {channels.length > 0 && (
                  <div className="channel-list">
                    {channels.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`channel-chip ${channelId === c.id ? "is-selected" : ""}`}
                        onClick={() => checkChannel(c.id)}
                      >
                        #{c.name}
                      </button>
                    ))}
                  </div>
                )}
                <div className="field-inline">
                  <div className="field">
                    <label htmlFor="channel-id">Channel id</label>
                    <input id="channel-id" placeholder="1234567890123456" value={channelId} onChange={(e) => setChannelId(e.target.value)} />
                  </div>
                  <TactileButton variant="soft" onClick={() => checkChannel(channelId)} disabled={!channelId || checkingChannel}>
                    {checkingChannel ? <Loader2 size={15} className="spin" /> : <Check size={15} />} Check access
                  </TactileButton>
                </div>
                <p className="field-hint">Enable Developer Mode in Discord (Settings → Advanced) to right-click and copy ids.</p>
                <div className="field">
                  <label htmlFor="digest-channel">Digest channel id — optional, private #kith recommended</label>
                  <input
                    id="digest-channel"
                    placeholder="where Kith posts its daily 'nothing needs you today'"
                    value={digestChannelId}
                    onChange={(e) => setDigestChannelId(e.target.value)}
                  />
                </div>
                {channelCheck?.ok && (
                  <div className="step-result step-result--ok">
                    <CheckCircle2 size={16} /> Readable — {channelCheck.withContent}/{channelCheck.sampled} sampled messages had content.
                  </div>
                )}
                {channelError && <div className="step-result step-result--error"><AlertTriangle size={16} /> {channelError}</div>}
              </div>
            )}
          </Surface>

          {/* Step 3 */}
          <Surface className="wizard-step" accent="coral" aria-disabled={!step3Open}>
            <StepHead num={3} done={step4Open} title="Build the memory" desc="Reads your channel's recent history and turns it into per-member baselines — nothing sent to any Mind yet." />
            {step3Open && (
              <div className="wizard-step-body">
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="community-name">Community name</label>
                    <input id="community-name" placeholder="e.g. Late Night Devs" value={communityName} onChange={(e) => setCommunityName(e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="since-days">Days of history to pull (1–60)</label>
                    <input
                      id="since-days"
                      type="number"
                      min={1}
                      max={60}
                      value={sinceDays}
                      onChange={(e) => setSinceDays(Math.min(60, Math.max(1, Number(e.target.value) || 1)))}
                    />
                  </div>
                </div>
                <p className="field-hint">
                  Bounded on purpose so this finishes inside one request — 60 days is plenty for a baseline.
                </p>
                <div className="wizard-actions">
                  <TactileButton variant="dark" onClick={build} disabled={building}>
                    {building ? <Loader2 size={15} className="spin" /> : <Wand2 size={15} />} {building ? "Reading history…" : "Build registry"}
                  </TactileButton>
                </div>
                {buildError && <div className="step-result step-result--error"><AlertTriangle size={16} /> {buildError}</div>}
                {buildResult && (
                  <>
                    <div className="build-summary">
                      <div className="build-stat"><b>{buildResult.registry.memberCount}</b><span>members</span></div>
                      <div className="build-stat"><b>{buildResult.stats.messagesSeen}</b><span>messages read</span></div>
                      <div className="build-stat"><b>{buildResult.briefing.cases.length}</b><span>things worth noticing</span></div>
                    </div>
                    {buildResult.stats.capped && (
                      <div className="step-result step-result--warn">
                        <AlertTriangle size={16} /> Hit the page cap for this request — this is a partial window, not
                        the whole channel. Run the CLI locally for full history.
                      </div>
                    )}
                    <button className="code-toggle" onClick={() => setShowJson((v) => !v)}>
                      <Sparkles size={14} /> {showJson ? "Hide" : "Preview"} the registry JSON
                    </button>
                    {showJson && (
                      <>
                        <pre className="code-panel">{JSON.stringify(buildResult.registry, null, 2).slice(0, 4000)}</pre>
                        <div className="code-actions">
                          <button className="text-button" onClick={copyRegistry}><Copy size={14} /> Copy</button>
                          <button className="text-button" onClick={downloadRegistry}><Download size={14} /> Download</button>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </Surface>

          {/* Step 4 */}
          <Surface className="wizard-step" accent="lavender" aria-disabled={!step4Open}>
            <StepHead num={4} done={Boolean(pushResult)} title="Push to your Mind" desc="Sends the registry to your own Mind as a durable Artifact. This is the one step that spends real cognition." />
            {step4Open && (
              <div className="wizard-step-body">
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="mind-id">Your Mind id</label>
                    <input id="mind-id" placeholder="find with: minds list --pretty" value={mindId} onChange={(e) => setMindId(e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="builder-key">Minds Builder API key</label>
                    <input id="builder-key" type="password" autoComplete="off" placeholder="from the Builder console" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
                  </div>
                </div>
                <div className="gentle-pause">
                  <ShieldCheck size={19} />
                  <div>
                    <strong>This costs real cognition on your Mind.</strong>
                    <span>A few units, roughly proportional to registry size. Nothing is sent until you confirm. Your Mind is actually reading it, not just acknowledging receipt — real replies have taken anywhere from under a minute to well over an hour, so stay on this page while it checks.</span>
                  </div>
                </div>
                <div className="wizard-actions">
                  {!confirmPush ? (
                    <TactileButton
                      variant="primary"
                      onClick={() => setConfirmPush(true)}
                      disabled={!mindId || !apiKey || pushing || pushWaiting || Boolean(pushStart && pushError)}
                    >
                      <Send size={15} /> Push to my Mind
                    </TactileButton>
                  ) : (
                    <>
                      <span className="field-hint">Send it for real?</span>
                      <button className="text-button" onClick={() => setConfirmPush(false)} disabled={pushing || pushWaiting}>Not yet</button>
                      <TactileButton variant="dark" onClick={push} disabled={pushing || pushWaiting}>
                        {pushing ? <Loader2 size={15} className="spin" /> : <Send size={15} />} {pushing ? "Sending…" : "Yes, push it"}
                      </TactileButton>
                    </>
                  )}
                </div>
                {pushStart && pushError && (
                  <p className="field-hint">
                    A send is already in flight for this Mind — use "Check again" below instead of starting a new
                    push, so you don't end up with two conversations charged for the same registry.
                  </p>
                )}
                {pushWaiting && (
                  <div className="step-result step-result--warn">
                    <Loader2 size={16} className="spin" /> Sent — Kith is reading and storing it now. This page is
                    checking for you; real replies have taken anywhere from under a minute to well over an hour, so
                    don't reload — reloading loses track of this send.
                  </div>
                )}
                {pushResult && (
                  <div className="step-result step-result--ok">
                    <CheckCircle2 size={16} />
                    <span>
                      Stored{pushSpent !== null ? ` — ${pushSpent.toFixed(1)} cognition spent` : ""}. Your Mind
                      replied: <em>&ldquo;{pushResult.text.slice(0, 220)}{pushResult.text.length > 220 ? "…" : ""}&rdquo;</em>
                    </span>
                  </div>
                )}
                {pushResult && cycleRegistered !== null && (
                  <Surface className="wizard-step" accent="mint" style={{ marginTop: "20px" }}>
                    <div className="wizard-step-body" style={{ paddingTop: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                        <CheckCircle2 size={20} />
                        <h2 style={{ margin: 0, fontSize: "1.15rem" }}>You're set. Kith is watching.</h2>
                      </div>
                      {cycleRegistered ? (
                        <>
                          <p style={{ margin: "0 0 10px" }}>
                            From here, nothing runs on your computer. Every day Kith quietly reads what's new in{" "}
                            <b>{guildName ?? "your server"}</b>, updates its memory inside your Mind, and — only when
                            someone needs you — posts to{" "}
                            <b>{digestChannelId.trim() ? "your digest channel" : "the channel you chose"}{" "}
                            {digestChannelId.trim() ? "" : "(you didn't set one — add it above and reconnect to get digests)"}</b>.
                          </p>
                          <p style={{ margin: "0 0 10px" }}>Most days it will say nothing. That's the product working: silence means nobody is quietly slipping away.</p>
                          <p style={{ margin: 0 }}>
                            Want to talk to the memory itself? Open your Mind in the Minds app and ask{" "}
                            <em>&ldquo;who should I check in on, and why?&rdquo;</em> — it answers from everything it now
                            remembers, with receipts.
                          </p>
                        </>
                      ) : (
                        <p style={{ margin: 0 }}>
                          The push succeeded, but the automatic daily cycle couldn't be registered — likely a
                          temporary server error. Your memory is in your Mind either way; reconnect this server
                          (walk the wizard again) to switch on the automatic cycle.
                        </p>
                      )}
                    </div>
                  </Surface>
                )}
                {pushError && (
                  <div className="step-result step-result--error">
                    <AlertTriangle size={16} />
                    <span>
                      {pushError}{" "}
                      {!pushStart && (
                        <>Your registry is already built — use Copy or Download above and push it yourself with{" "}<code>npm run push</code>.</>
                      )}
                    </span>
                    {pushStart && (
                      <button className="text-button" onClick={() => { setPushError(null); waitForPush(pushStart); }} disabled={pushWaiting}>
                        Check again
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </Surface>
        </div>

        <div className="how-cta" style={{ marginTop: "60px" }}>
          <div>
            <h2>Prefer the terminal?</h2>
            <p>Everything above is the same pipeline as <code>npm run setup</code> — clone the repo and run it locally instead.</p>
          </div>
          <a href="https://github.com/danielamodu/Kith" target="_blank" rel="noreferrer" className="tactile-button tactile-button--primary">
            Open GitHub <ArrowRight size={15} />
          </a>
        </div>
      </div>
    </PageShell>
  );
}

function StepHead({ num, done, title, desc }: { num: number; done: boolean; title: string; desc: string }) {
  return (
    <div className={`wizard-step-head ${done ? "wizard-step-done" : ""}`}>
      <div>
        <span className="panel-kicker">step {num} of 4</span>
        <h2>{title}</h2>
        <p>{desc}</p>
      </div>
      <span className="wizard-step-num">{done ? <Check size={17} /> : num}</span>
    </div>
  );
}
