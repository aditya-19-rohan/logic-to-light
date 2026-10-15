// Clinical extensions on top of the original Python-port rules in ./patients.
import * as XLSX from "xlsx";
import { validateVisit, needsFollowUp, type Visit } from "./patients";

export type Sex = "Male" | "Female" | "Other";
export type Patient = {
  id: number;
  name: string;
  age: number;
  sex: Sex;
  heightCm: number;
  weightKg: number;
  contact: string;
  bloodGroup: string;
  allergies: string;
  conditions: string;
  emergencyContact: string;
  registeredAt: string;
};
export type ClinicVisit = Visit & {
  patientId: number;
  complaint?: string | undefined;
  note?: string | undefined;
  nextFollowUp?: string | undefined;
};
export type Clinic = { patients: Patient[]; visits: ClinicVisit[] };

// ---------- Scores ----------
export function bmi(p: Pick<Patient, "heightCm" | "weightKg">): number {
  const m = p.heightCm / 100;
  return m > 0 ? p.weightKg / (m * m) : 0;
}
export function bmiClass(v: number): "Underweight" | "Normal" | "Overweight" | "Obese" {
  if (v < 18.5) return "Underweight";
  if (v < 25) return "Normal";
  if (v < 30) return "Overweight";
  return "Obese";
}

export type BpStage = "Normal" | "Elevated" | "Stage 1" | "Stage 2" | "Crisis";
export const BP_STAGES: BpStage[] = ["Normal", "Elevated", "Stage 1", "Stage 2", "Crisis"];
/** AHA blood pressure categories. */
export function bpStage(sbp: number, dbp: number): BpStage {
  if (sbp > 180 || dbp > 120) return "Crisis";
  if (sbp >= 140 || dbp >= 90) return "Stage 2";
  if (sbp >= 130 || dbp >= 80) return "Stage 1";
  if (sbp >= 120) return "Elevated";
  return "Normal";
}

/** NEWS2 (scale 1, room air, alert patient assumed). */
export function news2(v: Visit): { score: number; risk: "Low" | "Medium" | "High"; anyThree: boolean } {
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
  return { score, risk, anyThree };
}

export function followUpReasons(v: Visit): string[] {
  const r: string[] = [];
  if (v.temp > 38) r.push("Fever");
  if (v.hr > 100) r.push("Tachycardia");
  if (v.rr > 20) r.push("Tachypnoea");
  if (v.sbp > 140 || v.dbp > 90) r.push("Hypertension");
  return r;
}

export function ageGroup(age: number): string {
  if (age < 18) return "0–17";
  if (age < 35) return "18–34";
  if (age < 50) return "35–49";
  if (age < 65) return "50–64";
  return "65+";
}

export function visitsOf(c: Clinic, id: number): ClinicVisit[] {
  return c.visits.filter((v) => v.patientId === id).sort((a, b) => a.date.localeCompare(b.date));
}
export function latestVisit(c: Clinic, id: number): ClinicVisit | undefined {
  return visitsOf(c, id).at(-1);
}
export function needsFollowUpPatient(c: Clinic, id: number): boolean {
  return visitsOf(c, id).some(needsFollowUp);
}

// ---------- Excel ----------
const P_HEAD = ["Patient ID", "Full Name", "Age", "Sex", "Height (cm)", "Weight (kg)", "Contact Number", "Blood Group", "Allergies", "Chronic Conditions", "Emergency Contact", "Registered On"] as const;
const V_HEAD = ["Patient ID", "Visit Date", "Temperature", "Heart Rate", "Respiratory Rate", "Systolic BP", "Diastolic BP", "SpO2", "Chief Complaint", "Doctor Note", "Next Follow-up"] as const;

export function toWorkbook(c: Clinic): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const p = c.patients.map((x) => [x.id, x.name, x.age, x.sex, x.heightCm, x.weightKg, x.contact, x.bloodGroup, x.allergies, x.conditions, x.emergencyContact, x.registeredAt]);
  const v = c.visits.map((x) => [x.patientId, x.date, x.temp, x.hr, x.rr, x.sbp, x.dbp, x.spo2, x.complaint ?? "", x.note ?? "", x.nextFollowUp ?? ""]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[...P_HEAD], ...p]), "Patients");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[...V_HEAD], ...v]), "Visits");
  return wb;
}

