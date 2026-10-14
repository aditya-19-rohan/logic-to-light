import mongoose from "mongoose";
import { RANGES } from "../lib/clinical.js";

// Each vital is bounded by the same physiological limits as the original Python assignment.
const vital = (key, label) => ({
  type: Number,
  required: [true, `${label} is required`],
  min: [RANGES[key][0], `${label} must be between ${RANGES[key][0]} and ${RANGES[key][1]}`],
  max: [RANGES[key][1], `${label} must be between ${RANGES[key][0]} and ${RANGES[key][1]}`],
});

const visitSchema = new mongoose.Schema(
  {
    patientId: { type: Number, required: true, index: true },
    date: { type: String, required: true, match: [/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"] },
    temp: vital("temp", "Temperature"),
    hr: vital("hr", "Heart rate"),
    rr: vital("rr", "Respiratory rate"),
    sbp: vital("sbp", "Systolic BP"),
    dbp: vital("dbp", "Diastolic BP"),
    spo2: vital("spo2", "SpO2"),
    complaint: { type: String, trim: true, maxlength: 300 },
    note: { type: String, trim: true, maxlength: 1000 },
    nextFollowUp: { type: String },
  },
  { timestamps: true, versionKey: false },
);

visitSchema.index({ patientId: 1, date: 1 });

visitSchema.set("toJSON", {
  transform: (_doc, ret) => {
    ret._id = String(ret._id);
    delete ret.createdAt;
    delete ret.updatedAt;
    return ret;
  },
});

export default mongoose.model("Visit", visitSchema);
