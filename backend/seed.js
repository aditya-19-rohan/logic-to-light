// Seeds MongoDB Atlas with demo patients and visits:  npm run seed
import "dotenv/config";
import mongoose from "mongoose";
import Patient from "./models/Patient.js";
import Visit from "./models/Visit.js";

const P = (id, name, age, sex, heightCm, weightKg, contact, bloodGroup, allergies, conditions, emergencyContact, registeredAt) =>
  ({ id, name, age, sex, heightCm, weightKg, contact, bloodGroup, allergies, conditions, emergencyContact, registeredAt });
const V = (patientId, date, temp, hr, rr, sbp, dbp, spo2, complaint, note, nextFollowUp) =>
  ({ patientId, date, temp, hr, rr, sbp, dbp, spo2, complaint, note, nextFollowUp });

const patients = [
  P(1, "Ananya Sharma", 34, "Female", 162, 58, "+91 98201 44721", "B+", "Penicillin", "Asthma", "Rohit Sharma · +91 98201 11002", "2025-11-04"),
  P(2, "Rahul Mehta", 58, "Male", 175, 91, "+91 99300 18265", "O+", "None", "Type 2 Diabetes, Hypertension", "Kavita Mehta · +91 99300 18200", "2025-10-12"),
  P(3, "Fatima Khan", 27, "Female", 158, 49, "+91 90040 66310", "A-", "Peanuts", "None", "Imran Khan · +91 90040 66000", "2026-01-18"),
  P(4, "Vikram Iyer", 71, "Male", 168, 77, "+91 98450 22931", "AB+", "Sulfa drugs", "COPD", "Lakshmi Iyer · +91 98450 22000", "2025-09-02"),
  P(5, "Meera Nair", 45, "Female", 165, 82, "+91 97450 55120", "O-", "None", "Hypothyroidism", "Arjun Nair · +91 97450 55100", "2026-02-21"),
  P(6, "Arjun Das", 19, "Male", 181, 70, "+91 83370 10294", "B-", "Dust", "None", "Sunita Das · +91 83370 10200", "2026-03-09"),
  P(7, "Sneha Patil", 63, "Female", 155, 66, "+91 98220 70113", "A+", "Latex", "Osteoarthritis", "Nikhil Patil · +91 98220 70100", "2025-12-15"),
  P(8, "Karan Singh", 39, "Male", 178, 104, "+91 98110 39478", "O+", "None", "Sleep apnoea", "Preeti Singh · +91 98110 39400", "2026-04-02"),
];

const visits = [
  V(1, "2026-03-02", 36.8, 78, 16, 118, 76, 98, "Wheezing at night", "Inhaler technique reviewed."),
  V(1, "2026-05-14", 38.4, 104, 22, 124, 80, 95, "Fever, cough", "Likely viral bronchitis. Review in 1 week.", "2026-10-20"),
  V(1, "2026-08-30", 37.0, 82, 17, 120, 78, 97, "Routine check"),
  V(2, "2026-01-10", 36.7, 84, 16, 148, 94, 97, "BP review", "Started amlodipine 5mg."),
  V(2, "2026-04-22", 36.9, 80, 16, 142, 90, 97, "BP review", "Partial response, increase dose."),
  V(2, "2026-07-19", 36.6, 76, 15, 136, 86, 98, "BP review", "Improving.", "2026-10-10"),
  V(3, "2026-02-03", 36.6, 70, 14, 108, 70, 99, "Registration check-up"),
  V(3, "2026-06-11", 37.2, 74, 15, 112, 72, 99, "Mild headache"),
  V(4, "2025-12-20", 37.4, 96, 22, 138, 84, 92, "Breathlessness", "COPD exacerbation, steroids started."),
  V(4, "2026-03-28", 38.9, 112, 26, 152, 92, 90, "Productive cough, fever", "Chest infection. Antibiotics. Urgent review.", "2026-10-15"),
  V(4, "2026-07-05", 37.1, 92, 20, 140, 86, 93, "Follow-up", "Stable, still hypoxic at rest."),
  V(5, "2026-03-01", 36.5, 68, 14, 128, 82, 98, "Fatigue", "TSH ordered."),
  V(5, "2026-06-30", 36.6, 66, 14, 126, 80, 98, "Thyroid review"),
  V(6, "2026-04-15", 36.9, 64, 13, 116, 72, 99, "Sports injury, ankle"),
  V(6, "2026-09-02", 39.2, 118, 21, 110, 68, 96, "High fever", "Suspected dengue, platelets ordered.", "2026-10-16"),
  V(7, "2026-01-25", 36.4, 72, 15, 146, 88, 97, "Knee pain", "Physio referral."),
  V(7, "2026-05-09", 36.6, 70, 15, 158, 96, 97, "BP high on screening", "Lifestyle + recheck."),
  V(8, "2026-04-02", 36.8, 88, 18, 138, 88, 95, "Snoring, daytime sleepiness", "Sleep study referral."),
  V(8, "2026-08-18", 36.9, 92, 19, 144, 92, 94, "Follow-up", "Weight loss plan discussed.", "2026-11-01"),
];

await mongoose.connect(process.env.MONGODB_URI);
await Promise.all([Patient.deleteMany({}), Visit.deleteMany({})]);
await Patient.insertMany(patients);
await Visit.insertMany(visits);
console.log(`Seeded ${patients.length} patients and ${visits.length} visits.`);
await mongoose.disconnect();
