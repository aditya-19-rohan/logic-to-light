# Vitals Ledger — Clinical Records Workstation

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)
![Recharts](https://img.shields.io/badge/Recharts-charts-FF6384)
![Vitest](https://img.shields.io/badge/Vitest-tested-6E9F18?logo=vitest&logoColor=white)

A full-stack **MERN** electronic medical records dashboard. Clinic staff can register patients, record vital signs,
spot patients who are getting worse (**NEWS2** early-warning score), stage blood pressure (**AHA** categories), view
trends on charts and move data in and out of **Excel**.

**Live demo:** `https://<your-app>.vercel.app` · **API:** `https://<your-api>.onrender.com/api/health`

---

## Features

- **Overview dashboard**: visits per month, NEWS2 risk breakdown, BP staging, age/sex demographics, follow-up triggers.
- **Patient directory**: search by name, phone or ID. Profile with BMI, blood group, allergies, conditions, emergency contact and a vital-sign trend chart.
- **New intake**: register a patient and record vitals. Values outside safe limits are rejected on both the client and the server.
- **Follow-up triage**: patients with fever (> 38 °C), heart rate > 100, breathing rate > 20 or BP > 140/90, with one-tap call links.
- **Excel data hub**: export/import a two-sheet workbook (`Patients` + `Visits`) with row-by-row validation, plus a blank template.
- **Works offline**: when the API isn't reachable the app keeps a local copy in the browser.

## Architecture

```text
┌──────────────────────────┐   HTTPS / JSON   ┌───────────────────────────┐   Mongoose   ┌──────────────────┐
│ React 19 + TanStack      │ ───────────────► │ Node.js + Express REST API │ ───────────► │ MongoDB Atlas    │
│ Recharts · SheetJS       │ ◄─────────────── │ validation · aggregation   │ ◄─────────── │ patients, visits │
│ (Vercel)                 │                  │ (Render)                   │              │ (free M0 cluster)│
└──────────────────────────┘                  └───────────────────────────┘              └──────────────────┘
```

```text
.
├── src/                    React frontend
│   ├── routes/index.tsx    Dashboard UI (overview, directory, intake, triage, Excel hub)
│   ├── components/clinic/  Recharts visualisations
│   └── lib/
│       ├── patients.ts     Vital ranges + follow-up rules (port of the original Python assignment)
│       ├── clinic.ts       NEWS2, AHA BP staging, BMI, Excel import/export
│       └── api.ts          REST client + change-to-request sync
└── backend/                Express API
    ├── server.js           App bootstrap, CORS, error handling, DB connection
    ├── models/             Patient + Visit Mongoose schemas
    ├── routes/             patients, visits, analytics, clinic (bulk)
    ├── lib/clinical.js     Server-side clinical rules
    └── seed.js             Demo data loader
```

### Data model (one patient → many visits)

| Collection | Key fields |
|---|---|
| `patients` | `id` (unique), `name`, `age`, `sex`, `heightCm`, `weightKg`, `contact`, `bloodGroup`, `allergies`, `conditions`, `emergencyContact`, `registeredAt` |
| `visits` | `patientId` (indexed), `date` (YYYY-MM-DD), `temp`, `hr`, `rr`, `sbp`, `dbp`, `spo2`, `complaint`, `note`, `nextFollowUp` |

Vital limits enforced by the server: temperature 35–42 °C, heart rate 30–180, respiratory rate 5–40, systolic 70–200, diastolic 40–120, SpO₂ 70–100 %.

---

## REST API

Base URL: `http://localhost:5000` (local) or your Render URL.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Server + database status |
| GET | `/api/patients?q=&page=&limit=` | Search and paginate patients |
| GET | `/api/patients/:id` | Patient profile + visit history |
| POST | `/api/patients` | Register a patient (`id` auto-assigned if omitted) |
| PUT | `/api/patients/:id` | Update a profile |
| DELETE | `/api/patients/:id` | Delete a patient and all their visits |
| DELETE | `/api/patients/:id/visits` | Delete all visits of a patient |
| GET | `/api/visits?patientId=&year=&month=` | List visits, filter by patient and date |
| GET | `/api/visits/follow-up` | Visits that need follow-up, with reasons + NEWS2 |
| POST | `/api/visits` | Record a visit (vitals validated) |
| DELETE | `/api/visits/:visitId` | Delete one visit |
| GET | `/api/analytics/overview` | KPIs, NEWS2 risk, BP stages, monthly visits, averages |
| GET | `/api/clinic` | Full snapshot `{ patients, visits }` |
| PUT | `/api/clinic` | Bulk replace (Excel import) — validates everything first |

**Example — record a visit**

```http
POST /api/visits
Content-Type: application/json

{ "patientId": 1, "date": "2026-10-14", "temp": 38.6, "hr": 108, "rr": 22, "sbp": 132, "dbp": 84, "spo2": 95, "complaint": "Fever" }
```

```json
{
  "_id": "6710c2…", "patientId": 1, "date": "2026-10-14", "temp": 38.6, "hr": 108, "rr": 22,
  "sbp": 132, "dbp": 84, "spo2": 95, "complaint": "Fever",
  "reasons": ["Fever", "Tachycardia", "Tachypnoea"],
  "news2": { "score": 5, "risk": "Medium" }
}
```

Errors return `{ "error": "message" }` with status `400` (invalid data), `404` (not found) or `409` (duplicate).

---

## Run locally (VS Code)

Requirements: [Node.js 18+](https://nodejs.org) and a free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster.

**1. Backend**

```bash
cd backend
npm install
cp .env.example .env        # paste your Atlas connection string into MONGODB_URI
npm run seed                # optional: load 8 demo patients
npm run dev                 # → http://localhost:5000/api/health
```

**2. Frontend** (second terminal, project root)

```bash
npm install
echo "VITE_API_URL=http://localhost:5000" > .env.local
npm run dev                 # → http://localhost:8080
```

The sidebar shows **MongoDB · live** when connected. Without `VITE_API_URL` the app runs on browser storage only.

**Tests:** `npm test`

---

## Deploy for free

**MongoDB Atlas**
1. Create a free M0 cluster → *Database Access*: add a user → *Network Access*: allow `0.0.0.0/0`.
2. *Connect → Drivers*: copy the connection string.

**Backend on Render**
1. New → *Web Service* → connect your GitHub repo.
2. Root directory `backend`, build `npm install`, start `npm start`.
3. Environment: `MONGODB_URI=<atlas string>`, `CORS_ORIGIN=https://<your-app>.vercel.app`.
4. Open `https://<your-api>.onrender.com/api/health`. (Free instances sleep after inactivity; the first request takes ~30 s.)

**Frontend on Vercel**
1. *Add New Project* → import the same repo (root directory = project root).
2. Environment variable: `VITE_API_URL=https://<your-api>.onrender.com`.
3. Deploy, then put the Vercel URL into Render's `CORS_ORIGIN`.

---

## Background

Started as a Python internship assignment ("Creating an Information System for Electronic Medical Records"): read
patient visits, validate vitals, compute averages, search by date and flag follow-ups. Those rules were ported
unchanged and extended with NEWS2, AHA BP staging, BMI, Excel I/O and a MongoDB backend.