export function downloadWorkbook(c: Clinic, filename: string) {
  XLSX.writeFile(toWorkbook(c), filename);
}

export function fromWorkbook(data: ArrayBuffer): { clinic: Clinic; errors: string[] } {
  const wb = XLSX.read(data, { type: "array" });
  const errors: string[] = [];
  const rows = (name: string) => {
    const ws = wb.Sheets[name];
    if (!ws) { errors.push(`Missing sheet "${name}"`); return []; }
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false });
  };
  const s = (r: Record<string, unknown>, k: string) => String(r[k] ?? "").trim();
  const patients: Patient[] = [];
  rows("Patients").forEach((r, i) => {
    const id = Number(s(r, "Patient ID"));
    const name = s(r, "Full Name");
    const age = Number(s(r, "Age"));
    if (!Number.isInteger(id) || !name || Number.isNaN(age)) { errors.push(`Patients row ${i + 2}: missing ID, name or age`); return; }
    const sex = s(r, "Sex") as Sex;
    patients.push({
      id, name, age,
      sex: ["Male", "Female", "Other"].includes(sex) ? sex : "Other",
      heightCm: Number(s(r, "Height (cm)")) || 0,
      weightKg: Number(s(r, "Weight (kg)")) || 0,
      contact: s(r, "Contact Number"),
      bloodGroup: s(r, "Blood Group"),
      allergies: s(r, "Allergies"),
      conditions: s(r, "Chronic Conditions"),
      emergencyContact: s(r, "Emergency Contact"),
      registeredAt: s(r, "Registered On"),
    });
  });
  const ids = new Set(patients.map((p) => p.id));
  const visits: ClinicVisit[] = [];
  rows("Visits").forEach((r, i) => {
    const v: ClinicVisit = {
      patientId: Number(s(r, "Patient ID")),
      date: s(r, "Visit Date"),
      temp: Number(s(r, "Temperature")),
      hr: Number(s(r, "Heart Rate")),
      rr: Number(s(r, "Respiratory Rate")),
      sbp: Number(s(r, "Systolic BP")),
      dbp: Number(s(r, "Diastolic BP")),
      spo2: Number(s(r, "SpO2")),
      complaint: s(r, "Chief Complaint") || undefined,
      note: s(r, "Doctor Note") || undefined,
      nextFollowUp: s(r, "Next Follow-up") || undefined,
    };
    if (!ids.has(v.patientId)) { errors.push(`Visits row ${i + 2}: unknown patient ${v.patientId}`); return; }
    const err = validateVisit(v);
    if (err) { errors.push(`Visits row ${i + 2}: ${err}`); return; }
    visits.push(v);
  });
  return { clinic: { patients, visits }, errors };
}

// ---------- Seed ----------
const P = (id: number, name: string, age: number, sex: Sex, h: number, w: number, contact: string, bg: string, allergies: string, conditions: string, ec: string, reg: string): Patient =>
  ({ id, name, age, sex, heightCm: h, weightKg: w, contact, bloodGroup: bg, allergies, conditions, emergencyContact: ec, registeredAt: reg });
const V = (patientId: number, date: string, temp: number, hr: number, rr: number, sbp: number, dbp: number, spo2: number, complaint?: string, note?: string, nextFollowUp?: string): ClinicVisit =>
  ({ patientId, date, temp, hr, rr, sbp, dbp, spo2, complaint, note, nextFollowUp });

