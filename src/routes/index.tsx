import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertTriangle, Database, Download, FileSpreadsheet, HeartPulse, LayoutDashboard,
  Phone, Printer, Search, Trash2, Upload, UserPlus, Users,
} from "lucide-react";
import hero from "@/assets/hero-pulse.jpg";
import { LABELS, RANGES, needsFollowUp, validateVisit, calculateAverageStats } from "@/lib/patients";
import {
  bmi, bmiClass, bpStage, downloadWorkbook, followUpReasons, fromWorkbook, latestVisit, news2,
  SEED, visitsOf, type Clinic, type ClinicVisit, type Patient, type Sex,
} from "@/lib/clinic";
import { OverviewCharts, TrendChart } from "@/components/clinic/Charts";
import { api, apiEnabled, diffClinic, runOps } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vitals Ledger — Clinical Records Workstation" },
      { name: "description", content: "Patient records, vital-sign trends, NEWS2 risk scoring, follow-up triage and Excel import/export in one clinical dashboard." },
      { property: "og:title", content: "Vitals Ledger — Clinical Records Workstation" },
      { property: "og:description", content: "Patient records, vital trends, NEWS2 risk scoring and Excel data hub." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: App,
});

const KEY = "vitals-ledger-clinic-v2";
type View = "overview" | "patients" | "intake" | "triage" | "data";
type SyncMode = "local" | "connecting" | "online" | "error";

/** Local storage always; when VITE_API_URL is set, loads from and syncs every change to the Express/MongoDB API. */
function useClinic() {
  const [clinic, setState] = useState<Clinic>(SEED);
  const [mode, setMode] = useState<SyncMode>(apiEnabled ? "connecting" : "local");
  const [syncError, setSyncError] = useState<string | null>(null);
  const loaded = useRef(false);
  const current = useRef(clinic);
  current.current = clinic;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setState(JSON.parse(raw));
    } catch { /* ignore */ }
    loaded.current = true;
    if (apiEnabled) {
      api.getClinic()
        .then((c) => { setState(c); setMode("online"); })
        .catch((e: Error) => { setMode("error"); setSyncError(e.message); });
    }
  }, []);
  useEffect(() => {
    if (loaded.current) localStorage.setItem(KEY, JSON.stringify(clinic));
  }, [clinic]);

  const setClinic = (next: Clinic) => {
    const prev = current.current;
    setState(next);
    if (apiEnabled && mode === "online") {
      runOps(diffClinic(prev, next))
        .then(() => setSyncError(null))
        .catch((e: Error) => { setSyncError(e.message); toast.error(`Not saved to server: ${e.message}`); });
    }
  };
  return { clinic, setClinic, mode, syncError };
}

