import { describe, expect, it } from "vitest";
import { bmi, bmiClass, bpStage, news2, followUpReasons, toWorkbook, fromWorkbook, SEED } from "./clinic";
import * as XLSX from "xlsx";

const ok = { date: "2026-01-01", temp: 37, hr: 70, rr: 15, sbp: 120, dbp: 80, spo2: 98 };

describe("clinical scores", () => {
  it("BMI 170cm/72kg is ~24.9 Normal", () => {
    const v = bmi({ heightCm: 170, weightKg: 72 });
    expect(v).toBeCloseTo(24.91, 1);
    expect(bmiClass(v)).toBe("Normal");
  });
  it("BMI 30 is Obese", () => expect(bmiClass(30)).toBe("Obese"));
  it("BP 140/85 is Stage 2", () => expect(bpStage(140, 85)).toBe("Stage 2"));
  it("BP 125/75 is Elevated", () => expect(bpStage(125, 75)).toBe("Elevated"));
  it("BP 185/100 is Crisis", () => expect(bpStage(185, 100)).toBe("Crisis"));
  it("NEWS2 normal vitals score 0 Low", () => expect(news2(ok)).toMatchObject({ score: 0, risk: "Low" }));
  it("NEWS2 7+ is High", () => {
    expect(news2({ ...ok, rr: 26, spo2: 90, hr: 120 }).risk).toBe("High");
  });
  it("single parameter scoring 3 gives Medium", () => {
    expect(news2({ ...ok, spo2: 90 }).risk).toBe("Medium");
  });
  it("lists follow-up reasons using original thresholds", () => {
    expect(followUpReasons({ ...ok, temp: 38.1, dbp: 91 })).toEqual(["Fever", "Hypertension"]);
    expect(followUpReasons({ ...ok, temp: 38, hr: 100, rr: 20, sbp: 140, dbp: 90 })).toEqual([]);
  });
});

describe("excel round trip", () => {
  it("keeps all patients and visits", () => {
    const buf = XLSX.write(toWorkbook(SEED), { type: "array", bookType: "xlsx" });
    const { clinic, errors } = fromWorkbook(buf);
    expect(errors).toEqual([]);
    expect(clinic.patients).toHaveLength(SEED.patients.length);
    expect(clinic.visits).toHaveLength(SEED.visits.length);
  });
});
