import { describe, expect, it } from "vitest";
import { can } from "./roles";

describe("staff permissions", () => {
  it("lets reception staff register patients and manage the queue, not read visits or write clinical notes", () => {
    expect(can("receptionist", "register_patient")).toBe(true);
    expect(can("receptionist", "manage_queue")).toBe(true);
    expect(can("receptionist", "view_visits")).toBe(false);
    expect(can("receptionist", "record_vitals")).toBe(false);
    expect(can("receptionist", "write_soap")).toBe(false);
    expect(can("receptionist", "prescribe")).toBe(false);
  });

  it("lets triage staff record vitals but not author SOAP notes or prescriptions", () => {
    expect(can("nurse", "record_vitals")).toBe(true);
    expect(can("nurse", "view_visits")).toBe(true);
    expect(can("nurse", "write_soap")).toBe(false);
    expect(can("nurse", "prescribe")).toBe(false);
  });

  it("lets doctors prescribe and export but reserves audit and role management for admins", () => {
    expect(can("doctor", "prescribe")).toBe(true);
    expect(can("doctor", "export_data")).toBe(true);
    expect(can("doctor", "view_audit")).toBe(false);
    expect(can("doctor", "manage_staff")).toBe(false);
  });

  it("reserves audit access and bulk imports for administrators", () => {
    expect(can("admin", "view_audit")).toBe(true);
    expect(can("admin", "manage_staff")).toBe(true);
    expect(can("admin", "import_data")).toBe(true);
    expect(can("doctor", "import_data")).toBe(false);
  });
});
