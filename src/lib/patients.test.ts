import { describe, expect, it } from "vitest";
import { calculateAverageStats, findPatientsWhoNeedFollowUp, findVisitsByDate, parsePatientsText, validateVisit } from "./patients";

const base = { date: "2024-01-01", temp: 37, hr: 70, rr: 15, sbp: 120, dbp: 80, spo2: 98 };

describe("patient rules", () => {
  it("rejects temperature above 42", () => {
    expect(validateVisit({ ...base, temp: 42.5 })).toMatch(/temperature/);
  });
  it("accepts boundary values", () => {
    expect(validateVisit({ ...base, temp: 35, hr: 180, spo2: 70 })).toBeNull();
  });
  it("skips lines without 8 fields", () => {
    const r = parsePatientsText("1,2024-01-01,37,70,15,120,80\n2,2024-01-01,37,70,15,120,80,98");
    expect(Object.keys(r.patients)).toEqual(["2"]);
    expect(r.errors).toHaveLength(1);
  });
  it("flags follow-up when hr > 100", () => {
    expect(findPatientsWhoNeedFollowUp({ 1: [base], 2: [{ ...base, hr: 101 }] })).toEqual([2]);
  });
  it("averages visits", () => {
    expect(calculateAverageStats({ 1: [base, { ...base, hr: 90 }] })?.hr).toBe(80);
  });
  it("filters by month with any year", () => {
    expect(findVisitsByDate({ 1: [base, { ...base, date: "2023-05-02" }] }, undefined, 5)).toHaveLength(1);
  });
});
