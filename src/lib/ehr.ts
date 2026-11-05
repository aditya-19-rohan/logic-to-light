// Consultation rules: ABHA IDs, prescriptions, drug-allergy checks and reminders.
// Mirrored in backend/lib/clinical.js — keep both in sync.

export type Medication = { drug: string; dose: string; frequency: string; days: number; instructions?: string | undefined };
export type Soap = { s: string; o: string; a: string; p: string };

/** ABHA number: 14 digits, shown as XX-XXXX-XXXX-XXXX. */
export function formatAbha(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 14);
  return [d.slice(0, 2), d.slice(2, 6), d.slice(6, 10), d.slice(10, 14)].filter(Boolean).join("-");
}
export function isValidAbha(v: string): boolean {
  return /^\d{2}-\d{4}-\d{4}-\d{4}$/.test(v);
}

export const MED_PRESETS: Medication[] = [
  { drug: "Paracetamol", dose: "500 mg", frequency: "1-1-1", days: 3, instructions: "After food" },
  { drug: "Amoxicillin", dose: "500 mg", frequency: "1-1-1", days: 5, instructions: "Complete the course" },
  { drug: "Ibuprofen", dose: "400 mg", frequency: "1-0-1", days: 3, instructions: "After food" },
  { drug: "Cetirizine", dose: "10 mg", frequency: "0-0-1", days: 5 },
  { drug: "Metformin", dose: "500 mg", frequency: "1-0-1", days: 30, instructions: "With meals" },
  { drug: "Amlodipine", dose: "5 mg", frequency: "1-0-0", days: 30 },
  { drug: "Co-trimoxazole", dose: "960 mg", frequency: "1-0-1", days: 5 },
];

// Allergy keyword → drugs that cross-react.
const ALLERGY_CLASSES: { allergy: RegExp; label: string; drugs: RegExp }[] = [
  { allergy: /penicillin|beta.?lactam|amoxi/i, label: "Penicillin / beta-lactam", drugs: /penicillin|amoxicillin|ampicillin|cloxacillin|augmentin|cef/i },
  { allergy: /sulfa|sulpha|sulfonamide/i, label: "Sulfonamide", drugs: /sulfa|sulpha|co-?trimoxazole|bactrim|septran/i },
  { allergy: /nsaid|aspirin|ibuprofen/i, label: "NSAID", drugs: /ibuprofen|aspirin|diclofenac|naproxen|ketorolac/i },
];

/** Returns one warning per prescribed drug that clashes with the patient's recorded allergies. */
export function allergyConflicts(allergies: string, meds: Pick<Medication, "drug">[]): string[] {
  if (!allergies || /^none$/i.test(allergies.trim())) return [];
  const out: string[] = [];
  for (const m of meds) {
    for (const c of ALLERGY_CLASSES) {
      if (c.allergy.test(allergies) && c.drugs.test(m.drug)) out.push(`${m.drug} — patient is allergic to ${c.label}`);
    }
    if (m.drug && allergies.toLowerCase().includes(m.drug.toLowerCase()) && !out.some((o) => o.startsWith(m.drug)))
      out.push(`${m.drug} — listed in patient allergies`);
  }
  return out;
}

export function whatsappLink(phone: string, name: string, date?: string, meds: Medication[] = []): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10) digits = `91${digits}`;
  const lines = [
    `Hello ${name}, this is a reminder from Vitals Ledger Clinic.`,
    date ? `Your follow-up visit is on ${date}.` : "Please book your follow-up visit.",
    meds.length ? `Medicines: ${meds.map((m) => `${m.drug} ${m.dose} (${m.frequency}) x ${m.days}d`).join(", ")}.` : "",
    "Come in sooner if you have breathlessness, chest pain, high fever or confusion.",
  ].filter(Boolean);
  return `https://wa.me/${digits}?text=${encodeURIComponent(lines.join("\n"))}`;
}

export const medsToText = (m: Medication[] = []) => m.map((x) => [x.drug, x.dose, x.frequency, x.days, x.instructions ?? ""].join(" | ")).join("; ");
export function medsFromText(t: string): Medication[] {
  return t.split(";").map((s) => s.split("|").map((x) => x.trim())).filter((p) => p[0])
    .map(([drug = "", dose = "", frequency = "", days = "0", instructions = ""]) => ({ drug, dose, frequency, days: Number(days) || 0, instructions: instructions || undefined }));
}
