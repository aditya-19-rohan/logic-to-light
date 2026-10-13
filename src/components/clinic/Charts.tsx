import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { ageGroup, bpStage, BP_STAGES, followUpReasons, latestVisit, news2, type Clinic, type ClinicVisit } from "@/lib/clinic";

const C = {
  emerald: "var(--chart-1)", copper: "var(--chart-2)", amber: "var(--chart-3)",
  red: "var(--chart-4)", blue: "var(--chart-5)", grid: "var(--border)", muted: "var(--muted-foreground)",
};
const axis = { stroke: C.muted, fontSize: 11, fontFamily: "IBM Plex Mono", tickLine: false, axisLine: false } as const;
const tip = {
  contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12, fontFamily: "IBM Plex Mono" },
  labelStyle: { color: "var(--foreground)" }, itemStyle: { color: "var(--foreground)" },
  cursor: { fill: "color-mix(in oklch, var(--foreground) 5%, transparent)" },
};

function Frame({ title, kicker, children, className = "" }: { title: string; kicker: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`panel p-5 ${className}`}>
      <p className="eyebrow">{kicker}</p>
      <h3 className="mb-4 font-display text-2xl">{title}</h3>
      <div className="h-56">{children}</div>
    </div>
  );
}

export function OverviewCharts({ clinic }: { clinic: Clinic }) {
  const latest = clinic.patients.map((p) => latestVisit(clinic, p.id)).filter(Boolean) as ClinicVisit[];

  const risk = (["Low", "Medium", "High"] as const).map((r) => ({ name: r, value: latest.filter((v) => news2(v).risk === r).length }));
  const riskColor = { Low: C.emerald, Medium: C.amber, High: C.red };

  const bp = BP_STAGES.map((s) => ({ stage: s, patients: latest.filter((v) => bpStage(v.sbp, v.dbp) === s).length }));
  const bpColor = [C.emerald, C.blue, C.amber, C.copper, C.red];

  const groups = ["0–17", "18–34", "35–49", "50–64", "65+"].map((g) => ({
    group: g,
    Male: clinic.patients.filter((p) => ageGroup(p.age) === g && p.sex === "Male").length,
    Female: clinic.patients.filter((p) => ageGroup(p.age) === g && p.sex === "Female").length,
    Other: clinic.patients.filter((p) => ageGroup(p.age) === g && p.sex === "Other").length,
  }));

  const triggers = ["Fever", "Tachycardia", "Tachypnoea", "Hypertension"].map((t) => ({
    trigger: t, count: clinic.visits.filter((v) => followUpReasons(v).includes(t)).length,
  }));

  const months = new Map<string, { visits: number; flagged: number }>();
  [...clinic.visits].sort((a, b) => a.date.localeCompare(b.date)).forEach((v) => {
    const m = v.date.slice(0, 7);
    const e = months.get(m) ?? { visits: 0, flagged: 0 };
    e.visits++; if (followUpReasons(v).length) e.flagged++;
    months.set(m, e);
  });
  const timeline = [...months].map(([month, e]) => ({ month, ...e }));

  return (
    <div className="grid gap-4 lg:grid-cols-6">
      <Frame kicker="Clinic throughput" title="Visits per month" className="lg:col-span-4">
        <ResponsiveContainer>
          <AreaChart data={timeline} margin={{ left: -20, right: 8 }}>
            <defs>
              <linearGradient id="gv" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={C.emerald} stopOpacity={0.45} />
                <stop offset="100%" stopColor={C.emerald} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={C.grid} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="month" {...axis} />
            <YAxis allowDecimals={false} {...axis} />
            <Tooltip {...tip} />
            <Area type="monotone" dataKey="visits" stroke={C.emerald} strokeWidth={2} fill="url(#gv)" />
            <Area type="monotone" dataKey="flagged" stroke={C.copper} strokeWidth={2} fill="transparent" strokeDasharray="4 3" />
          </AreaChart>
        </ResponsiveContainer>
      </Frame>
      <Frame kicker="NEWS2 · latest visit" title="Deterioration risk" className="lg:col-span-2">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={risk} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="85%" paddingAngle={3} stroke="none">
              {risk.map((r) => <Cell key={r.name} fill={riskColor[r.name]} />)}
            </Pie>
            <Tooltip {...tip} />
            <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11, fontFamily: "IBM Plex Mono" }} />
          </PieChart>
        </ResponsiveContainer>
      </Frame>
      <Frame kicker="AHA categories" title="Blood pressure staging" className="lg:col-span-2">
        <ResponsiveContainer>
          <BarChart data={bp} layout="vertical" margin={{ left: 0, right: 12 }}>
            <XAxis type="number" allowDecimals={false} {...axis} />
            <YAxis type="category" dataKey="stage" width={64} {...axis} />
            <Tooltip {...tip} />
            <Bar dataKey="patients" radius={[0, 3, 3, 0]}>
              {bp.map((b, i) => <Cell key={b.stage} fill={bpColor[i]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Frame>
      <Frame kicker="Demographics" title="Age & sex" className="lg:col-span-2">
        <ResponsiveContainer>
          <BarChart data={groups} margin={{ left: -20 }}>
            <CartesianGrid stroke={C.grid} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="group" {...axis} />
            <YAxis allowDecimals={false} {...axis} />
            <Tooltip {...tip} />
            <Bar dataKey="Male" stackId="a" fill={C.blue} />
            <Bar dataKey="Female" stackId="a" fill={C.copper} />
            <Bar dataKey="Other" stackId="a" fill={C.amber} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Frame>
      <Frame kicker="All visits" title="Follow-up triggers" className="lg:col-span-2">
        <ResponsiveContainer>
          <BarChart data={triggers} margin={{ left: -20 }}>
            <CartesianGrid stroke={C.grid} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="trigger" {...axis} fontSize={10} />
            <YAxis allowDecimals={false} {...axis} />
            <Tooltip {...tip} />
            <Bar dataKey="count" fill={C.red} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Frame>
    </div>
  );
}

export function TrendChart({ visits }: { visits: ClinicVisit[] }) {
  if (visits.length === 0) return <p className="text-sm text-muted-foreground">No visits yet.</p>;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="h-52">
        <p className="eyebrow mb-2">Blood pressure · mmHg</p>
        <ResponsiveContainer>
          <LineChart data={visits} margin={{ left: -20, right: 8 }}>
            <CartesianGrid stroke={C.grid} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="date" {...axis} fontSize={10} />
            <YAxis domain={[50, 200]} {...axis} />
            <Tooltip {...tip} />
            <ReferenceLine y={140} stroke={C.red} strokeDasharray="3 3" />
            <ReferenceLine y={90} stroke={C.amber} strokeDasharray="3 3" />
            <Line dataKey="sbp" name="Systolic" stroke={C.copper} strokeWidth={2} dot={{ r: 3 }} />
            <Line dataKey="dbp" name="Diastolic" stroke={C.blue} strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="h-52">
        <p className="eyebrow mb-2">Heart rate · bpm &nbsp;/&nbsp; SpO₂ · %</p>
        <ResponsiveContainer>
          <LineChart data={visits} margin={{ left: -20, right: 8 }}>
            <CartesianGrid stroke={C.grid} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="date" {...axis} fontSize={10} />
            <YAxis domain={[40, 130]} {...axis} />
            <Tooltip {...tip} />
            <ReferenceLine y={100} stroke={C.red} strokeDasharray="3 3" />
            <Line dataKey="hr" name="Heart rate" stroke={C.emerald} strokeWidth={2} dot={{ r: 3 }} />
            <Line dataKey="spo2" name="SpO₂" stroke={C.amber} strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