function App() {
  const { clinic, setClinic, mode, syncError } = useClinic();
  const [view, setView] = useState<View>("overview");
  const [selected, setSelected] = useState<number | null>(null);

  const flagged = clinic.patients.filter((p) => visitsOf(clinic, p.id).some(needsFollowUp));
  const high = clinic.patients.filter((p) => { const v = latestVisit(clinic, p.id); return v && news2(v).risk === "High"; });

  const nav: { id: View; label: string; icon: typeof Users; badge?: number }[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "patients", label: "Patient directory", icon: Users },
    { id: "intake", label: "New intake", icon: UserPlus },
    { id: "triage", label: "Follow-up triage", icon: AlertTriangle, badge: flagged.length },
    { id: "data", label: "Excel data hub", icon: FileSpreadsheet },
  ];
  const open = (id: number) => { setSelected(id); setView("patients"); };

  return (
    <div className="grain min-h-screen lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="no-print border-b border-sidebar-border bg-sidebar lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2 px-5 py-5">
          <HeartPulse className="h-5 w-5 text-primary" />
          <div>
            <p className="font-display text-xl leading-none">Vitals Ledger</p>
            <p className="eyebrow mt-1">EHR · v2.0</p>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col">
          {nav.map((n) => (
            <button key={n.id} onClick={() => setView(n.id)} className={`nav-item ${view === n.id ? "nav-active" : ""}`}>
              <n.icon className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap">{n.label}</span>
              {!!n.badge && <span className="ml-auto rounded-sm bg-destructive/20 px-1.5 font-mono text-[10px] text-destructive">{n.badge}</span>}
            </button>
          ))}
        </nav>
        <div className="hidden px-5 pt-6 lg:block">
          <p className="eyebrow">Storage</p>
          <p className="mt-2 flex items-center gap-2 font-mono text-xs text-muted-foreground" title={syncError ?? undefined}>
            <span className={`h-1.5 w-1.5 rounded-full ${mode === "error" ? "bg-destructive" : "bg-primary shadow-[0_0_8px_var(--primary)]"}`} />
            {mode === "local" ? "Local · browser" : mode === "connecting" ? "Connecting to API…" : mode === "online" ? "MongoDB · live" : "API offline · local copy"}
          </p>
        </div>
      </aside>

      <main className="min-w-0 px-4 py-6 md:px-8">
        <div className="no-print mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-4">
          <Ticker label="Patients" value={clinic.patients.length} />
          <Ticker label="Visits logged" value={clinic.visits.length} />
          <Ticker label="Need follow-up" value={flagged.length} tone="alert" />
          <Ticker label="NEWS2 high risk" value={high.length} tone="danger" />
        </div>

        {view === "overview" && <Overview clinic={clinic} onOpen={open} />}
        {view === "patients" && <Directory clinic={clinic} setClinic={setClinic} selected={selected} setSelected={setSelected} />}
        {view === "intake" && <Intake clinic={clinic} setClinic={setClinic} onDone={open} />}
        {view === "triage" && <Triage clinic={clinic} onOpen={open} />}
        {view === "data" && <DataHub clinic={clinic} setClinic={setClinic} />}
      </main>
    </div>
  );
}

function Ticker({ label, value, tone }: { label: string; value: number; tone?: "alert" | "danger" }) {
  const c = tone === "alert" ? "text-alert" : tone === "danger" ? "text-destructive" : "text-foreground";
  return (
    <div className="bg-card px-4 py-3">
      <p className="eyebrow">{label}</p>
      <p className={`mt-1 font-mono text-2xl tabular-nums ${c}`}>{String(value).padStart(2, "0")}</p>
    </div>
  );
}

function SectionTitle({ kicker, title, children }: { kicker: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="eyebrow">{kicker}</p>
        <h1 className="font-display text-4xl leading-tight md:text-5xl">{title}</h1>
      </div>
      {children}
    </div>
  );
}

function RiskChip({ v }: { v: ClinicVisit }) {
  const n = news2(v);
  const c = n.risk === "High" ? "border-destructive/50 text-destructive" : n.risk === "Medium" ? "border-alert/50 text-alert" : "border-primary/40 text-primary";
  return <span className={`chip ${c}`}>NEWS2 {n.score} · {n.risk}</span>;
}

