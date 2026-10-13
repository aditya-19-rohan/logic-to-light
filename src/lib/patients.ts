// Port of the Health Information System Python logic.
export type Visit = {
  date: string;
  temp: number;
  hr: number;
  rr: number;
  sbp: number;
  dbp: number;
  spo2: number;
};
export type Patients = Record<number, Visit[]>;

export const RANGES = {
  temp: [35, 42],
  hr: [30, 180],
  rr: [5, 40],
  sbp: [70, 200],
  dbp: [40, 120],
  spo2: [70, 100],
} as const;

export const LABELS: Record<keyof typeof RANGES, { name: string; unit: string }> = {
  temp: { name: "Temperature", unit: "°C" },
  hr: { name: "Heart rate", unit: "bpm" },
  rr: { name: "Respiratory rate", unit: "br/min" },
  sbp: { name: "Systolic BP", unit: "mmHg" },
  dbp: { name: "Diastolic BP", unit: "mmHg" },
  spo2: { name: "Oxygen saturation", unit: "%" },
};

export function isValidDate(date: string): boolean {
  const parts = date.split("-");
  if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) return false;
  const [, m = 0, d = 0] = parts.map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

export function validateVisit(v: Visit): string | null {
  if (!isValidDate(v.date)) return "Invalid date format. Use yyyy-mm-dd.";
  for (const key of Object.keys(RANGES) as (keyof typeof RANGES)[]) {
    const [lo, hi] = RANGES[key];
    const val = v[key];
    if (Number.isNaN(val) || val < lo || val > hi)
      return `Invalid ${LABELS[key].name.toLowerCase()}: must be between ${lo} and ${hi} ${LABELS[key].unit}.`;
  }
  return null;
}

export function parsePatientsText(text: string): { patients: Patients; errors: string[] } {
  const patients: Patients = {};
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const n = i + 1;
    const line = raw.trim();
    if (!line) return;
    const f = line.split(",");
    if (f.length !== 8) {
      errors.push(`Invalid number of fields (${f.length}) in line: ${n}`);
      return;
    }
    const id = Number(f[0]);
    const v: Visit = {
      date: f[1] ?? "",
      temp: Number(f[2]),
      hr: Number(f[3]),
      rr: Number(f[4]),
      sbp: Number(f[5]),
      dbp: Number(f[6]),
      spo2: Number(f[7]),
    };
    if (!Number.isInteger(id) || [v.temp, v.hr, v.rr, v.sbp, v.dbp, v.spo2].some(Number.isNaN)) {
      errors.push(`Invalid data type in line: ${n}`);
      return;
    }
    for (const key of Object.keys(RANGES) as (keyof typeof RANGES)[]) {
      const [lo, hi] = RANGES[key];
      if (v[key] < lo || v[key] > hi) {
        errors.push(`Invalid ${LABELS[key].name.toLowerCase()} value (${v[key]}) in line: ${n}`);
        return;
      }
    }
    (patients[id] ??= []).push(v);
  });
  return { patients, errors };
}

export function toText(patients: Patients): string {
  return Object.entries(patients)
    .flatMap(([id, visits]) =>
      visits.map((v) => [id, v.date, v.temp, v.hr, v.rr, v.sbp, v.dbp, v.spo2].join(",")),
    )
    .join("\n");
}

export type Stats = Omit<Visit, "date"> & { visits: number };

export function calculateAverageStats(patients: Patients, id?: number): Stats | null {
  const ids = id === undefined ? Object.keys(patients).map(Number) : patients[id] ? [id] : [];
  const all = ids.flatMap((i) => patients[i] ?? []);
  if (!all.length) return null;
  const avg = (k: keyof Omit<Visit, "date">) => all.reduce((s, v) => s + v[k], 0) / all.length;
  return {
    temp: avg("temp"),
    hr: avg("hr"),
    rr: avg("rr"),
    sbp: avg("sbp"),
    dbp: avg("dbp"),
    spo2: avg("spo2"),
    visits: all.length,
  };
}

export function needsFollowUp(v: Visit): boolean {
  return v.temp > 38 || v.hr > 100 || v.rr > 20 || v.sbp > 140 || v.dbp > 90;
}

export function findPatientsWhoNeedFollowUp(patients: Patients): number[] {
  return Object.entries(patients)
    .filter(([, visits]) => visits.some(needsFollowUp))
    .map(([id]) => Number(id));
}

export function findVisitsByDate(
  patients: Patients,
  year?: number,
  month?: number,
): { id: number; visit: Visit }[] {
  const out: { id: number; visit: Visit }[] = [];
  for (const [id, visits] of Object.entries(patients)) {
    for (const visit of visits) {
      if (!isValidDate(visit.date)) continue;
      const [y, m] = visit.date.split("-").map(Number);
      if (year && y !== year) continue;
      if (month && m !== month) continue; // month 0 / empty = any month
      out.push({ id: Number(id), visit });
    }
  }
  return out;
}

export const SAMPLE = `1,2023-07-01,36.5,72,16,120,80,98
1,2023-08-12,38.6,104,22,145,92,95
2,2023-07-15,37.0,68,14,118,76,99
2,2024-01-03,36.8,70,15,122,78,98
3,2023-09-20,36.9,88,18,132,84,97
4,2024-02-11,37.2,96,19,150,95,96
5,2024-03-05,36.6,64,12,110,70,99`;
