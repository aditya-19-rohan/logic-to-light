CREATE TABLE public.clinic_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token INTEGER NOT NULL CHECK (token > 0),
  patient_id INTEGER NOT NULL REFERENCES public.clinic_patients(id) ON DELETE CASCADE,
  queue_date DATE NOT NULL DEFAULT current_date,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'consult', 'done')),
  arrived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (queue_date, token)
);
CREATE INDEX clinic_queue_date_status_idx ON public.clinic_queue(queue_date, status, token);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_queue TO authenticated;
GRANT ALL ON public.clinic_queue TO service_role;
ALTER TABLE public.clinic_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY clinic_queue_read_staff ON public.clinic_queue
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'receptionist') OR public.has_role(auth.uid(), 'nurse') OR
  public.has_role(auth.uid(), 'doctor') OR public.has_role(auth.uid(), 'admin')
);
CREATE POLICY clinic_queue_insert_staff ON public.clinic_queue
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'receptionist') OR public.has_role(auth.uid(), 'nurse') OR
  public.has_role(auth.uid(), 'doctor') OR public.has_role(auth.uid(), 'admin')
);
CREATE POLICY clinic_queue_update_staff ON public.clinic_queue
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'receptionist') OR public.has_role(auth.uid(), 'nurse') OR
  public.has_role(auth.uid(), 'doctor') OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'receptionist') OR public.has_role(auth.uid(), 'nurse') OR
  public.has_role(auth.uid(), 'doctor') OR public.has_role(auth.uid(), 'admin')
);
CREATE POLICY clinic_queue_delete_admin ON public.clinic_queue
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

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
  v_details JSONB;
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

CREATE TRIGGER audit_clinic_queue
AFTER INSERT OR UPDATE OR DELETE ON public.clinic_queue
FOR EACH ROW EXECUTE FUNCTION public.audit_clinic_change();