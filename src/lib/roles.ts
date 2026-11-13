export const STAFF_ROLES = ["receptionist", "nurse", "doctor", "admin"] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];
export type StaffAction =
  | "view_patients"
  | "view_visits"
  | "register_patient"
  | "manage_queue"
  | "record_vitals"
  | "write_soap"
  | "prescribe"
  | "print_rx"
  | "send_reminder"
  | "export_data"
  | "import_data"
  | "manage_staff"
  | "view_audit";

const ROLE_PERMISSIONS: Record<StaffRole, readonly StaffAction[]> = {
  receptionist: ["view_patients", "register_patient", "manage_queue", "print_rx", "send_reminder"],
  nurse: ["view_patients", "view_visits", "register_patient", "manage_queue", "record_vitals", "print_rx", "send_reminder"],
  doctor: ["view_patients", "view_visits", "register_patient", "manage_queue", "record_vitals", "write_soap", "prescribe", "print_rx", "send_reminder", "export_data"],
  admin: ["view_patients", "view_visits", "register_patient", "manage_queue", "record_vitals", "write_soap", "prescribe", "print_rx", "send_reminder", "export_data", "import_data", "manage_staff", "view_audit"],
};

export function can(role: StaffRole, action: StaffAction): boolean {
  return ROLE_PERMISSIONS[role].includes(action);
}

export const ROLE_LABELS: Record<StaffRole, string> = {
  receptionist: "Receptionist",
  nurse: "Nurse / Triage",
  doctor: "Doctor",
  admin: "Clinic Admin",
};