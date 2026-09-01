import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, CheckCircle2, Inbox, UserPlus, Loader2, AlertCircle } from "lucide-react";
import { api, PageShell, SectionLabel, Surface, TactileButton } from "@/components/KithShell";

type Assignment = {
  memberId: string;
  memberName: string;
  status: "open" | "assigned" | "resolved";
  assigneeId?: string;
  assigneeName?: string;
  assignedAt?: string;
  resolvedAt?: string;
  headline?: string;
};

export default function TeamInbox({ guildId }: { guildId: string }) {
  return <TeamInboxInner guildId={guildId} />;
}

function TeamInboxInner({ guildId }: { guildId: string }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      const data = await api.get<{ assignments: Assignment[] }>(`/api/team/${guildId}`, { assignments: [] });
      setAssignments(data.assignments);
    } catch (err) {
      console.error("Failed to load team inbox:", err);
      // Keep empty array but log the error
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [guildId]);

  async function claim(a: Assignment) {
    setBusy(a.memberId);
    try {
      await api.postOrThrow(`/api/team/${guildId}/assign`, {
        memberId: a.memberId,
        memberName: a.memberName,
        assigneeId: "you",
        assigneeName: "You",
        headline: a.headline,
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function resolve(a: Assignment) {
    setBusy(a.memberId);
    try {
      await api.postOrThrow(`/api/team/${guildId}/resolve`, { memberId: a.memberId });
      await load();
    } finally {
      setBusy(null);
    }
  }

  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const data = await api.get<{ assignments: Assignment[] }>(`/api/team/${guildId}`, { assignments: [] });
      setAssignments(data.assignments);
    } catch (err) {
      console.error("Failed to load team inbox:", err);
      setError("Failed to load inbox. Check console for details.");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: 20 }}>
        <Loader2 size={16} className="spin" /> Loading inbox…
      </div>
    );
  }

  if (error) {
    return (
      <Surface accent="coral">
        <div className="wizard-step-body" style={{ textAlign: "center", padding: 40 }}>
          <AlertCircle size={28} style={{ opacity: 0.7, marginBottom: 12 }} />
          <h3>Couldn't load inbox</h3>
          <p style={{ color: "var(--text-muted)", marginBottom: 16 }}>{error}</p>
          <TactileButton variant="primary" onClick={load}>
            <Loader2 size={14} className="spin" /> Retry
          </TactileButton>
        </div>
      </Surface>
    );
  }

  const open = assignments.filter((a) => a.status === "open");
  const assigned = assignments.filter((a) => a.status === "assigned");
  const resolved = assignments.filter((a) => a.status === "resolved");

  if (assignments.length === 0) {
    return (
      <Surface accent="mint">
        <div className="wizard-step-body" style={{ textAlign: "center", padding: 40 }}>
          <Inbox size={28} style={{ opacity: 0.5, marginBottom: 12 }} />
          <h3>Nothing needs your team today.</h3>
          <p style={{ color: "var(--text-muted)" }}>When Kith flags someone, they land here.</p>
        </div>
      </Surface>
    );
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {open.length > 0 && (
        <Surface accent="coral">
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Open — {open.length}</div>
          {open.map((a) => (
            <div key={a.memberId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
              <div>
                <b>{a.memberName}</b>
                {a.headline && <div style={{ fontSize: 13, opacity: 0.7 }}>{a.headline.slice(0, 80)}</div>}
              </div>
              <TactileButton variant="soft" disabled={busy === a.memberId} onClick={() => claim(a)}>
                <UserPlus size={13} /> {busy === a.memberId ? "…" : "Claim"}
              </TactileButton>
            </div>
          ))}
        </Surface>
      )}

      {assigned.length > 0 && (
        <Surface accent="butter">
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Assigned — {assigned.length}</div>
          {assigned.map((a) => (
            <div key={a.memberId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
              <div>
                <b>{a.memberName}</b> → <span style={{ opacity: 0.7 }}>{a.assigneeName}</span>
                {a.headline && <div style={{ fontSize: 13, opacity: 0.7 }}>{a.headline.slice(0, 80)}</div>}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <TactileButton variant="soft" disabled={busy === a.memberId} onClick={() => claim(a)}>Reassign</TactileButton>
                <TactileButton variant="dark" disabled={busy === a.memberId} onClick={() => resolve(a)}>
                  <CheckCircle2 size={13} /> {busy === a.memberId ? "…" : "Resolve"}
                </TactileButton>
              </div>
            </div>
          ))}
        </Surface>
      )}

      {resolved.length > 0 && (
        <Surface accent="mint">
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Resolved — fades after 7 days</div>
          {resolved.map((a) => (
            <div key={a.memberId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", opacity: 0.7 }}>
              <span>{a.memberName} → {a.assigneeName ?? "—"}</span>
              <span style={{ fontSize: 12 }}>{a.resolvedAt ? new Date(a.resolvedAt).toLocaleDateString() : ""}</span>
            </div>
          ))}
        </Surface>
      )}
    </div>
  );
}

export function TeamInboxPage({ params }: { params: { guildId: string } }) {
  return (
    <PageShell>
      <div className="container how-page" style={{ padding: "74px 0 60px" }}>
        <SectionLabel tone="butter">Team inbox</SectionLabel>
        <h1>The queue your mods clear <em>together.</em></h1>
        <p style={{ marginBottom: 28, color: "var(--text-muted)" }}>
          Every digest item lands here. Claim it, assign someone else, or mark it resolved. The digest's buttons
          write to the same queue — this is the other side of the same button.
        </p>
        <TeamInbox guildId={params.guildId} />
        <div style={{ marginTop: 24 }}>
          <Link href="/setup" className="text-link">Back to setup <ArrowRight size={14} /></Link>
        </div>
      </div>
    </PageShell>
  );
}
