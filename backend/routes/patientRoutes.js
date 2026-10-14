import { Router } from "express";
import Patient from "../models/Patient.js";
import Visit from "../models/Visit.js";

const router = Router();
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// GET /api/patients?q=&page=1&limit=20
router.get("/", wrap(async (req, res) => {
  const q = String(req.query.q || "").trim();
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const filter = q
    ? { $or: [{ name: new RegExp(escape(q), "i") }, { contact: new RegExp(escape(q), "i") }, ...(Number(q) ? [{ id: Number(q) }] : [])] }
    : {};
  const [items, total] = await Promise.all([
    Patient.find(filter).sort({ id: 1 }).skip((page - 1) * limit).limit(limit),
    Patient.countDocuments(filter),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}));

// GET /api/patients/:id → profile + full visit history
router.get("/:id", wrap(async (req, res) => {
  const patient = await Patient.findOne({ id: Number(req.params.id) });
  if (!patient) return res.status(404).json({ error: "Patient not found" });
  const visits = await Visit.find({ patientId: patient.id }).sort({ date: 1 });
  res.json({ patient, visits });
}));

// POST /api/patients → register (id auto-assigned when omitted)
router.post("/", wrap(async (req, res) => {
  const body = { ...req.body };
  if (!body.id) {
    const last = await Patient.findOne().sort({ id: -1 });
    body.id = (last?.id || 0) + 1;
  }
  const patient = await Patient.create(body);
  res.status(201).json(patient);
}));

// PUT /api/patients/:id → update profile
router.put("/:id", wrap(async (req, res) => {
  const { id, ...update } = req.body;
  const patient = await Patient.findOneAndUpdate({ id: Number(req.params.id) }, update, { new: true, runValidators: true });
  if (!patient) return res.status(404).json({ error: "Patient not found" });
  res.json(patient);
}));

// DELETE /api/patients/:id → patient + all visits
router.delete("/:id", wrap(async (req, res) => {
  const id = Number(req.params.id);
  const { deletedCount } = await Patient.deleteOne({ id });
  if (!deletedCount) return res.status(404).json({ error: "Patient not found" });
  const visits = await Visit.deleteMany({ patientId: id });
  res.json({ deleted: id, visitsDeleted: visits.deletedCount });
}));

// DELETE /api/patients/:id/visits → clear history, keep profile
router.delete("/:id/visits", wrap(async (req, res) => {
  const { deletedCount } = await Visit.deleteMany({ patientId: Number(req.params.id) });
  res.json({ visitsDeleted: deletedCount });
}));

export default router;
