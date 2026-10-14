import { describe, expect, it } from "vitest";
import { diffClinic } from "./api";
import { SEED } from "./clinic";

describe("diffClinic", () => {
  it("adding one visit sends one createVisit call", () => {
    const v = { ...SEED.visits[0]!, date: "2026-10-01" };
    const ops = diffClinic(SEED, { ...SEED, visits: [...SEED.visits, v] });
    expect(ops).toEqual([{ kind: "createVisit", visit: v }]);
  });

  it("deleting a patient sends one deletePatient call", () => {
    const next = { patients: SEED.patients.filter((p) => p.id !== 3), visits: SEED.visits.filter((v) => v.patientId !== 3) };
    expect(diffClinic(SEED, next)).toEqual([{ kind: "deletePatient", id: 3 }]);
  });

  it("clearing a patient's visits sends clearVisits", () => {
    const next = { ...SEED, visits: SEED.visits.filter((v) => v.patientId !== 2) };
    expect(diffClinic(SEED, next)).toEqual([{ kind: "clearVisits", id: 2 }]);
  });

  it("replacing everything becomes a single bulk replace", () => {
    const next = { patients: [], visits: [] };
    expect(diffClinic(SEED, next)).toEqual([{ kind: "replace", clinic: next }]);
  });
});
