CREATE TYPE public.staff_role AS ENUM ('receptionist', 'nurse', 'doctor', 'admin');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.staff_role NOT NULL DEFAULT 'receptionist',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.clinic_patients (
  id INTEGER PRIMARY KEY CHECK (id > 0),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  age INTEGER NOT NULL CHECK (age BETWEEN 0 AND 130),
  sex TEXT NOT NULL DEFAULT 'Other' CHECK (sex IN ('Male', 'Female', 'Other')),
  height_cm NUMERIC NOT NULL DEFAULT 0 CHECK (height_cm BETWEEN 0 AND 260),
  weight_kg NUMERIC NOT NULL DEFAULT 0 CHECK (weight_kg BETWEEN 0 AND 400),
  contact TEXT NOT NULL DEFAULT '',
  blood_group TEXT NOT NULL DEFAULT '',
  allergies TEXT NOT NULL DEFAULT '',
  conditions TEXT NOT NULL DEFAULT '',
  emergency_contact TEXT NOT NULL DEFAULT '',
  registered_at TEXT NOT NULL DEFAULT '',
  abha TEXT CHECK (abha IS NULL OR abha ~ '^\d{2}-\d{4}-\d{4}-\d{4}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_patients TO authenticated;
GRANT ALL ON public.clinic_patients TO service_role;
ALTER TABLE public.clinic_patients ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.clinic_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id INTEGER NOT NULL REFERENCES public.clinic_patients(id) ON DELETE CASCADE,
  date TEXT NOT NULL CHECK (date ~ '^\d{4}-\d{2}-\d{2}$'),
  temp NUMERIC NOT NULL CHECK (temp BETWEEN 35 AND 42),
  hr INTEGER NOT NULL CHECK (hr BETWEEN 30 AND 180),
  rr INTEGER NOT NULL CHECK (rr BETWEEN 5 AND 40),
  sbp INTEGER NOT NULL CHECK (sbp BETWEEN 70 AND 200),
  dbp INTEGER NOT NULL CHECK (dbp BETWEEN 40 AND 120),
  spo2 INTEGER NOT NULL CHECK (spo2 BETWEEN 70 AND 100),
  complaint TEXT CHECK (complaint IS NULL OR length(complaint) <= 300),
  note TEXT CHECK (note IS NULL OR length(note) <= 1000),
  next_follow_up TEXT,
  soap JSONB,
  meds JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(meds) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX clinic_visits_patient_date_idx ON public.clinic_visits(patient_id, date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_visits TO authenticated;
GRANT ALL ON public.clinic_visits TO service_role;
ALTER TABLE public.clinic_visits ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.clinic_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX clinic_audit_logs_created_at_idx ON public.clinic_audit_logs(created_at DESC);
GRANT SELECT ON public.clinic_audit_logs TO authenticated;
GRANT ALL ON public.clinic_audit_logs TO service_role;
ALTER TABLE public.clinic_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.staff_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
REVOKE ALL ON FUNCTION public.has_role(UUID, public.staff_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.staff_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.handle_new_staff_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_display_name TEXT;
  v_role public.staff_role;
BEGIN
  v_display_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data ->> 'display_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    split_part(COALESCE(NEW.email, ''), '@', 1)
  );
  v_role := CASE
    WHEN lower(COALESCE(NEW.email, '')) = 'aditya.rohan03.ar15@gmail.com' THEN 'admin'::public.staff_role
    ELSE 'receptionist'::public.staff_role
  END;
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, COALESCE(NEW.email, ''), v_display_name)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_staff_user() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_auth_user_created_staff
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_staff_user();

CREATE OR REPLACE FUNCTION public.prevent_last_admin_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.role = 'admin' AND (TG_OP = 'DELETE' OR NEW.role <> 'admin') THEN
    PERFORM pg_advisory_xact_lock(hashtext('vitals-ledger-admin-role'));
    IF (SELECT count(*) FROM public.user_roles WHERE role = 'admin') <= 1 THEN
      RAISE EXCEPTION 'The clinic must keep at least one administrator';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_last_admin_removal() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER protect_last_clinic_admin
BEFORE UPDATE OF role OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.prevent_last_admin_removal();

CREATE OR REPLACE FUNCTION public.audit_clinic_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_action TEXT;
  v_entity_id TEXT;
  v_patient_id INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'clinic_patients' THEN
    v_entity_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id::text ELSE NEW.id::text END;
    v_action := CASE TG_OP WHEN 'INSERT' THEN 'PATIENT_REGISTER' WHEN 'UPDATE' THEN 'PATIENT_UPDATE' ELSE 'PATIENT_DELETE' END;
    INSERT INTO public.clinic_audit_logs(actor_id, action, entity_type, entity_id)
    VALUES (auth.uid(), v_action, 'patient', v_entity_id);
  ELSIF TG_TABLE_NAME = 'clinic_visits' THEN
    v_patient_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.patient_id ELSE NEW.patient_id END;
    v_entity_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id::text ELSE NEW.id::text END;
    v_action := CASE TG_OP WHEN 'INSERT' THEN 'VISIT_RECORDED' WHEN 'UPDATE' THEN 'VISIT_UPDATED' ELSE 'VISIT_REMOVED' END;
    INSERT INTO public.clinic_audit_logs(actor_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), v_action, 'visit', v_entity_id, jsonb_build_object('patient_id', v_patient_id));
  ELSIF TG_TABLE_NAME = 'user_roles' THEN
    v_entity_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id::text ELSE NEW.user_id::text END;
    v_action := CASE WHEN TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.role <> NEW.role) THEN 'STAFF_ROLE_CHANGED' ELSE 'STAFF_ROLE_ASSIGNED' END;
    INSERT INTO public.clinic_audit_logs(actor_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), v_action, 'staff_member', v_entity_id,
      jsonb_build_object('old_role', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.role::text END,
                         'new_role', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.role::text END));
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_clinic_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER audit_clinic_patients
AFTER INSERT OR UPDATE OR DELETE ON public.clinic_patients
FOR EACH ROW EXECUTE FUNCTION public.audit_clinic_change();
CREATE TRIGGER audit_clinic_visits
AFTER INSERT OR UPDATE OR DELETE ON public.clinic_visits
FOR EACH ROW EXECUTE FUNCTION public.audit_clinic_change();
CREATE TRIGGER audit_clinic_roles
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.audit_clinic_change();

