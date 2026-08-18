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
  // step 1 — discord token
  const [token, setToken] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  // step 2 — channel
  const [guildId, setGuildId] = useState("");
  const [channelId, setChannelId] = useState("");
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
  // Kept so a failed *poll* (send already went through) can be resumed
  // with "Check again" instead of the user hitting "push" a second time
  // and creating an entirely separate conversation on their Mind.
  const [pushStart, setPushStart] = useState<PushStart | null>(null);
  const mountedRef = useMountedRef();

  const step2Open = Boolean(botUsername);
  const step3Open = Boolean(channelCheck?.ok);
  const step4Open = Boolean(buildResult);

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
            sentMessageText: start.sentMessageText,
            afterFingerprint: start.afterFingerprint,
            sentAfter: start.sentAt,
            before: start.before,
          }),
        { isMounted: () => mountedRef.current },
      );
      setPushResult({ text: status.text ?? "", createdAt: status.createdAt ?? "" });
      setPushSpent(status.spent ?? null);
      toast("Stored. Your Mind now holds this as a durable Artifact.");
      setPushStart(null);
    } catch (err) {
      if (err instanceof PollAbortedError) return; // navigated away — nothing to show
      if (err instanceof PollTimeoutError) {
        setPushError(
          "No reply yet after 2 minutes of checking. The send itself succeeded — this is slow, not failed. " +
            "Hit \"Check again\" below, check `minds history` on your Mind, or copy the registry JSON above and push it with `npm run push`.",
        );
      } else {
        setPushError(
          err instanceof Error
            ? err.message
            : "Checking the reply failed. Hit \"Check again\" — the send itself likely still succeeded.",
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
        confirm: true,
      });
      toast("Sent. This can take a minute or two — Kith is actually reading it.");
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
            <h1>Connect your <em>Discord.</em> Build the memory.</h1>
            <p>
              Four steps, no terminal required: verify your bot, point it at one channel, build the registry, and
              push it into your own Mind. Nothing here touches our Mind or our data — everything runs against your
              own credentials, for this one session only.
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
            Your Discord bot token and Minds Builder API key are sent to our server for the single request that
            needs them, used once, and never written to a database, a log, or a file. Close this tab and nothing
            of yours remains on our side. If you'd rather not send them to us at all, the identical pipeline runs
            entirely on your own machine via <code>npm run setup</code> — see{" "}
            <a href="https://github.com/danielamodu/Kith/blob/main/docs/self-hosting.md" target="_blank" rel="noreferrer">
              docs/self-hosting.md
            </a>.
          </p>
        </div>

        <div className="wizard-steps">
          {/* Step 1 */}
          <Surface className="wizard-step" accent="butter">
            <StepHead num={1} done={step2Open} title="Connect your Discord bot" desc="Paste the bot token from the Discord Developer Portal. Used once, to confirm it works." />
            <div className="wizard-step-body">
              <div className="field-inline">
                <div className="field">
                  <label htmlFor="discord-token">Bot token</label>
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
              <p className="field-hint">
                No bot yet? Discord Developer Portal → New Application → Bot → Reset Token, then enable{" "}
                <b>Message Content Intent</b> on the Bot page — without it every message arrives empty.
              </p>
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
                  Bounded on purpose so this finishes inside one request. For a deeper, full-history backfill with no
                  time limit, run <code>npm run setup</code> locally instead.
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
                    <span>A few units, roughly proportional to registry size — the same cost as running <code>npm run push</code> yourself. Nothing is sent until you confirm, and the reply can take a minute or two — your Mind is actually reading it, not just acknowledging receipt.</span>
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
                    <Loader2 size={16} className="spin" /> Sent — Kith is reading and storing it now. This has taken
                    up to two minutes on a real Mind; no need to reload, this page is checking for you.
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
