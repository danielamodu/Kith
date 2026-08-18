/* Kith Soft Spatial Studio: playful onboarding modal for first-time visitors. */
import { useEffect, useState } from "react";
import { Sparkles, WandSparkles } from "lucide-react";
import { TactileButton, assetUrls } from "@/components/KithShell";

export function OnboardingModal() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const seen = localStorage.getItem("kith_onboarding_seen");
    if (!seen) {
      const timer = setTimeout(() => setOpen(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  function dismiss() {
    localStorage.setItem("kith_onboarding_seen", "true");
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <img className="onboarding-lockup" src={assetUrls.lockup} alt="kith" />
        <div className="confirm-icon"><WandSparkles size={23} /></div>
        <span className="panel-kicker">welcome to kith</span>
        <h2 id="welcome-title">A mind that remembers the quiet room.</h2>
        <p>You’re about to explore a live community Mind built for Creative Minds Jam #1. It notices who is drifting away without ever feeling like surveillance.</p>
        <div style={{ display: "grid", gap: "10px", margin: "16px 0 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12px", color: "#6e6972" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--mint)" }} />
            <span><b>Beat A:</b> Watchlist & memory comparison</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12px", color: "#6e6972" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--butter)" }} />
            <span><b>Beat B:</b> Autonomous room memory</span>
          </div>
        </div>
        <div className="confirm-actions">
          <button className="text-button" onClick={dismiss}>Skip intro</button>
          <TactileButton variant="dark" onClick={dismiss}>Let's explore <Sparkles size={14} /></TactileButton>
        </div>
      </div>
    </div>
  );
}
