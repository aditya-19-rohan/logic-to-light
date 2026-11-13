CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated;
ALTER FUNCTION public.has_role(UUID, public.staff_role) SET SCHEMA private;
CREATE OR REPLACE FUNCTION private.has_role(_user_id UUID, _role public.staff_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT _user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = _role
  )
$$;
REVOKE ALL ON FUNCTION private.has_role(UUID, public.staff_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(UUID, public.staff_role) TO authenticated, service_role;

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
  SELECT COALESCE(MAX(token), 0) + 1 INTO v_token
  FROM public.clinic_queue
  WHERE queue_date = current_date;
  INSERT INTO public.clinic_queue(token, patient_id, queue_date, status)
  VALUES (v_token, p_patient_id, current_date, 'waiting')
  RETURNING * INTO v_entry;
  RETURN v_entry;
END;
$$;
REVOKE ALL ON FUNCTION public.check_in_patient(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_in_patient(INTEGER) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'clinic_queue'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.clinic_queue;
  END IF;
END;
$$;