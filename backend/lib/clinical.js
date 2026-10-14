// Server-side copy of the clinical rules used by the React app (src/lib/patients.ts, src/lib/clinic.ts).

export const RANGES = {
  temp: [35, 42],
  hr: [30, 180],
  rr: [5, 40],
  sbp: [70, 200],
  dbp: [40, 120],
  spo2: [70, 100],
};

export function followUpReasons(v) {
  const r = [];
  if (v.temp > 38) r.push("Fever");
  if (v.hr > 100) r.push("Tachycardia");
  if (v.rr > 20) r.push("Tachypnoea");
  if (v.sbp > 140 || v.dbp > 90) r.push("Hypertension");
  return r;
}

export function bpStage(sbp, dbp) {
  if (sbp > 180 || dbp > 120) return "Crisis";
  if (sbp >= 140 || dbp >= 90) return "Stage 2";
  if (sbp >= 130 || dbp >= 80) return "Stage 1";
  if (sbp >= 120) return "Elevated";
  return "Normal";
}

/** NEWS2 (scale 1, room air, alert patient assumed). */
export function news2(v) {
  const parts = [
    v.rr <= 8 ? 3 : v.rr <= 11 ? 1 : v.rr <= 20 ? 0 : v.rr <= 24 ? 2 : 3,
    v.spo2 <= 91 ? 3 : v.spo2 <= 93 ? 2 : v.spo2 <= 95 ? 1 : 0,
    v.sbp <= 90 ? 3 : v.sbp <= 100 ? 2 : v.sbp <= 110 ? 1 : v.sbp <= 219 ? 0 : 3,
    v.hr <= 40 ? 3 : v.hr <= 50 ? 1 : v.hr <= 90 ? 0 : v.hr <= 110 ? 1 : v.hr <= 130 ? 2 : 3,
    v.temp <= 35 ? 3 : v.temp <= 36 ? 1 : v.temp <= 38 ? 0 : v.temp <= 39 ? 1 : 2,
  ];
  const score = parts.reduce((a, b) => a + b, 0);
  const anyThree = parts.includes(3);
  const risk = score >= 7 ? "High" : score >= 5 || anyThree ? "Medium" : "Low";
  return { score, risk };
}
