// Client for the Express + MongoDB backend (backend/). Enabled when VITE_API_URL is set.
import type { Clinic, ClinicVisit, Patient } from "./clinic";

export const API_URL: string = (import.meta.env["VITE_API_URL"] as string | undefined)?.replace(/\/$/, "") ?? "";
export const apiEnabled = API_URL.length > 0;

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

const clean = (v: ClinicVisit & { _id?: string }): ClinicVisit => {
  const { _id, ...rest } = v;
  return rest;
};

export const api = {
  getClinic: async (): Promise<Clinic> => {
    const c = await req<{ patients: Patient[]; visits: (ClinicVisit & { _id?: string })[] }>("/api/clinic");
    return { patients: c.patients, visits: c.visits.map(clean) };
  },
  replaceClinic: (c: Clinic) => req("/api/clinic", { method: "PUT", body: JSON.stringify(c) }),
  createPatient: (p: Patient) => req<Patient>("/api/patients", { method: "POST", body: JSON.stringify(p) }),
  deletePatient: (id: number) => req(`/api/patients/${id}`, { method: "DELETE" }),
  clearVisits: (id: number) => req(`/api/patients/${id}/visits`, { method: "DELETE" }),
  createVisit: (v: ClinicVisit) => req("/api/visits", { method: "POST", body: JSON.stringify(v) }),
};

const visitKey = (v: ClinicVisit) => [v.patientId, v.date, v.temp, v.hr, v.rr, v.sbp, v.dbp, v.spo2, v.complaint ?? "", v.note ?? ""].join("|");

export type SyncOp =
  | { kind: "replace"; clinic: Clinic }
  | { kind: "createPatient"; patient: Patient }
  | { kind: "deletePatient"; id: number }
  | { kind: "clearVisits"; id: number }
  | { kind: "createVisit"; visit: ClinicVisit };

/** Turns a state change into the smallest set of REST calls. Large changes become one bulk replace. */
export function diffClinic(prev: Clinic, next: Clinic): SyncOp[] {
  const prevIds = new Set(prev.patients.map((p) => p.id));
  const nextIds = new Set(next.patients.map((p) => p.id));
  const ops: SyncOp[] = [];
  for (const p of next.patients) if (!prevIds.has(p.id)) ops.push({ kind: "createPatient", patient: p });
  for (const p of prev.patients) if (!nextIds.has(p.id)) ops.push({ kind: "deletePatient", id: p.id });

  const prevKeys = new Set(prev.visits.map(visitKey));
  const nextKeys = new Set(next.visits.map(visitKey));
  const removed = prev.visits.filter((v) => !nextKeys.has(visitKey(v)) && nextIds.has(v.patientId));
  const cleared = [...new Set(removed.map((v) => v.patientId))];
  for (const id of cleared) {
    if (next.visits.some((v) => v.patientId === id)) return [{ kind: "replace", clinic: next }];
    ops.push({ kind: "clearVisits", id });
  }
  for (const v of next.visits) if (!prevKeys.has(visitKey(v))) ops.push({ kind: "createVisit", visit: v });

  const changedProfile = next.patients.some((p) => {
    const old = prev.patients.find((x) => x.id === p.id);
    return old && JSON.stringify(old) !== JSON.stringify(p);
  });
  if (changedProfile || ops.length > 5) return [{ kind: "replace", clinic: next }];
  return ops;
}

export async function runOps(ops: SyncOp[]) {
  for (const op of ops) {
    if (op.kind === "replace") await api.replaceClinic(op.clinic);
    else if (op.kind === "createPatient") await api.createPatient(op.patient);
    else if (op.kind === "deletePatient") await api.deletePatient(op.id);
    else if (op.kind === "clearVisits") await api.clearVisits(op.id);
    else await api.createVisit(op.visit);
  }
}
