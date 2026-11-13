CREATE SEQUENCE public.clinic_patient_id_seq START WITH 1 INCREMENT BY 1 NO CYCLE;
ALTER SEQUENCE public.clinic_patient_id_seq OWNED BY public.clinic_patients.id;
ALTER TABLE public.clinic_patients ALTER COLUMN id SET DEFAULT nextval('public.clinic_patient_id_seq');
GRANT USAGE, SELECT ON SEQUENCE public.clinic_patient_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.clinic_patient_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.register_patient(
  p_name TEXT,
  p_age INTEGER,
  p_sex TEXT,
  p_height_cm NUMERIC,
  p_weight_kg NUMERIC,
  p_contact TEXT,
  p_blood_group TEXT,
  p_allergies TEXT,
  p_conditions TEXT,
  p_emergency_contact TEXT,
  p_registered_at TEXT,
  p_abha TEXT
)
RETURNS public.clinic_patients
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_patient public.clinic_patients;
BEGIN
  IF NOT (
    private.has_role(auth.uid(), 'receptionist') OR private.has_role(auth.uid(), 'nurse') OR
    private.has_role(auth.uid(), 'doctor') OR private.has_role(auth.uid(), 'admin')
  ) THEN
    RAISE EXCEPTION 'Staff access required';
  END IF;
  INSERT INTO public.clinic_patients (name, age, sex, height_cm, weight_kg, contact, blood_group, allergies, conditions, emergency_contact, registered_at, abha)
  VALUES (p_name, p_age, p_sex, p_height_cm, p_weight_kg, p_contact, p_blood_group, p_allergies, p_conditions, p_emergency_contact, p_registered_at, p_abha)
  RETURNING * INTO v_patient;
  RETURN v_patient;
END;
$$;
REVOKE ALL ON FUNCTION public.register_patient(TEXT, INTEGER, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_patient(TEXT, INTEGER, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
