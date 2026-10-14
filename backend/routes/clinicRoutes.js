import { Router } from "express";
import Patient from "../models/Patient.js";
import Visit from "../models/Visit.js";

const router = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// GET /api/clinic → full snapshot { patients, visits } used by the React app on load
router.get("/", wrap(async (_req, res) => {
  const [patients, visits] = await Promise.all([Patient.find().sort({ id: 1 }), Visit.find().sort({ date: 1 })]);
  res.json({ patients, visits });
}));

// PUT /api/clinic → bulk replace (Excel import / load sample data)
router.put("/", wrap(async (req, res) => {
  const { patients = [], visits = [] } = req.body || {};
  if (!Array.isArray(patients) || !Array.isArray(visits)) return res.status(400).json({ error: "patients and visits must be arrays" });
  // Validate everything before touching the database.
  await Promise.all([...patients.map((p) => new Patient(p).validate()), ...visits.map((v) => new Visit(v).validate())]);
  await Promise.all([Patient.deleteMany({}), Visit.deleteMany({})]);
  await Patient.insertMany(patients);
  await Visit.insertMany(visits);
  res.json({ patients: patients.length, visits: visits.length });
}));

export default router;
