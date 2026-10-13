import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  LABELS,
  SAMPLE,
  calculateAverageStats,
  findPatientsWhoNeedFollowUp,
  findVisitsByDate,
  needsFollowUp,
  parsePatientsText,
  toText,
  validateVisit,
  type Patients,
  type Visit,
} from "@/lib/patients";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vitals Ledger — Health Information System" },
      { name: "description", content: "Record patient visits, review vital-sign statistics and spot patients who need follow-up." },
      { property: "og:title", content: "Vitals Ledger — Health Information System" },
      { property: "og:description", content: "Record patient visits, review vitals and flag follow-ups." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const TABS = ["Records", "Add visit", "Statistics", "Search by date", "Follow-up"] as const;
type Tab = (typeof TABS)[number];
const KEY = "vitals-ledger-patients";

function Index() {
  const [patients, setPatients] = useState<Patients>({});
  const [tab, setTab] = useState<Tab>("Records");
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    setPatients(parsePatientsText(saved ?? SAMPLE).patients);
  }, []);
  const save = (p: Patients) => {
    setPatients(p);
    localStorage.setItem(KEY, toText(p));
  };

  const importFile = async (file: File) => {
    const { patients: p, errors } = parsePatientsText(await file.text());
    save(p);
    setLog(errors.length ? errors : [`Loaded ${Object.keys(p).length} patients from ${file.name}`]);
  };
  const exportFile = () => {
    const url = URL.createObjectURL(new Blob([toText(patients) + "\n"], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "patients.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const ids = Object.keys(patients).map(Number).sort((a, b) => a - b);
  const totalVisits = ids.reduce((s, i) => s + patients[i].length, 0);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-6 px-6 py-10">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-primary">Health Information System</p>
            <h1 className="mt-2 font-display text-5xl md:text-6xl">Vitals Ledger</h1>
            <p className="mt-2 text-muted-foreground">
              {ids.length} patients · {totalVisits} visits on record
            </p>
          </div>
          <div className="flex gap-2">
            <label className="btn-outline cursor-pointer">
              Import patients.txt
              <input type="file" accept=".txt,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
            </label>
            <button className="btn-outline" onClick={exportFile}>Export</button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-6">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={tab === t ? "tab tab-active" : "tab"}>
              {t}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {log.length > 0 && (
          <div className="mb-6 rounded-md border border-border bg-muted p-4 font-mono text-xs">
            {log.map((l, i) => <div key={i}>{l}</div>)}
            <button className="mt-2 underline" onClick={() => setLog([])}>dismiss</button>
          </div>
        )}
        {tab === "Records" && <Records patients={patients} ids={ids} onDelete={(id) => {
          if (!confirm(`Delete all visits for Patient #${id}?`)) return;
          const next = { ...patients };
          delete next[id];
          save(next);
          setLog([`All visits for Patient #${id} have been deleted.`]);
        }} />}
        {tab === "Add visit" && <AddVisit onAdd={(id, v) => {
          save({ ...patients, [id]: [...(patients[id] ?? []), v] });
          setLog([`Visit is saved successfully for Patient #${id}`]);
        }} />}
        {tab === "Statistics" && <Statistics patients={patients} ids={ids} />}
        {tab === "Search by date" && <SearchByDate patients={patients} />}
        {tab === "Follow-up" && <FollowUp patients={patients} />}
      </main>
    </div>
  );
}

function VisitTable({ rows }: { rows: { id: number; visit: Visit }[] }) {
  if (!rows.length) return <p className="text-muted-foreground">No visits found.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted text-left font-mono text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="p-3">Patient</th><th className="p-3">Date</th>
            {Object.values(LABELS).map((l) => <th key={l.name} className="p-3">{l.name}<span className="normal-case"> ({l.unit})</span></th>)}
          </tr>
        </thead>
        <tbody className="font-mono">
          {rows.map(({ id, visit: v }, i) => (
            <tr key={i} className={`border-t border-border ${needsFollowUp(v) ? "bg-alert/10" : ""}`}>
              <td className="p-3 font-semibold">#{id}</td><td className="p-3">{v.date}</td>
              <td className={cell(v.temp > 38)}>{v.temp}</td><td className={cell(v.hr > 100)}>{v.hr}</td>
              <td className={cell(v.rr > 20)}>{v.rr}</td><td className={cell(v.sbp > 140)}>{v.sbp}</td>
              <td className={cell(v.dbp > 90)}>{v.dbp}</td><td className="p-3">{v.spo2}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
const cell = (bad: boolean) => (bad ? "p-3 font-bold text-alert" : "p-3");

function Records({ patients, ids, onDelete }: { patients: Patients; ids: number[]; onDelete: (id: number) => void }) {
  const [filter, setFilter] = useState("");
  const shown = filter ? ids.filter((i) => String(i) === filter.trim()) : ids;
  return (
    <div className="space-y-6">
      <input className="field max-w-xs" placeholder="Filter by patient ID" value={filter} onChange={(e) => setFilter(e.target.value)} />
      {filter && !shown.length && <p className="text-muted-foreground">No data found for patient with ID {filter}</p>}
      {shown.map((id) => (
        <section key={id} className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl">Patient #{id}</h2>
            <button className="text-sm text-destructive hover:underline" onClick={() => onDelete(id)}>Delete all visits</button>
          </div>
          <VisitTable rows={patients[id].map((visit) => ({ id, visit }))} />
        </section>
      ))}
    </div>
  );
}

function AddVisit({ onAdd }: { onAdd: (id: number, v: Visit) => void }) {
  const empty = { id: "", date: "", temp: "", hr: "", rr: "", sbp: "", dbp: "", spo2: "" };
  const [f, setF] = useState(empty);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = Number(f.id);
    if (!f.id || !Number.isInteger(id)) return setErr("Please enter a whole-number patient ID.");
    const v: Visit = { date: f.date, temp: +f.temp, hr: +f.hr, rr: +f.rr, sbp: +f.sbp, dbp: +f.dbp, spo2: +f.spo2 };
    const problem = validateVisit(v);
    if (problem) return setErr(problem);
    setErr(null);
    onAdd(id, v);
    setF(empty);
  };
  return (
    <form onSubmit={submit} className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <Field label="Patient ID"><input className="field" value={f.id} onChange={set("id")} inputMode="numeric" /></Field>
      <Field label="Date (YYYY-MM-DD)"><input className="field" value={f.date} onChange={set("date")} placeholder="2024-05-01" /></Field>
      {(Object.keys(LABELS) as (keyof typeof LABELS)[]).map((k) => (
        <Field key={k} label={`${LABELS[k].name} (${LABELS[k].unit})`}>
          <input className="field" value={f[k]} onChange={set(k)} inputMode="decimal" />
        </Field>
      ))}
      {err && <p className="text-sm text-destructive sm:col-span-2">{err}</p>}
      <button className="btn-primary sm:col-span-2">Save visit</button>
    </form>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1"><span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{label}</span>{children}</label>;
}

function Statistics({ patients, ids }: { patients: Patients; ids: number[] }) {
  const [sel, setSel] = useState("0");
  const s = useMemo(() => calculateAverageStats(patients, sel === "0" ? undefined : Number(sel)), [patients, sel]);
  return (
    <div className="space-y-6">
      <select className="field max-w-xs" value={sel} onChange={(e) => setSel(e.target.value)}>
        <option value="0">All patients (overall)</option>
        {ids.map((i) => <option key={i} value={i}>Patient #{i}</option>)}
      </select>
      {!s ? <p className="text-muted-foreground">No data found.</p> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(LABELS) as (keyof typeof LABELS)[]).map((k) => (
            <div key={k} className="stat-card">
              <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Avg {LABELS[k].name}</p>
              <p className="mt-2 font-display text-4xl">{s[k].toFixed(2)}<span className="ml-1 text-base text-muted-foreground">{LABELS[k].unit}</span></p>
            </div>
          ))}
          <div className="stat-card bg-primary text-primary-foreground">
            <p className="font-mono text-xs uppercase tracking-wider opacity-80">Total visits</p>
            <p className="mt-2 font-display text-4xl">{s.visits}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function SearchByDate({ patients }: { patients: Patients }) {
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("0");
  const rows = findVisitsByDate(patients, year ? Number(year) : undefined, Number(month) || undefined);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4">
        <Field label="Year"><input className="field" value={year} onChange={(e) => setYear(e.target.value)} placeholder="Any" /></Field>
        <Field label="Month">
          <select className="field" value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="0">Any month</option>
            {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{new Date(2000, i).toLocaleString("en", { month: "long" })}</option>)}
          </select>
        </Field>
      </div>
      <VisitTable rows={rows} />
    </div>
  );
}

function FollowUp({ patients }: { patients: Patients }) {
  const ids = findPatientsWhoNeedFollowUp(patients);
  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-muted-foreground">
        Flagged when any visit shows temperature above 38 °C, heart rate above 100 bpm, respiratory rate above 20, systolic above 140 or diastolic above 90 mmHg.
      </p>
      {!ids.length ? <p>No patients currently need follow-up.</p> : (
        <VisitTable rows={ids.flatMap((id) => patients[id].filter(needsFollowUp).map((visit) => ({ id, visit })))} />
      )}
    </div>
  );
}
