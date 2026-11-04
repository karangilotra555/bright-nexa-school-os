-- Phase B1: owner-only exam plans and custom grade policies in existing audited module table.
-- Does not create results, public marks or message delivery. NO PRODUCTION APPLICATION in draft.
BEGIN;
ALTER TABLE public.school_module_records
  DROP CONSTRAINT school_module_records_module_check;
ALTER TABLE public.school_module_records
  ADD CONSTRAINT school_module_records_module_check
  CHECK (module = ANY (ARRAY[
    'transport','assets','expenses','exams','parent_messages',
    'opportunities','achievements','contacts','exam_plans','grading_schemes'
  ]::text[]));
-- Exam plan scope and identity are required. Details are also validated by the JS domain layer.
ALTER TABLE public.school_module_records
  ADD CONSTRAINT bn_exam_plan_shape_check CHECK (
    module <> 'exam_plans' OR
      (details ?& ARRAY['class_id','academic_year','exam','subject','maximum','scheduled_on','starts_at','duration_minutes','status']
       AND jsonb_typeof(details->'class_id')='string'
       AND jsonb_typeof(details->'exam')='string'
       AND jsonb_typeof(details->'subject')='string'
       AND jsonb_typeof(details->'maximum')='number'
       AND (details->>'maximum')::numeric BETWEEN 1 AND 1000
       AND jsonb_typeof(details->'duration_minutes')='number'
       AND (details->>'duration_minutes')::numeric BETWEEN 15 AND 360
       AND details->>'status' IN ('draft','scheduled'))
  );
ALTER TABLE public.school_module_records
  ADD CONSTRAINT bn_grading_scheme_shape_check CHECK (
    module <> 'grading_schemes' OR
    (details ?& ARRAY['academic_year','name','bands']
      AND jsonb_typeof(details->'academic_year')='string'
      AND jsonb_typeof(details->'name')='string'
      AND jsonb_typeof(details->'bands')='array'
      AND jsonb_array_length(details->'bands') BETWEEN 2 AND 16)
  );
-- Atomic uniqueness across simultaneous owner devices; no reliance on stale client-side checks.
CREATE UNIQUE INDEX IF NOT EXISTS bn_exam_plan_unique_subject
 ON public.school_module_records(
   institution_id,
   (details->>'class_id'),
   lower(btrim(details->>'exam')),
   lower(btrim(details->>'subject'))
 ) WHERE module='exam_plans';
CREATE UNIQUE INDEX IF NOT EXISTS bn_grading_scheme_unique_year
 ON public.school_module_records(institution_id,(details->>'academic_year'))
 WHERE module='grading_schemes';
COMMIT;
