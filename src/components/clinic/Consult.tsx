import { useEffect, useState } from "react";
import { AlertTriangle, Clock, MessageCircle, Pill, Plus, Stethoscope, X } from "lucide-react";
import { allergyConflicts, MED_PRESETS, whatsappLink, type Medication, type Soap } from "@/lib/ehr";
import type { Clinic, ClinicVisit, Patient } from "@/lib/clinic";

/* ---------- SOAP ---------- */
const SOAP_FIELDS: { k: keyof Soap; label: string; hint: string }[] = [
  { k: "s", label: "Subjective", hint: "Symptoms, history in the patient's words" },
  { k: "o", label: "Objective", hint: "Examination findings" },
  { k: "a", label: "Assessment", hint: "Diagnosis / impression" },
  { k: "p", label: "Plan", hint: "Treatment, tests, advice" },
];
export function SoapFields({ value, onChange }: { value: Soap; onChange: (s: Soap) => void }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {SOAP_FIELDS.map((f) => (
        <div key={f.k}>
          <label className="label"><span className="font-mono text-primary">{f.k.toUpperCase()}</span> · {f.label}</label>
          <textarea rows={2} className="field min-h-[72px]" placeholder={f.hint} value={value[f.k]} onChange={(e) => onChange({ ...value, [f.k]: e.target.value })} />
        </div>
      ))}
    </div>
  );
}

