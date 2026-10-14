import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import patientRoutes from "./routes/patientRoutes.js";
import visitRoutes from "./routes/visitRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import clinicRoutes from "./routes/clinicRoutes.js";

const app = express();
const PORT = process.env.PORT || 5000;
const origins = (process.env.CORS_ORIGIN || "*").split(",").map((s) => s.trim());

app.use(cors({ origin: origins.includes("*") ? true : origins }));
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) =>
  res.json({ status: "ok", db: mongoose.connection.readyState === 1 ? "connected" : "disconnected" }),
);
app.use("/api/patients", patientRoutes);
app.use("/api/visits", visitRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/clinic", clinicRoutes);

app.use((_req, res) => res.status(404).json({ error: "Route not found" }));

// Centralised error handler: Mongoose validation → 400, duplicates → 409, everything else → 500.
app.use((err, _req, res, _next) => {
  if (err.name === "ValidationError") {
    return res.status(400).json({ error: Object.values(err.errors).map((e) => e.message).join("; ") });
  }
  if (err.code === 11000) return res.status(409).json({ error: "Duplicate record", key: err.keyValue });
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

if (!process.env.MONGODB_URI) {
  console.error("Missing MONGODB_URI. Copy .env.example to .env and add your Atlas connection string.");
  process.exit(1);
}

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected");
    app.listen(PORT, () => console.log(`Vitals Ledger API listening on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  });