CREATE POLICY profiles_read_self_or_admin ON public.profiles
FOR SELECT TO authenticated
USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY profiles_insert_self ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (id = auth.uid());
CREATE POLICY profiles_update_self ON public.profiles
FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

CREATE POLICY user_roles_read_self_or_admin ON public.user_roles
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY user_roles_admin_insert ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY user_roles_admin_update ON public.user_roles
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY user_roles_admin_delete ON public.user_roles
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY clinic_patients_read_staff ON public.clinic_patients
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'receptionist') OR public.has_role(auth.uid(), 'nurse') OR
  public.has_role(auth.uid(), 'doctor') OR public.has_role(auth.uid(), 'admin')
);
CREATE POLICY clinic_patients_insert_staff ON public.clinic_patients
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'receptionist') OR public.has_role(auth.uid(), 'nurse') OR
  public.has_role(auth.uid(), 'doctor') OR public.has_role(auth.uid(), 'admin')
);
CREATE POLICY clinic_patients_update_staff ON public.clinic_patients
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'receptionist') OR public.has_role(auth.uid(), 'nurse') OR
  public.has_role(auth.uid(), 'doctor') OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'receptionist') OR public.has_role(auth.uid(), 'nurse') OR
  public.has_role(auth.uid(), 'doctor') OR public.has_role(auth.uid(), 'admin')
);
CREATE POLICY clinic_patients_delete_admin ON public.clinic_patients
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY clinic_visits_read_clinical_staff ON public.clinic_visits
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'doctor') OR public.has_role(auth.uid(), 'admin')
);
CREATE POLICY clinic_visits_insert_clinical_staff ON public.clinic_visits
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'doctor') OR public.has_role(auth.uid(), 'admin') OR
  (public.has_role(auth.uid(), 'nurse') AND soap IS NULL AND meds = '[]'::jsonb)
);
CREATE POLICY clinic_visits_update_doctor_admin ON public.clinic_visits
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'doctor') OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'doctor') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY clinic_visits_delete_admin ON public.clinic_visits
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY clinic_audit_read_admin ON public.clinic_audit_logs
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.replace_clinic(p_patients JSONB, p_visits JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only a clinic administrator may replace clinic records';
  END IF;
  DELETE FROM public.clinic_visits;
  DELETE FROM public.clinic_patients;
  INSERT INTO public.clinic_patients (id, name, age, sex, height_cm, weight_kg, contact, blood_group, allergies, conditions, emergency_contact, registered_at, abha)
  SELECT id, name, age, sex, height_cm, weight_kg, contact, blood_group, allergies, conditions, emergency_contact, registered_at, abha
  FROM jsonb_to_recordset(p_patients) AS x(id integer, name text, age integer, sex text, height_cm numeric, weight_kg numeric, contact text, blood_group text, allergies text, conditions text, emergency_contact text, registered_at text, abha text);
  INSERT INTO public.clinic_visits (patient_id, date, temp, hr, rr, sbp, dbp, spo2, complaint, note, next_follow_up, soap, meds)
  SELECT patient_id, date, temp, hr, rr, sbp, dbp, spo2, complaint, note, next_follow_up, soap, COALESCE(meds, '[]'::jsonb)
  FROM jsonb_to_recordset(p_visits) AS x(patient_id integer, date text, temp numeric, hr integer, rr integer, sbp integer, dbp integer, spo2 integer, complaint text, note text, next_follow_up text, soap jsonb, meds jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.replace_clinic(JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_clinic(JSONB, JSONB) TO authenticated;
