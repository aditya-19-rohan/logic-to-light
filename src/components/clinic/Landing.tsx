import { useEffect, useState } from "react";
import { Activity, AlertTriangle, ArrowRight, FileSpreadsheet, HeartPulse, ShieldCheck, Sparkles, WifiOff } from "lucide-react";
import "./landing.css";

type Props = {
  patients: number;
  visits: number;
  flagged: number;
  status: { label: string; error: boolean };
};

export function LandingNav({ status }: { status: Props["status"] }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header className={`vl-nav no-print ${scrolled ? "scrolled" : ""}`}>
      <a className="vl-brand" href="#top" aria-label="Vitals Ledger home">
        <span className="vl-brand-mark"><HeartPulse size={18} strokeWidth={2.5} /></span>
        <span>vitals<em>ledger</em></span>
      </a>
      <nav className="vl-links">
        <a href="#workstation">Workstation</a>
        <span className="vl-status" title={status.label}><i className={`vl-dot ${status.error ? "err" : ""}`} />{status.label}</span>
      </nav>
    </header>
  );
}

export function LandingHero({ patients, visits, flagged }: Omit<Props, "status">) {
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add("visible")), { threshold: 0.12 });
    document.querySelectorAll(".vl-reveal").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return (
    <>
      <section id="top" className="vl-hero">
        <div className="vl-reveal visible">
          <div className="vl-eyebrow"><i /> Clinical records workstation</div>
          <h1>Every heartbeat,<br /><span>on the record.</span></h1>
          <p className="lead">Register patients, log vitals per visit, and let NEWS2 scoring and blood-pressure staging flag who needs attention — all in one calm ledger you can export to Excel.</p>
          <div className="vl-actions">
            <a className="vl-btn" href="#workstation">Open the workstation <ArrowRight size={16} /></a>
            <a className="vl-text-link" href="#workstation"><Sparkles size={15} /> See today's triage</a>
          </div>
          <div className="vl-proof">
            <div><b>{patients}</b><small>Patients</small></div>
            <div><b>{visits}</b><small>Visits logged</small></div>
            <div><b>{flagged}</b><small>Need follow-up</small></div>
          </div>
        </div>

        <div className="vl-art vl-reveal visible" aria-label="Illustration of a floating patient vitals card">
          <div className="vl-orbit one" /><div className="vl-orbit two" /><div className="vl-glow" />
          <div className="vl-chip c1"><span className="ic"><Activity size={15} /></span><span><b>CDS engine</b><small>NEWS2 · AHA · BMI</small></span></div>
          <div className="vl-card">
            <div className="vl-card-top"><span>PATIENT #0004 · LATEST VISIT</span><span className="vl-tag warn">NEWS2 5 · MEDIUM</span></div>
            <h3>Rahul Verma</h3>
            <p className="sub">58y · Male · Type 2 diabetes</p>
            <div className="vl-vitals">
              <div><small>Temp</small><b>38.4°</b></div>
              <div><small>HR</small><b>104</b></div>
              <div><small>SpO₂</small><b>95%</b></div>
              <div><small>BP</small><b>148/94</b></div>
              <div><small>RR</small><b>22</b></div>
              <div><small>BMI</small><b>27.1</b></div>
            </div>
            <div className="vl-bar"><span style={{ width: "62%" }} /></div>
            <p className="sub" style={{ marginTop: 10 }}>Follow-up due in 3 days · Stage 2 hypertension</p>
          </div>
          <div className="vl-chip c2"><span className="ic"><AlertTriangle size={15} /></span><span><b>Triage flag</b><small>Fever · Tachycardia</small></span></div>
          <div className="vl-chip c3"><span className="ic"><FileSpreadsheet size={15} /></span><span><b>Excel sync</b><small>Patients + Visits sheets</small></span></div>
        </div>
      </section>
      <div className="vl-strip no-print">
        <span><ShieldCheck size={14} /> Validated vital-sign ranges</span>
        <span><Activity size={14} /> NEWS2 early-warning scoring</span>
        <span><FileSpreadsheet size={14} /> Two-sheet Excel import/export</span>
        <span><WifiOff size={14} /> Works fully in the browser</span>
      </div>
    </>
  );
}
