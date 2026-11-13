import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/integrations/supabase/types";
import type { Clinic, ClinicVisit, Patient } from "@/lib/clinic";
import type { Medication, Soap } from "@/lib/ehr";
import type { StaffRole } from "@/lib/roles";

type PatientRow = Tables<"clinic_patients">;
type VisitRow = Tables<"clinic_visits">;
export type QueueRow = Tables<"clinic_queue">;
export type AuditRow = Tables<"clinic_audit_logs">;
export type ProfileRow = Tables<"profiles">;
export type RoleRow = Tables<"user_roles">;

export function patientFromRow(row: PatientRow): Patient {
  return {
    id: row.id,
    name: row.name,
    age: row.age,
    sex: row.sex as Patient["sex"],
    heightCm: Number(row.height_cm),
    weightKg: Number(row.weight_kg),
    contact: row.contact,
    bloodGroup: row.blood_group,
    allergies: row.allergies,
    conditions: row.conditions,
    emergencyContact: row.emergency_contact,
    registeredAt: row.registered_at,
    abha: row.abha ?? undefined,
  };
}

export function visitFromRow(row: VisitRow): ClinicVisit {
  return {
    patientId: row.patient_id,
    date: row.date,
    temp: Number(row.temp),
    hr: row.hr,
    rr: row.rr,
    sbp: row.sbp,
    dbp: row.dbp,
    spo2: row.spo2,
    complaint: row.complaint ?? undefined,
    note: row.note ?? undefined,
    nextFollowUp: row.next_follow_up ?? undefined,
    soap: row.soap as Soap | undefined,
    meds: row.meds as Medication[],
    allergyOverride: row.allergy_override,
  };
}

export function patientToRow(patient: Patient) {
  return {
    id: patient.id,
    name: patient.name,
    age: patient.age,
    sex: patient.sex,
    height_cm: patient.heightCm,
    weight_kg: patient.weightKg,
    contact: patient.contact,
    blood_group: patient.bloodGroup,
    allergies: patient.allergies,
    conditions: patient.conditions,
    emergency_contact: patient.emergencyContact,
    registered_at: patient.registeredAt,
    abha: patient.abha ?? null,
  };
}

export function visitToRow(visit: ClinicVisit) {
  return {
    patient_id: visit.patientId,
    date: visit.date,
    temp: visit.temp,
    hr: visit.hr,
    rr: visit.rr,
    sbp: visit.sbp,
    dbp: visit.dbp,
    spo2: visit.spo2,
    complaint: visit.complaint ?? null,
    note: visit.note ?? null,
    next_follow_up: visit.nextFollowUp ?? null,
    soap: visit.soap ?? null,
    meds: visit.meds ?? [],
    allergy_override: visit.allergyOverride ?? false,
  };
}

export function clinicFromRows(patients: PatientRow[], visits: VisitRow[]): Clinic {
  return {
    patients: patients.map(patientFromRow),
    visits: visits.map(visitFromRow).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export async function loadCloudClinic(client: SupabaseClient<Database>, role: StaffRole): Promise<Clinic> {
  const { data: patientRows, error: patientError } = await client
    .from("clinic_patients")
    .select("*")
    .order("id", { ascending: true });
  if (patientError) throw patientError;

  if (role === "receptionist") return clinicFromRows(patientRows ?? [], []);

  const { data: visitRows, error: visitError } = await client
    .from("clinic_visits")
    .select("*")
    .order("date", { ascending: true });
  if (visitError) throw visitError;
  return clinicFromRows(patientRows ?? [], visitRows ?? []);
}

export async function saveCloudClinic(
  client: SupabaseClient<Database>,
  previous: Clinic,
  next: Clinic,
  role: StaffRole,
): Promise<void> {
  const prevPatientIds = new Set(previous.patients.map((p) => p.id));
  const nextPatientIds = new Set(next.patients.map((p) => p.id));
  const nextPatients = new Map(next.patients.map((p) => [p.id, p]));
  const patientDiff = previous.patients.filter((p) => {
    const replacement = nextPatients.get(p.id);
    return replacement && JSON.stringify(p) !== JSON.stringify(replacement);
  });
  const patientDiffIds = new Set(patientDiff.map((p) => p.id));
  const addedPatients = next.patients.filter((p) => !prevPatientIds.has(p.id));
  const removedPatients = previous.patients.filter((p) => !nextPatientIds.has(p.id));

  const visitKey = (visit: ClinicVisit) => [visit.patientId, visit.date, visit.temp, visit.hr, visit.rr, visit.sbp, visit.dbp, visit.spo2, visit.complaint ?? "", visit.note ?? ""].join("|");
  const previousVisitKeys = new Set(previous.visits.map(visitKey));
  const nextVisitKeys = new Set(next.visits.map(visitKey));
  const removedVisits = previous.visits.filter((v) => !nextVisitKeys.has(visitKey(v)) && nextPatientIds.has(v.patientId));
  const clearedPatientIds = [...new Set(removedVisits.map((v) => v.patientId))];
  const visitsNeedReplace = clearedPatientIds.some((id) => next.visits.some((v) => v.patientId === id));
  const addedVisits = next.visits.filter((v) => !previousVisitKeys.has(visitKey(v)));
  const replaceAll = patientDiff.length > 0 || visitsNeedReplace || addedPatients.length + removedPatients.length + clearedPatientIds.length + addedVisits.length > 5;

  if (replaceAll) {
    if (role !== "admin") throw new Error("Only a clinic administrator may import or replace the full ledger.");
    const { error } = await client.rpc("replace_clinic", {
      p_patients: next.patients.map((p) => patientToRow(p)),
      p_visits: next.visits.map((v) => visitToRow(v)),
    });
    if (error) throw error;
    return;
  }

  for (const patient of addedPatients) {
    const { error } = await client.from("clinic_patients").insert(patientToRow(patient));
    if (error) throw error;
  }
  for (const patient of removedPatients) {
    if (role !== "admin") throw new Error("Only a clinic administrator may delete a patient record.");
    const { error } = await client.from("clinic_patients").delete().eq("id", patient.id);
    if (error) throw error;
  }
  for (const id of clearedPatientIds) {
    if (role !== "admin") throw new Error("Only a clinic administrator may remove visit history.");
    const { error } = await client.from("clinic_visits").delete().eq("patient_id", id);
    if (error) throw error;
  }
  for (const visit of addedVisits) {
    const { error } = await client.from("clinic_visits").insert(visitToRow(visit));
    if (error) throw error;
  }

  if (patientDiffIds.size > 0) throw new Error("Patient profile editing is not available in this workflow.");
}

export function asRole(value: string): StaffRole | null {
  return value === "receptionist" || value === "nurse" || value === "doctor" || value === "admin" ? value : null;
}