/* ---------- Prescription builder ---------- */
const blank: Medication = { drug: "", dose: "", frequency: "1-0-1", days: 5, instructions: "" };
export function PrescriptionBuilder({ meds, onChange, allergies }: { meds: Medication[]; onChange: (m: Medication[]) => void; allergies: string }) {
  const [draft, setDraft] = useState<Medication>(blank);
  const add = (m: Medication) => { if (m.drug.trim()) { onChange([...meds, { ...m, drug: m.drug.trim() }]); setDraft(blank); } };
  const warnings = allergyConflicts(allergies, meds);
  const draftWarn = draft.drug ? allergyConflicts(allergies, [draft]) : [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {MED_PRESETS.map((m) => {
          const clash = allergyConflicts(allergies, [m]).length > 0;
          return (
            <button type="button" key={m.drug} onClick={() => add(m)}
              className={`chip transition hover:bg-accent ${clash ? "border-destructive/60 text-destructive" : "border-border text-muted-foreground"}`}
              title={clash ? "Conflicts with patient allergies" : `${m.dose} · ${m.frequency}`}>
              <Plus className="h-3 w-3" /> {m.drug}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-[2fr_1fr_1fr_80px_2fr_auto]">
        <input className="field col-span-2 md:col-span-1" placeholder="Drug" value={draft.drug} onChange={(e) => setDraft({ ...draft, drug: e.target.value })} />
        <input className="field" placeholder="Dose" value={draft.dose} onChange={(e) => setDraft({ ...draft, dose: e.target.value })} />
        <input className="field font-mono" placeholder="1-0-1" value={draft.frequency} onChange={(e) => setDraft({ ...draft, frequency: e.target.value })} />
        <input className="field font-mono" type="number" min={0} placeholder="Days" value={draft.days} onChange={(e) => setDraft({ ...draft, days: Number(e.target.value) })} />
        <input className="field" placeholder="Instructions" value={draft.instructions ?? ""} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} />
        <button type="button" className="btn-outline col-span-2 md:col-span-1" onClick={() => add(draft)}><Plus className="h-4 w-4" /> Add</button>
      </div>
      {draftWarn.length > 0 && <p className="text-xs text-destructive">⚠ {draftWarn[0]}</p>}
      {meds.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {meds.map((m, i) => (
            <li key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
              <Pill className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1"><b className="font-medium">{m.drug}</b> {m.dose} · <span className="font-mono">{m.frequency}</span> · {m.days}d {m.instructions && <span className="text-muted-foreground">· {m.instructions}</span>}</span>
              <button type="button" aria-label={`Remove ${m.drug}`} onClick={() => onChange(meds.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      )}
      {warnings.length > 0 && (
        <div role="alert" className="flex gap-3 rounded-lg border border-destructive/60 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div><p className="font-medium">Drug-allergy conflict</p><ul className="mt-1 text-xs">{warnings.map((w) => <li key={w}>· {w}</li>)}</ul></div>
        </div>
      )}
    </div>
  );
}

/* ---------- Printable Rx slip ---------- */
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
export function printRx(p: Patient, v: ClinicVisit) {
  const w = window.open("", "_blank", "width=820,height=1000");
  if (!w) return;
  const rows = (v.meds ?? []).map((m, i) => `<tr><td>${i + 1}</td><td><b>${esc(m.drug)}</b></td><td>${esc(m.dose)}</td><td>${esc(m.frequency)}</td><td>${m.days} days</td><td>${esc(m.instructions ?? "")}</td></tr>`).join("");
  w.document.write(`<!doctype html><html><head><title>Rx · ${esc(p.name)} · ${v.date}</title><style>
    body{font-family:Georgia,serif;color:#12261c;margin:40px;max-width:720px}
    header{display:flex;justify-content:space-between;border-bottom:3px solid #1d4d33;padding-bottom:12px}
    h1{margin:0;font-size:28px;color:#1d4d33}small,.m{font-family:ui-monospace,monospace;font-size:12px;color:#555}
    .rx{font-size:40px;color:#1d4d33;margin:18px 0 4px}table{width:100%;border-collapse:collapse;font-size:14px}
    th,td{text-align:left;padding:8px;border-bottom:1px solid #ddd}th{font-family:ui-monospace,monospace;font-size:11px;text-transform:uppercase}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;margin:16px 0;font-size:14px}.warn{color:#b00020}
    footer{margin-top:72px;display:flex;justify-content:space-between;align-items:end}.sig{border-top:1px solid #333;width:220px;text-align:center;padding-top:6px;font-size:13px}
  </style></head><body>
  <header><div><h1>Vitals Ledger Clinic</h1><small>General &amp; Family Medicine</small></div><div class="m" style="text-align:right">Date: ${v.date}<br/>Patient #${String(p.id).padStart(4, "0")}</div></header>
  <div class="grid"><div><b>${esc(p.name)}</b></div><div>${p.age} y · ${p.sex}</div>
  <div class="m">ABHA: ${esc(p.abha ?? "—")}</div><div class="m">Phone: ${esc(p.contact)}</div>
  <div class="warn">Allergies: ${esc(p.allergies || "None")}</div><div>BP ${v.sbp}/${v.dbp} · HR ${v.hr} · T ${v.temp}°C · SpO₂ ${v.spo2}%</div></div>
  ${v.soap?.a ? `<p><b>Diagnosis:</b> ${esc(v.soap.a)}</p>` : v.complaint ? `<p><b>Complaint:</b> ${esc(v.complaint)}</p>` : ""}
  <div class="rx">℞</div>
  <table><thead><tr><th>#</th><th>Medicine</th><th>Dose</th><th>Frequency</th><th>Duration</th><th>Instructions</th></tr></thead><tbody>${rows || `<tr><td colspan="6">No medicines prescribed.</td></tr>`}</tbody></table>
  ${v.soap?.p ? `<p style="margin-top:18px"><b>Advice:</b> ${esc(v.soap.p)}</p>` : ""}
  ${v.nextFollowUp ? `<p><b>Review on:</b> ${v.nextFollowUp}</p>` : ""}
  <footer><small>Frequency: morning-noon-night</small><div class="sig">Doctor's signature</div></footer>
  <script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}

export function WhatsAppButton({ p, v }: { p: Patient; v?: ClinicVisit | undefined }) {
  return (
    <a className="btn-outline" target="_blank" rel="noreferrer" href={whatsappLink(p.contact, p.name, v?.nextFollowUp, v?.meds)}>
      <MessageCircle className="h-4 w-4" /> WhatsApp
    </a>
  );
}

/* ---------- Live queue (kept on this device) ---------- */
type Status = "waiting" | "consult" | "done";
type Ticket = { token: number; patientId: number; status: Status; arrivedAt: number };
const QKEY = "vitals-ledger-queue-v1";

export function LiveQueue({ clinic, onOpen }: { clinic: Clinic; onOpen: (id: number) => void }) {
  const [q, setQ] = useState<Ticket[]>([]);
  const [pick, setPick] = useState("");
  const [, tick] = useState(0);
  useEffect(() => {
    try { setQ(JSON.parse(localStorage.getItem(QKEY) ?? "[]")); } catch { /* ignore */ }
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);
  const save = (next: Ticket[]) => { setQ(next); localStorage.setItem(QKEY, JSON.stringify(next)); };
  const name = (id: number) => clinic.patients.find((p) => p.id === id)?.name ?? `#${id}`;
  const checkIn = () => {
    const id = Number(pick);
    if (!id || q.some((t) => t.patientId === id && t.status !== "done")) return;
    save([...q, { token: Math.max(0, ...q.map((t) => t.token)) + 1, patientId: id, status: "waiting", arrivedAt: Date.now() }]);
    setPick("");
  };
  const move = (token: number, status: Status) => save(q.map((t) => (t.token === token ? { ...t, status } : t)));
  const cols: { s: Status; title: string }[] = [{ s: "waiting", title: "Waiting" }, { s: "consult", title: "In consultation" }, { s: "done", title: "Completed" }];
  const mins = (t: number) => Math.max(0, Math.round((Date.now() - t) / 60000));

  return (
    <>
      <div className="panel mb-4 flex flex-col gap-2 p-4 sm:flex-row">
        <select className="field flex-1" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Patient to check in">
          <option value="">Select patient to check in…</option>
          {clinic.patients.map((p) => <option key={p.id} value={p.id}>{p.name} · #{p.id}</option>)}
        </select>
        <button className="btn-primary" onClick={checkIn} disabled={!pick}><Plus className="h-4 w-4" /> Check in</button>
        <button className="btn-outline" onClick={() => confirm("Clear today's queue?") && save([])}>Reset day</button>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {cols.map((c) => {
          const items = q.filter((t) => t.status === c.s);
          return (
            <section key={c.s} className="panel p-4">
              <p className="eyebrow mb-3">{c.title} · {items.length}</p>
              <ul className="space-y-2">
                {items.map((t) => (
                  <li key={t.token} className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-2xl text-primary">{String(t.token).padStart(2, "0")}</span>
                      <button className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:text-primary" onClick={() => onOpen(t.patientId)}>{name(t.patientId)}</button>
                      <span className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground"><Clock className="h-3 w-3" />{mins(t.arrivedAt)}m</span>
                    </div>
                    {c.s !== "done" && (
                      <button className="btn-outline mt-2 w-full" onClick={() => move(t.token, c.s === "waiting" ? "consult" : "done")}>
                        {c.s === "waiting" ? <><Stethoscope className="h-4 w-4" /> Call in</> : "Mark done"}
                      </button>
                    )}
                  </li>
                ))}
                {!items.length && <li className="text-sm text-muted-foreground">Empty</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
