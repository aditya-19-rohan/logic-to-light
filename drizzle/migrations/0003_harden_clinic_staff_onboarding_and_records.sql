ALTER TABLE public.clinic_visits
ADD COLUMN allergy_override BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.handle_new_staff_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_display_name TEXT;
BEGIN
  v_display_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data ->> 'display_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    split_part(COALESCE(NEW.email, ''), '@', 1)
  );
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, COALESCE(NEW.email, ''), v_display_name)
  ON CONFLICT (id) DO NOTHING;
  IF lower(COALESCE(NEW.email, '')) = 'aditya.rohan03.ar15@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_clinic_visit_meds()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_allergies TEXT;
  v_meds TEXT;
  v_conflict BOOLEAN := false;
BEGIN
  SELECT allergies INTO v_allergies FROM public.clinic_patients WHERE id = NEW.patient_id;
  v_meds := COALESCE(NEW.meds, '[]'::jsonb)::text;
  IF COALESCE(trim(v_allergies), '') <> '' AND lower(trim(v_allergies)) <> 'none' THEN
    v_conflict :=
      (v_allergies ~* '(penicillin|beta.?lactam|amoxi)' AND v_meds ~* '(penicillin|amoxicillin|ampicillin|cloxacillin|augmentin|cef)') OR
      (v_allergies ~* '(sulfa|sulpha|sulfonamide)' AND v_meds ~* '(sulfa|sulpha|co-?trimoxazole|bactrim|septran)') OR
      (v_allergies ~* '(nsaid|aspirin|ibuprofen)' AND v_meds ~* '(ibuprofen|aspirin|diclofenac|naproxen|ketorolac)') OR
      EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(NEW.meds, '[]'::jsonb)) AS med
        WHERE length(COALESCE(med ->> 'drug', '')) >= 3
          AND v_allergies ILIKE '%' || (med ->> 'drug') || '%'
      );
  END IF;
  IF v_conflict AND NOT NEW.allergy_override THEN
    RAISE EXCEPTION 'Prescription conflicts with the recorded patient allergies';
  END IF;
  IF NEW.allergy_override AND NOT (
    private.has_role(auth.uid(), 'doctor') OR private.has_role(auth.uid(), 'admin')
  ) THEN
    RAISE EXCEPTION 'Only a doctor or clinic administrator may override an allergy warning';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_clinic_visit_meds() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER validate_clinic_visit_meds
BEFORE INSERT OR UPDATE OF meds, allergy_override, patient_id ON public.clinic_visits
FOR EACH ROW EXECUTE FUNCTION public.validate_clinic_visit_meds();

CREATE OR REPLACE FUNCTION public.audit_clinic_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_action TEXT;
  v_entity_id TEXT;
  v_patient_id INTEGER;
  v_details JSONB;
  v_meds JSONB;
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
    IF TG_OP <> 'DELETE' THEN
      v_meds := COALESCE(NEW.meds, '[]'::jsonb);
      IF jsonb_array_length(v_meds) > 0 THEN
        INSERT INTO public.clinic_audit_logs(actor_id, action, entity_type, entity_id, details)
        VALUES (auth.uid(), 'RX_ISSUED', 'visit', v_entity_id, jsonb_build_object('patient_id', NEW.patient_id));
      END IF;
      IF NEW.allergy_override THEN
        INSERT INTO public.clinic_audit_logs(actor_id, action, entity_type, entity_id, details)
        VALUES (auth.uid(), 'ALLERGY_OVERRIDE', 'visit', v_entity_id, jsonb_build_object('patient_id', NEW.patient_id));
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'user_roles' THEN
    v_entity_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id::text ELSE NEW.user_id::text END;
    v_action := CASE WHEN TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.role <> NEW.role) THEN 'STAFF_ROLE_CHANGED' ELSE 'STAFF_ROLE_ASSIGNED' END;
    INSERT INTO public.clinic_audit_logs(actor_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), v_action, 'staff_member', v_entity_id,
      jsonb_build_object('old_role', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.role::text END,
                         'new_role', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.role::text END));
  ELSIF TG_TABLE_NAME = 'clinic_queue' THEN
    v_entity_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id::text ELSE NEW.id::text END;
    v_patient_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.patient_id ELSE NEW.patient_id END;
    v_details := jsonb_build_object(
      'patient_id', v_patient_id,
      'token', CASE WHEN TG_OP = 'DELETE' THEN OLD.token ELSE NEW.token END,
      'status', CASE WHEN TG_OP = 'DELETE' THEN OLD.status ELSE NEW.status END
    );
    v_action := CASE TG_OP WHEN 'INSERT' THEN 'QUEUE_CHECK_IN' WHEN 'UPDATE' THEN 'QUEUE_STATUS_CHANGED' ELSE 'QUEUE_ENTRY_REMOVED' END;
    INSERT INTO public.clinic_audit_logs(actor_id, action, entity_type, entity_id, details)
    VALUES (auth.uid(), v_action, 'queue', v_entity_id, v_details);
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_in_patient(p_patient_id INTEGER)
RETURNS public.clinic_queue
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_token INTEGER;
  v_entry public.clinic_queue;
BEGIN
  IF NOT (
    private.has_role(auth.uid(), 'receptionist') OR private.has_role(auth.uid(), 'nurse') OR
    private.has_role(auth.uid(), 'doctor') OR private.has_role(auth.uid(), 'admin')
  ) THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('vitals-ledger-queue:' || current_date::text, 0));
  SELECT * INTO v_entry
  FROM public.clinic_queue
  WHERE patient_id = p_patient_id AND queue_date = current_date AND status <> 'done'
  ORDER BY token DESC LIMIT 1;
  IF FOUND THEN
    RETURN v_entry;
  END IF;
  SELECT COALESCE(MAX(token), 0) + 1 INTO v_token
  FROM public.clinic_queue
  WHERE queue_date = current_date;
  INSERT INTO public.clinic_queue(token, patient_id, queue_date, status)
  VALUES (v_token, p_patient_id, current_date, 'waiting')
  RETURNING * INTO v_entry;
  RETURN v_entry;
END;
$$;
