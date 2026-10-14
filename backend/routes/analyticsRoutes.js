import { Router } from "express";
import Patient from "../models/Patient.js";
import Visit from "../models/Visit.js";
import { bpStage, followUpReasons, news2 } from "../lib/clinical.js";

const router = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// GET /api/analytics/overview → KPIs + chart data computed in MongoDB
router.get("/overview", wrap(async (_req, res) => {
  const [patients, totalVisits, latest, monthly, averages] = await Promise.all([
    Patient.countDocuments(),
    Visit.countDocuments(),
    // Latest visit per patient
    Visit.aggregate([{ $sort: { date: -1 } }, { $group: { _id: "$patientId", v: { $first: "$$ROOT" } } }, { $replaceWith: "$v" }]),
    // Visits per month
    Visit.aggregate([
      { $group: { _id: { $substrBytes: ["$date", 0, 7] }, visits: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, month: "$_id", visits: 1 } },
    ]),
    // Cohort averages (port of displayStats)
    Visit.aggregate([
      { $group: { _id: null, temp: { $avg: "$temp" }, hr: { $avg: "$hr" }, rr: { $avg: "$rr" }, sbp: { $avg: "$sbp" }, dbp: { $avg: "$dbp" }, spo2: { $avg: "$spo2" } } },
      { $project: { _id: 0 } },
    ]),
  ]);

  const risk = { Low: 0, Medium: 0, High: 0 };
  const bp = { Normal: 0, Elevated: 0, "Stage 1": 0, "Stage 2": 0, Crisis: 0 };
  let flaggedPatients = 0;
  for (const v of latest) {
    risk[news2(v).risk]++;
    bp[bpStage(v.sbp, v.dbp)]++;
    if (followUpReasons(v).length) flaggedPatients++;
  }

  res.json({ patients, totalVisits, flaggedPatients, risk, bpStages: bp, monthly, averages: averages[0] || null });
}));

export default router;
