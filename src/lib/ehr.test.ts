import { describe, expect, it } from "vitest";
import { allergyConflicts, formatAbha, isValidAbha, medsFromText, medsToText, whatsappLink } from "./ehr";
// @ts-expect-error plain JS backend module
import { allergyConflicts as serverConflicts } from "../../backend/lib/clinical.js";

describe("ABHA", () => {
  it("formats 14 digits as XX-XXXX-XXXX-XXXX", () => expect(formatAbha("91482177301956")).toBe("91-4821-7730-1956"));
  it("accepts a complete formatted ABHA ID", () => expect(isValidAbha("91-4821-7730-1956")).toBe(true));
  it("rejects 13 digits", () => expect(isValidAbha(formatAbha("9148217730195"))).toBe(false));
  it("rejects an ABHA ID with letters", () => expect(isValidAbha("91-AB21-7730-1956")).toBe(false));
});

describe("drug-allergy check", () => {
  it("penicillin allergy blocks amoxicillin", () => expect(allergyConflicts("Penicillin", [{ drug: "Amoxicillin" }])).toHaveLength(1));
  it("sulfa allergy blocks co-trimoxazole", () => expect(allergyConflicts("Sulfa drugs", [{ drug: "Co-trimoxazole" }])).toHaveLength(1));
  it("paracetamol is fine with penicillin allergy", () => expect(allergyConflicts("Penicillin", [{ drug: "Paracetamol" }])).toEqual([]));
  it("server agrees with client", () => expect(serverConflicts("Aspirin", [{ drug: "Ibuprofen" }])).toEqual(allergyConflicts("Aspirin", [{ drug: "Ibuprofen" }])));
});

it("10-digit phone gets India code in WhatsApp link", () => expect(whatsappLink("98201 44721", "A")).toMatch(/^https:\/\/wa\.me\/919820144721\?/));
it("meds round-trip through Excel text", () => {
  const m = [{ drug: "Paracetamol", dose: "500 mg", frequency: "1-1-1", days: 3, instructions: "After food" }];
  expect(medsFromText(medsToText(m))).toEqual(m);
});
