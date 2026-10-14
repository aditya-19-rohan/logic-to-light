import mongoose from "mongoose";

const patientSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true, min: 1 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    age: { type: Number, required: true, min: 0, max: 130 },
    sex: { type: String, enum: ["Male", "Female", "Other"], default: "Other" },
    heightCm: { type: Number, min: 0, max: 260, default: 0 },
    weightKg: { type: Number, min: 0, max: 400, default: 0 },
    contact: { type: String, trim: true, maxlength: 40, default: "" },
    bloodGroup: { type: String, trim: true, maxlength: 4, default: "" },
    allergies: { type: String, trim: true, maxlength: 300, default: "" },
    conditions: { type: String, trim: true, maxlength: 300, default: "" },
    emergencyContact: { type: String, trim: true, maxlength: 120, default: "" },
    registeredAt: { type: String, default: () => new Date().toISOString().slice(0, 10) },
  },
  { timestamps: true, versionKey: false },
);

patientSchema.index({ name: "text", contact: "text" });

// Hide Mongo internals so the API returns the same shape the React app uses.
patientSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret._id;
    delete ret.createdAt;
    delete ret.updatedAt;
    return ret;
  },
});

export default mongoose.model("Patient", patientSchema);