export const SEED: Clinic = {
  patients: [
    P(1, "Ananya Sharma", 34, "Female", 162, 58, "+91 98201 44721", "B+", "Penicillin", "Asthma", "Rohit Sharma · +91 98201 11002", "2025-11-04"),
    P(2, "Rahul Mehta", 58, "Male", 175, 91, "+91 99300 18265", "O+", "None", "Type 2 Diabetes, Hypertension", "Kavita Mehta · +91 99300 18200", "2025-10-12"),
    P(3, "Fatima Khan", 27, "Female", 158, 49, "+91 90040 66310", "A-", "Peanuts", "None", "Imran Khan · +91 90040 66000", "2026-01-18"),
    P(4, "Vikram Iyer", 71, "Male", 168, 77, "+91 98450 22931", "AB+", "Sulfa drugs", "COPD", "Lakshmi Iyer · +91 98450 22000", "2025-09-02"),
    P(5, "Meera Nair", 45, "Female", 165, 82, "+91 97450 55120", "O-", "None", "Hypothyroidism", "Arjun Nair · +91 97450 55100", "2026-02-21"),
    P(6, "Arjun Das", 19, "Male", 181, 70, "+91 83370 10294", "B-", "Dust", "None", "Sunita Das · +91 83370 10200", "2026-03-09"),
    P(7, "Sneha Patil", 63, "Female", 155, 66, "+91 98220 70113", "A+", "Latex", "Osteoarthritis", "Nikhil Patil · +91 98220 70100", "2025-12-15"),
    P(8, "Karan Singh", 39, "Male", 178, 104, "+91 98110 39478", "O+", "None", "Sleep apnoea", "Preeti Singh · +91 98110 39400", "2026-04-02"),
  ],
  visits: [
    V(1, "2026-03-02", 36.8, 78, 16, 118, 76, 98, "Wheezing at night", "Inhaler technique reviewed."),
    V(1, "2026-05-14", 38.4, 104, 22, 124, 80, 95, "Fever, cough", "Likely viral bronchitis. Review in 1 week.", "2026-10-20"),
    V(1, "2026-08-30", 37.0, 82, 17, 120, 78, 97, "Routine check"),
    V(2, "2026-01-10", 36.7, 84, 16, 148, 94, 97, "BP review", "Started amlodipine 5mg."),
    V(2, "2026-04-22", 36.9, 80, 16, 142, 90, 97, "BP review", "Partial response, increase dose."),
    V(2, "2026-07-19", 36.6, 76, 15, 136, 86, 98, "BP review", "Improving.", "2026-10-10"),
    V(3, "2026-02-03", 36.6, 70, 14, 108, 70, 99, "Registration check-up"),
    V(3, "2026-06-11", 37.2, 74, 15, 112, 72, 99, "Mild headache"),
    V(4, "2025-12-20", 37.4, 96, 22, 138, 84, 92, "Breathlessness", "COPD exacerbation, steroids started."),
    V(4, "2026-03-28", 38.9, 112, 26, 152, 92, 90, "Productive cough, fever", "Chest infection. Antibiotics. Urgent review.", "2026-10-15"),
    V(4, "2026-07-05", 37.1, 92, 20, 140, 86, 93, "Follow-up", "Stable, still hypoxic at rest."),
    V(5, "2026-03-01", 36.5, 68, 14, 128, 82, 98, "Fatigue", "TSH ordered."),
    V(5, "2026-06-30", 36.6, 66, 14, 126, 80, 98, "Thyroid review"),
    V(6, "2026-04-15", 36.9, 64, 13, 116, 72, 99, "Sports injury, ankle"),
    V(6, "2026-09-02", 39.2, 118, 21, 110, 68, 96, "High fever", "Suspected dengue, platelets ordered.", "2026-10-16"),
    V(7, "2026-01-25", 36.4, 72, 15, 146, 88, 97, "Knee pain", "Physio referral."),
    V(7, "2026-05-09", 36.6, 70, 15, 158, 96, 97, "BP high on screening", "Lifestyle + recheck."),
    V(8, "2026-04-02", 36.8, 88, 18, 138, 88, 95, "Snoring, daytime sleepiness", "Sleep study referral."),
    V(8, "2026-08-18", 36.9, 92, 19, 144, 92, 94, "Follow-up", "Weight loss plan discussed.", "2026-11-01"),
  ],
};