/* ---------------- Overview ---------------- */
function Overview({ clinic, onOpen }: { clinic: Clinic; onOpen: (id: number) => void }) {
  const avg = calculateAverageStats(
    Object.fromEntries(clinic.patients.map((p) => [p.id, visitsOf(clinic, p.id)])),
  );
  const recent = [...clinic.visits].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const name = (id: number) => clinic.patients.find((p) => p.id === id)?.name ?? `#${id}`;
  return (
    <>
      <section className="relative mb-6 overflow-hidden rounded-lg border border-border">
        <img src={hero} alt="Engraved heart with ECG trace" width={1600} height={640} className="absolute inset-0 h-full w-full object-cover object-right opacity-80" />
        <div className="relative bg-gradient-to-r from-background via-background/85 to-transparent px-6 py-10 md:px-10 md:py-14">
          <p className="eyebrow text-primary">Clinical overview</p>
          <h1 className="mt-2 max-w-xl font-display text-5xl leading-[1.05] md:text-6xl">
            Every heartbeat, <em className="text-copper">on the record.</em>
          </h1>
          <p className="mt-4 max-w-md text-sm text-muted-foreground">
            Track patient vitals, spot deterioration early with NEWS2 scoring, and keep the whole ledger in a spreadsheet you own.
          </p>
        </div>
      </section>

      {avg && (
        <div className="mb-6 grid grid-cols-3 gap-3 md:grid-cols-6">
          {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((k) => (
            <div key={k} className="panel px-4 py-3">
              <p className="eyebrow truncate">{LABELS[k].name}</p>
              <p className="mt-1 font-mono text-xl tabular-nums">{avg[k].toFixed(k === "temp" ? 1 : 0)}<span className="ml-1 text-xs text-muted-foreground">{LABELS[k].unit}</span></p>
            </div>
          ))}
        </div>
      )}

      <OverviewCharts clinic={clinic} />

      <div className="panel mt-4 p-5">
        <p className="eyebrow">Latest activity</p>
        <h3 className="mb-3 font-display text-2xl">Recent visits</h3>
        <ul className="divide-y divide-border">
          {recent.map((v, i) => (
            <li key={i}>
              <button onClick={() => onOpen(v.patientId)} className="flex w-full flex-wrap items-center gap-3 py-2.5 text-left text-sm hover:text-primary">
                <span className="w-24 font-mono text-xs text-muted-foreground">{v.date}</span>
                <span className="min-w-36 font-medium">{name(v.patientId)}</span>
                <span className="flex-1 truncate text-muted-foreground">{v.complaint ?? "—"}</span>
                <RiskChip v={v} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/* ---------------- Directory + Dossier ---------------- */
function Directory({ clinic, setClinic, selected, setSelected }: {
  clinic: Clinic; setClinic: (c: Clinic) => void; selected: number | null; setSelected: (id: number | null) => void;
}) {
  const [q, setQ] = useState("");
  const list = clinic.patients.filter((p) =>
    [p.name, p.contact, String(p.id)].some((s) => s.toLowerCase().includes(q.toLowerCase())),
  );
  const current = clinic.patients.find((p) => p.id === selected) ?? list[0];
  return (
    <>
      <SectionTitle kicker="Records" title="Patient directory" />
      <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
        <div className="panel no-print p-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input className="field pl-9" placeholder="Name, phone or ID" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <ul className="mt-3 max-h-[70vh] space-y-1 overflow-y-auto">
            {list.map((p) => {
              const v = latestVisit(clinic, p.id);
              const flag = visitsOf(clinic, p.id).some(needsFollowUp);
              return (
                <li key={p.id}>
                  <button onClick={() => setSelected(p.id)}
                    className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition ${current?.id === p.id ? "bg-accent" : "hover:bg-muted"}`}>
                    <Avatar name={p.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                      <span className="block font-mono text-[11px] text-muted-foreground">#{String(p.id).padStart(4, "0")} · {p.age}y · {p.sex[0]}</span>
                    </span>
                    {flag && <span className="h-2 w-2 rounded-full bg-alert" title="Needs follow-up" />}
                    {v && news2(v).risk === "High" && <span className="h-2 w-2 rounded-full bg-destructive" title="High risk" />}
                  </button>
                </li>
              );
            })}
            {!list.length && <li className="p-3 text-sm text-muted-foreground">No match.</li>}
          </ul>
        </div>
        {current ? <Dossier clinic={clinic} setClinic={setClinic} p={current} /> : <div className="panel p-8 text-muted-foreground">No patients yet.</div>}
      </div>
    </>
  );
}

function Avatar({ name, big }: { name: string; big?: boolean }) {
  const initials = name.split(" ").map((s) => s[0]).slice(0, 2).join("");
  return (
    <span className={`grid shrink-0 place-items-center rounded-full border border-copper/40 bg-copper/10 font-display text-copper ${big ? "h-16 w-16 text-2xl" : "h-9 w-9 text-sm"}`}>{initials}</span>
  );
}

function Dossier({ clinic, setClinic, p }: { clinic: Clinic; setClinic: (c: Clinic) => void; p: Patient }) {
  const visits = visitsOf(clinic, p.id);
  const last = visits.at(-1);
  const b = bmi(p);
  const [adding, setAdding] = useState(false);

  const removePatient = () => {
    if (!confirm(`Delete ${p.name} and all their visits?`)) return;
    setClinic({ patients: clinic.patients.filter((x) => x.id !== p.id), visits: clinic.visits.filter((v) => v.patientId !== p.id) });
  };
  const clearVisits = () => {
    if (!confirm(`Delete all visits of ${p.name}?`)) return;
    setClinic({ ...clinic, visits: clinic.visits.filter((v) => v.patientId !== p.id) });
  };

  return (
    <div className="space-y-4">
      <div className="panel p-5">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar name={p.name} big />
          <div className="flex-1">
            <p className="eyebrow">Patient #{String(p.id).padStart(4, "0")} · since {p.registeredAt || "—"}</p>
            <h2 className="font-display text-4xl leading-tight">{p.name}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {last && <RiskChip v={last} />}
              {last && <span className="chip border-border text-muted-foreground">BP {bpStage(last.sbp, last.dbp)}</span>}
              {b > 0 && <span className="chip border-border text-muted-foreground">BMI {b.toFixed(1)} · {bmiClass(b)}</span>}
            </div>
          </div>
          <div className="no-print flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => setAdding((a) => !a)}><Activity className="h-4 w-4" /> Record visit</button>
            <button className="btn-outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print summary</button>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-4 text-sm md:grid-cols-4">
          <Info k="Age / Sex" v={`${p.age} · ${p.sex}`} />
          <Info k="Height / Weight" v={`${p.heightCm} cm · ${p.weightKg} kg`} />
          <Info k="Blood group" v={p.bloodGroup || "—"} />
          <Info k="Contact" v={<a className="text-primary hover:underline" href={`tel:${p.contact}`}>{p.contact}</a>} />
          <Info k="Allergies" v={p.allergies || "—"} warn={!!p.allergies && p.allergies !== "None"} />
          <Info k="Chronic conditions" v={p.conditions || "—"} />
          <Info k="Emergency contact" v={p.emergencyContact || "—"} wide />
        </dl>
      </div>

      {adding && <VisitForm patientId={p.id} onSave={(v) => { setClinic({ ...clinic, visits: [...clinic.visits, v] }); setAdding(false); }} />}

      <div className="panel p-5">
        <p className="eyebrow">Trajectory</p>
        <h3 className="mb-4 font-display text-2xl">Vital-sign trends</h3>
        <TrendChart visits={visits} />
      </div>

      <div className="panel overflow-x-auto">
        <div className="flex items-center justify-between p-5 pb-3">
          <h3 className="font-display text-2xl">Visit history</h3>
          <div className="no-print flex gap-2">
            <button className="btn-outline" onClick={clearVisits}><Trash2 className="h-4 w-4" /> Clear visits</button>
            <button className="btn-outline hover:!border-destructive hover:!text-destructive" onClick={removePatient}>Delete patient</button>
          </div>
        </div>
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-y border-border text-left">
            <tr className="eyebrow">
              <th className="px-5 py-2 font-normal">Date</th><th className="font-normal">Temp</th><th className="font-normal">HR</th>
              <th className="font-normal">RR</th><th className="font-normal">BP</th><th className="font-normal">SpO₂</th>
              <th className="font-normal">Score</th><th className="pr-5 font-normal">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border font-mono tabular-nums">
            {[...visits].reverse().map((v, i) => (
              <tr key={i} className="align-top">
                <td className="px-5 py-3 text-muted-foreground">{v.date}</td>
                <td className={v.temp > 38 ? "py-3 text-alert" : "py-3"}>{v.temp}</td>
                <td className={v.hr > 100 ? "py-3 text-alert" : "py-3"}>{v.hr}</td>
                <td className={v.rr > 20 ? "py-3 text-alert" : "py-3"}>{v.rr}</td>
                <td className={v.sbp > 140 || v.dbp > 90 ? "py-3 text-alert" : "py-3"}>{v.sbp}/{v.dbp}</td>
                <td className="py-3">{v.spo2}</td>
                <td className="py-3"><RiskChip v={v} /></td>
                <td className="max-w-xs py-3 pr-5 font-sans text-xs text-muted-foreground">
                  {v.complaint && <span className="block text-foreground">{v.complaint}</span>}
                  {v.note}
                  {v.nextFollowUp && <span className="mt-1 block font-mono text-copper">↻ {v.nextFollowUp}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visits.length && <p className="p-5 text-sm text-muted-foreground">No visits recorded.</p>}
      </div>
    </div>
  );
}

function Info({ k, v, warn, wide }: { k: string; v: React.ReactNode; warn?: boolean; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <dt className="eyebrow">{k}</dt>
      <dd className={`mt-0.5 ${warn ? "text-destructive" : ""}`}>{v}</dd>
    </div>
  );
}

/* ---------------- Visit form ---------------- */
const today = () => new Date().toISOString().slice(0, 10);

function VisitForm({ patientId, onSave }: { patientId: number; onSave: (v: ClinicVisit) => void }) {
  const [f, setF] = useState({ date: today(), temp: "37", hr: "72", rr: "16", sbp: "120", dbp: "80", spo2: "98", complaint: "", note: "", nextFollowUp: "" });
  const [err, setErr] = useState<string | null>(null);
  const v: ClinicVisit = {
    patientId, date: f.date, temp: Number(f.temp), hr: Number(f.hr), rr: Number(f.rr),
    sbp: Number(f.sbp), dbp: Number(f.dbp), spo2: Number(f.spo2),
    complaint: f.complaint || undefined, note: f.note || undefined, nextFollowUp: f.nextFollowUp || undefined,
  };
  const live = validateVisit(v) ? null : news2(v);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const e2 = validateVisit(v);
    if (e2) return setErr(e2);
    onSave(v);
  };
  return (
    <form onSubmit={submit} className="panel space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-2xl">New visit</h3>
        {live && <span className="font-mono text-xs text-muted-foreground">Live: NEWS2 {live.score} ({live.risk}) · BP {bpStage(v.sbp, v.dbp)} {followUpReasons(v).length ? `· ⚑ ${followUpReasons(v).join(", ")}` : ""}</span>}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div><label className="label">Visit date</label><input type="date" className="field" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((k) => (
          <div key={k}>
            <label className="label">{LABELS[k].name} ({RANGES[k][0]}–{RANGES[k][1]})</label>
            <input type="number" step={k === "temp" ? "0.1" : "1"} className="field font-mono" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </div>
        ))}
        <div><label className="label">Next follow-up</label><input type="date" className="field" value={f.nextFollowUp} onChange={(e) => setF({ ...f, nextFollowUp: e.target.value })} /></div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div><label className="label">Chief complaint</label><input className="field" value={f.complaint} onChange={(e) => setF({ ...f, complaint: e.target.value })} /></div>
        <div><label className="label">Doctor note</label><input className="field" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <button className="btn-primary">Save visit</button>
    </form>
  );
}

/* ---------------- Intake ---------------- */
function Intake({ clinic, setClinic, onDone }: { clinic: Clinic; setClinic: (c: Clinic) => void; onDone: (id: number) => void }) {
  const nextId = useMemo(() => Math.max(0, ...clinic.patients.map((p) => p.id)) + 1, [clinic.patients]);
  const [f, setF] = useState({ name: "", age: "", sex: "Female" as Sex, heightCm: "", weightKg: "", contact: "", bloodGroup: "", allergies: "", conditions: "", emergencyContact: "" });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const age = Number(f.age), h = Number(f.heightCm), w = Number(f.weightKg);
    if (!f.name.trim()) return setErr("Name is required.");
    if (!Number.isInteger(age) || age < 0 || age > 130) return setErr("Age must be a whole number between 0 and 130.");
    if (!(h >= 40 && h <= 250)) return setErr("Height must be between 40 and 250 cm.");
    if (!(w >= 2 && w <= 350)) return setErr("Weight must be between 2 and 350 kg.");
    if (!/^[+\d][\d\s-]{6,}$/.test(f.contact.trim())) return setErr("Enter a valid contact number.");
    const p: Patient = { id: nextId, name: f.name.trim(), age, sex: f.sex, heightCm: h, weightKg: w, contact: f.contact.trim(), bloodGroup: f.bloodGroup, allergies: f.allergies, conditions: f.conditions, emergencyContact: f.emergencyContact, registeredAt: today() };
    setClinic({ ...clinic, patients: [...clinic.patients, p] });
    onDone(p.id);
  };
  const b = bmi({ heightCm: Number(f.heightCm), weightKg: Number(f.weightKg) });
  return (
    <>
      <SectionTitle kicker={`Assigning ID #${String(nextId).padStart(4, "0")}`} title="New patient intake" />
      <form onSubmit={submit} className="panel max-w-4xl space-y-5 p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2"><label className="label">Full name</label><input className="field" value={f.name} onChange={set("name")} /></div>
          <div><label className="label">Contact number</label><input className="field font-mono" placeholder="+91 98xxx xxxxx" value={f.contact} onChange={set("contact")} /></div>
          <div><label className="label">Age</label><input type="number" className="field font-mono" value={f.age} onChange={set("age")} /></div>
          <div><label className="label">Sex</label><select className="field" value={f.sex} onChange={set("sex")}><option>Female</option><option>Male</option><option>Other</option></select></div>
          <div><label className="label">Blood group</label><select className="field" value={f.bloodGroup} onChange={set("bloodGroup")}><option value="">Unknown</option>{["A+","A-","B+","B-","AB+","AB-","O+","O-"].map((g) => <option key={g}>{g}</option>)}</select></div>
          <div><label className="label">Height (cm)</label><input type="number" className="field font-mono" value={f.heightCm} onChange={set("heightCm")} /></div>
          <div><label className="label">Weight (kg)</label><input type="number" className="field font-mono" value={f.weightKg} onChange={set("weightKg")} /></div>
          <div><label className="label">BMI (auto)</label><div className="field font-mono text-muted-foreground">{b > 0 && Number.isFinite(b) ? `${b.toFixed(1)} · ${bmiClass(b)}` : "—"}</div></div>
          <div><label className="label">Allergies</label><input className="field" value={f.allergies} onChange={set("allergies")} /></div>
          <div><label className="label">Chronic conditions</label><input className="field" value={f.conditions} onChange={set("conditions")} /></div>
          <div><label className="label">Emergency contact</label><input className="field" placeholder="Name · phone" value={f.emergencyContact} onChange={set("emergencyContact")} /></div>
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <button className="btn-primary"><UserPlus className="h-4 w-4" /> Register patient</button>
        <p className="text-xs text-muted-foreground">After registering, you'll land on the patient's dossier to record their first visit.</p>
      </form>
    </>
  );
}

/* ---------------- Triage ---------------- */
function Triage({ clinic, onOpen }: { clinic: Clinic; onOpen: (id: number) => void }) {
  const rows = clinic.patients
    .map((p) => {
      const vs = visitsOf(clinic, p.id);
      const flaggedVisits = vs.filter(needsFollowUp);
      const last = vs.at(-1);
      return { p, flaggedVisits, last, score: last ? news2(last).score : 0 };
    })
    .filter((r) => r.flaggedVisits.length)
    .sort((a, b) => b.score - a.score);
  const due = (d?: string) => {
    if (!d) return null;
    const days = Math.round((new Date(d).getTime() - Date.now()) / 86400000);
    return days < 0 ? { t: `Overdue ${-days}d`, c: "text-destructive border-destructive/50" } : { t: `Due in ${days}d`, c: "text-alert border-alert/50" };
  };
  return (
    <>
      <SectionTitle kicker="Temp > 38 · HR > 100 · RR > 20 · BP > 140/90" title="Follow-up triage" />
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {rows.map(({ p, flaggedVisits, last }) => {
          const reasons = [...new Set(flaggedVisits.flatMap(followUpReasons))];
          const next = [...flaggedVisits].reverse().find((v) => v.nextFollowUp)?.nextFollowUp;
          const d = due(next);
          return (
            <article key={p.id} className="panel flex flex-col p-5">
              <div className="flex items-start gap-3">
                <Avatar name={p.name} />
                <div className="flex-1">
                  <h3 className="font-medium">{p.name}</h3>
                  <p className="font-mono text-[11px] text-muted-foreground">#{p.id} · {p.age}y · {p.conditions || "no chronic conditions"}</p>
                </div>
                {last && <RiskChip v={last} />}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {reasons.map((r) => <span key={r} className="chip border-alert/50 text-alert">{r}</span>)}
                {d && <span className={`chip ${d.c}`}>{d.t}</span>}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{flaggedVisits.length} abnormal visit{flaggedVisits.length > 1 ? "s" : ""} · last flagged {flaggedVisits.at(-1)?.date}</p>
              <div className="mt-auto flex gap-2 pt-4">
                <a href={`tel:${p.contact}`} className="btn-primary flex-1"><Phone className="h-4 w-4" /> {p.contact}</a>
                <button className="btn-outline" onClick={() => onOpen(p.id)}>Open</button>
              </div>
            </article>
          );
        })}
        {!rows.length && <p className="text-muted-foreground">No patients need follow-up. </p>}
      </div>
    </>
  );
}

/* ---------------- Data hub ---------------- */
function DataHub({ clinic, setClinic }: { clinic: Clinic; setClinic: (c: Clinic) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [report, setReport] = useState<{ ok: string; errors: string[] } | null>(null);
  const [mode, setMode] = useState<"replace" | "merge">("replace");

  const onFile = async (file: File) => {
    try {
      const { clinic: imported, errors } = fromWorkbook(await file.arrayBuffer());
      if (mode === "replace") setClinic(imported);
      else {
        const ids = new Set(clinic.patients.map((p) => p.id));
        setClinic({
          patients: [...clinic.patients, ...imported.patients.filter((p) => !ids.has(p.id))],
          visits: [...clinic.visits, ...imported.visits],
        });
      }
      setReport({ ok: `Imported ${imported.patients.length} patients and ${imported.visits.length} visits from ${file.name}.`, errors });
    } catch {
      setReport({ ok: "", errors: ["Could not read that file. Please choose an .xlsx workbook."] });
    }
  };

  return (
    <>
      <SectionTitle kicker="Two-sheet workbook · Patients + Visits" title="Excel data hub" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="panel p-5">
          <Download className="h-5 w-5 text-primary" />
          <h3 className="mt-3 font-display text-2xl">Export ledger</h3>
          <p className="mt-1 text-sm text-muted-foreground">Download all {clinic.patients.length} patients and {clinic.visits.length} visits as one .xlsx file.</p>
          <button className="btn-primary mt-4" onClick={() => downloadWorkbook(clinic, `vitals-ledger-${today()}.xlsx`)}>Download .xlsx</button>
        </div>
        <div className="panel p-5">
          <Upload className="h-5 w-5 text-primary" />
          <h3 className="mt-3 font-display text-2xl">Import workbook</h3>
          <p className="mt-1 text-sm text-muted-foreground">Every visit row is checked against the vital-sign limits. Bad rows are skipped and listed.</p>
          <div className="mt-3 flex gap-1 rounded-md border border-border p-1 text-xs">
            {(["replace", "merge"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`flex-1 rounded px-2 py-1 capitalize ${mode === m ? "bg-accent text-foreground" : "text-muted-foreground"}`}>{m}</button>
            ))}
          </div>
          <input ref={input} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
          <button className="btn-outline mt-3" onClick={() => input.current?.click()}>Choose file…</button>
        </div>
        <div className="panel p-5">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          <h3 className="mt-3 font-display text-2xl">Blank template</h3>
          <p className="mt-1 text-sm text-muted-foreground">Start fresh in Excel or Google Sheets with the correct column headers.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-outline" onClick={() => downloadWorkbook({ patients: [], visits: [] }, "vitals-ledger-template.xlsx")}>Template</button>
            <button className="btn-outline" onClick={() => confirm("Restore the sample patients? Current data will be replaced.") && setClinic(SEED)}><Database className="h-4 w-4" /> Load sample data</button>
          </div>
        </div>
      </div>

      {report && (
        <div className="panel mt-4 p-5">
          {report.ok && <p className="text-sm text-primary">{report.ok}</p>}
          {report.errors.length > 0 && (
            <>
              <p className="mt-2 text-sm text-alert">{report.errors.length} row(s) skipped:</p>
              <ul className="mt-2 max-h-60 overflow-y-auto font-mono text-xs text-muted-foreground">{report.errors.map((e, i) => <li key={i}>· {e}</li>)}</ul>
            </>
          )}
        </div>
      )}

      <div className="panel mt-4 overflow-x-auto p-5">
        <p className="eyebrow mb-3">Workbook layout</p>
        <div className="grid gap-4 font-mono text-[11px] md:grid-cols-2">
          <div><p className="mb-1 text-primary">Sheet: Patients</p><p className="text-muted-foreground">Patient ID · Full Name · Age · Sex · Height (cm) · Weight (kg) · Contact Number · Blood Group · Allergies · Chronic Conditions · Emergency Contact · Registered On</p></div>
          <div><p className="mb-1 text-primary">Sheet: Visits</p><p className="text-muted-foreground">Patient ID · Visit Date · Temperature · Heart Rate · Respiratory Rate · Systolic BP · Diastolic BP · SpO2 · Chief Complaint · Doctor Note · Next Follow-up</p></div>
        </div>
      </div>
    </>
  );
}
