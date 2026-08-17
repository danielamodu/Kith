// Vanilla JS, no framework — the whole filmed surface is two views and a
// header strip, which is less code this way than with one.

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

async function getJson(url, opts) {
  const res = await fetch(url, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `${url} failed (${res.status})`);
  return body;
}

// ── view switching ──────────────────────────────────────────────────────────

function setView(name) {
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${name}`));
  $$("nav.views button").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === name),
  );
  if (name === "feed") loadFeedState();
}

$$("nav.views button").forEach((b) =>
  b.addEventListener("click", () => setView(b.dataset.view)),
);

// ── budget strip ─────────────────────────────────────────────────────────

async function refreshBudget() {
  try {
    const b = await getJson("/api/budget");
    $("#budget-strip").innerHTML =
      `<strong>${b.liveCallCount}</strong> live call${b.liveCallCount === 1 ? "" : "s"}` +
      (b.totalSpent > 0 ? ` · ~<strong>${b.totalSpent.toFixed(1)}</strong> cognition spent` : "");
  } catch {
    $("#budget-strip").textContent = "budget unavailable";
  }
}

// ── Compare view (Beat A) ──────────────────────────────────────────────────

const GENDERED = /\b(he|him|his|she|her|hers)\b/i;

function renderReceipts(evidence) {
  const list = $("#receipt-list");
  list.innerHTML = "";
  if (!evidence || evidence.length === 0) {
    $("#receipts").hidden = true;
    return;
  }
  $("#receipts").hidden = false;
  evidence.forEach((e, i) => {
    const row = document.createElement("div");
    row.className = "receipt-item";
    row.style.animationDelay = `${i * 80}ms`;
    const time = new Date(e.at).toISOString().slice(0, 16).replace("T", " ");
    row.innerHTML = `<span class="receipt-time">${time}</span>${e.fact}`;
    list.appendChild(row);
  });
}

async function loadBaseline() {
  try {
    const b = await getJson("/api/baseline");
    $("#baseline-answer").textContent = b.answer;
    $("#baseline-meta").textContent = b.note
      ? "Genuinely separate, memory-less system — not re-queried live for this take."
      : "";
  } catch (err) {
    $("#baseline-answer").textContent = `(failed to load: ${err.message})`;
  }
}

async function loadLiveAnswer() {
  try {
    const a = await getJson("/api/live-answer");
    if (!a.answer) {
      $("#live-answer").textContent = a.note || "No live answer captured yet.";
      $("#live-meta").textContent = "";
      $("#receipts").hidden = true;
      $("#pronoun-warning").classList.remove("show");
      return;
    }
    $("#live-answer").textContent = a.answer;
    $("#live-meta").textContent = `captured ${new Date(a.capturedAt).toISOString()}`;

    // Last-line defence: the structural pronoun fix is proven (see
    // docs/architecture.md), but this catches a stale cached answer from
    // before that fix, or any regression, rather than silently showing it.
    $("#pronoun-warning").classList.toggle("show", GENDERED.test(a.answer));

    // Match the cached answer to a briefing case for the receipts panel —
    // simple heuristic: use the first (highest-weight) case, since that's
    // what the live question is asking about.
    try {
      const briefing = await getJson("/api/briefing");
      const evidence = briefing.cases?.[0]?.evidence ?? [];
      renderReceipts(evidence);
    } catch {
      renderReceipts([]);
    }
  } catch (err) {
    $("#live-answer").textContent = `(failed to load: ${err.message})`;
  }
}

async function loadWatchlist() {
  const container = $("#watch-list");
  try {
    const w = await getJson("/api/watchlist");
    if (!w.watching || w.watching.length === 0) {
      container.innerHTML = `<div class="empty-state">All quiet — nobody needs you right now.</div>`;
      return;
    }
    container.innerHTML = "";
    w.watching.forEach((m) => {
      const row = document.createElement("div");
      row.className = "watch-row";
      row.innerHTML =
        `<span class="presence-dot"></span>` +
        `<span class="watch-name">${m.name}</span>` +
        `<span class="watch-signals">${m.signals.join(", ")}</span>`;
      container.appendChild(row);
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state">Couldn't load: ${err.message}</div>`;
  }
}

$("#refresh-btn").addEventListener("click", async () => {
  const ok = confirm(
    "This sends a real message to Kith and spends real cognition. Continue?",
  );
  if (!ok) return;

  const btn = $("#refresh-btn");
  btn.disabled = true;
  btn.textContent = "Asking Kith…";
  try {
    await getJson("/api/live-answer/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    await loadLiveAnswer();
    await refreshBudget();
  } catch (err) {
    alert(`Live query failed: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "↻ Ask Kith live";
  }
});

// ── Live Feed view (Beat B) ─────────────────────────────────────────────────

async function loadFeedState() {
  try {
    const s = await getJson("/api/session");
    $("#feed-alias").textContent = s.alias;
  } catch {
    $("#feed-alias").textContent = "(unavailable)";
  }
}

$("#mark-restart-btn").addEventListener("click", async () => {
  try {
    const s = await getJson("/api/session/mark-restart", { method: "POST" });
    $("#feed-alias").textContent = `${s.alias} — restart marked ${new Date(s.restartAt).toLocaleTimeString()}`;
  } catch (err) {
    alert(`Couldn't mark restart: ${err.message}`);
  }
});

$("#check-feed-btn").addEventListener("click", async () => {
  const btn = $("#check-feed-btn");
  btn.disabled = true;
  try {
    const feed = await getJson("/api/live-feed");
    renderFeed(feed);
    $("#last-checked").textContent = `Last checked ${new Date().toLocaleTimeString()} — nothing auto-refreshes.`;
  } catch (err) {
    $("#feed-list").innerHTML = `<div class="empty-state">Couldn't load: ${err.message}</div>`;
  } finally {
    btn.disabled = false;
  }
});

function renderFeed(feed) {
  const list = $("#feed-list");
  const restartAt = feed.restartAt ? new Date(feed.restartAt) : null;
  const messages = [...(feed.messages || [])].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
  );

  if (messages.length === 0) {
    list.innerHTML = `<div class="empty-state">${feed.note || "No messages in this thread yet."}</div>`;
    return;
  }

  // A Kith message counts as "unprompted" if it's after the marked restart
  // AND no human message falls between the restart and it — the exact proof
  // Beat B needs, computed from timestamps already in hand.
  let lastHumanAt = restartAt;
  list.innerHTML = "";
  for (const m of messages) {
    const isHuman = m.senderType === 1;
    const ts = new Date(m.createdAt);
    const unprompted =
      !isHuman && restartAt && ts > restartAt && (!lastHumanAt || lastHumanAt <= restartAt);
    if (isHuman && restartAt && ts > restartAt) lastHumanAt = ts;

    const row = document.createElement("div");
    row.className = `feed-msg ${isHuman ? "human" : "kith"} ${unprompted ? "unprompted" : ""}`;
    const text = m.messageText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    row.innerHTML =
      `<div class="feed-msg-meta"><span>${isHuman ? "Steward" : "Kith"}${unprompted ? '<span class="unprompted-badge">unprompted</span>' : ""}</span>` +
      `<span>${ts.toISOString().slice(0, 16).replace("T", " ")}</span></div>` +
      `<div>${text.slice(0, 400)}</div>`;
    list.appendChild(row);
  }
}

// ── boot ─────────────────────────────────────────────────────────────────

loadBaseline();
loadLiveAnswer();
loadWatchlist();
refreshBudget();
loadFeedState();
