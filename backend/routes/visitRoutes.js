import { Router } from "express";
import Patient from "../models/Patient.js";
import Visit from "../models/Visit.js";
import { followUpReasons, news2 } from "../lib/clinical.js";

const router = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// GET /api/visits?patientId=&year=&month=  (port of findVisitsByDate)
router.get("/", wrap(async (req, res) => {
  const filter = {};
  if (req.query.patientId) filter.patientId = Number(req.query.patientId);
  const { year, month } = req.query;
  if (year || month) {
    const y = year ? String(year).padStart(4, "0") : "\\d{4}";
    const m = month ? String(month).padStart(2, "0") : "\\d{2}";
    filter.date = new RegExp(`^${y}-${m}-`);
  }
  res.json(await Visit.find(filter).sort({ date: 1 }));
}));

// GET /api/visits/follow-up → visits that breach the follow-up thresholds
router.get("/follow-up", wrap(async (_req, res) => {
  const visits = await Visit.find({
    $or: [{ temp: { $gt: 38 } }, { hr: { $gt: 100 } }, { rr: { $gt: 20 } }, { sbp: { $gt: 140 } }, { dbp: { $gt: 90 } }],
  }).sort({ date: -1 });
  res.json(visits.map((v) => ({ ...v.toJSON(), reasons: followUpReasons(v), news2: news2(v) })));
}));

// POST /api/visits → record a visit (Mongoose enforces vital ranges)
router.post("/", wrap(async (req, res) => {
  const exists = await Patient.exists({ id: Number(req.body.patientId) });
  if (!exists) return res.status(404).json({ error: `Patient ${req.body.patientId} not found` });
  const visit = await Visit.create(req.body);
  res.status(201).json({ ...visit.toJSON(), reasons: followUpReasons(visit), news2: news2(visit) });
}));

// DELETE /api/visits/:visitId
router.delete("/:visitId", wrap(async (req, res) => {
  const { deletedCount } = await Visit.deleteOne({ _id: req.params.visitId });
  if (!deletedCount) return res.status(404).json({ error: "Visit not found" });
  res.json({ deleted: req.params.visitId });
}));

export default router;
