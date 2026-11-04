-- Phase D1 staged ONLY. SaaS platform console: non-PII tenant overview, subscription labels,
-- and immutable event trail. Never enroll an owner as platform admin from a browser.
-- Subscription labels do NOT change institutions.status, restrict features, collect payments,
-- or suspend a school. Provision platform admins manually after separate identity checks.
BEGIN;

CREATE TABLE IF NOT EXISTS public.bn_platform_admins (
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT false,
  granted_at timestamptz NOT NULL DEFAULT now(),
  note text CHECK (note IS NULL OR char_length(note)<=240)
);
ALTER TABLE public.bn_platform_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bn_platform_admins FROM anon,authenticated;
GRANT SELECT ON TABLE public.bn_platform_admins TO authenticated;
CREATE POLICY bn_platform_self_read ON public.bn_platform_admins
 FOR SELECT TO authenticated
 USING (auth_user_id=(select auth.uid()));
-- There is deliberately no INSERT/UPDATE/DELETE grant or policy for an API user.

CREATE TABLE IF NOT EXISTS public.bn_saas_plans (
  code text PRIMARY KEY CHECK(code ~ '^[a-z][a-z0-9_]{1,31}$'),
  name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 3 AND 70),
  description text NOT NULL CHECK(char_length(description)<=250),
  visible boolean NOT NULL DEFAULT true
);
ALTER TABLE public.bn_saas_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bn_saas_plans FROM anon,authenticated;
GRANT SELECT ON TABLE public.bn_saas_plans TO authenticated;
CREATE POLICY bn_saas_plans_platform_read ON public.bn_saas_plans
 FOR SELECT TO authenticated
 USING (EXISTS (
   SELECT 1 FROM public.bn_platform_admins a
   WHERE a.auth_user_id=(select auth.uid()) AND a.active
 ));
-- Catalog metadata ONLY. No prices or unenforced capacity limits.
INSERT INTO public.bn_saas_plans(code,name,description) VALUES
 ('pilot','Pilot','Controlled school onboarding; billing is not connected.'),
 ('standard','Standard','Administrative plan label; no product limits are enforced yet.'),
 ('custom','Custom','Manually reviewed commercial proposal; no payments are collected.')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.bn_school_subscriptions (
  institution_id uuid PRIMARY KEY REFERENCES public.institutions(id) ON DELETE RESTRICT,
  plan_code text NOT NULL REFERENCES public.bn_saas_plans(code) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'trial'
    CHECK(status IN ('trial','active','paused','ended')),
  starts_on date NOT NULL DEFAULT current_date,
  ends_on date CHECK(ends_on IS NULL OR ends_on>=starts_on),
  admin_note text CHECK(admin_note IS NULL OR char_length(admin_note)<=300),
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bn_school_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bn_school_subscriptions FROM anon,authenticated;
GRANT SELECT,INSERT ON TABLE public.bn_school_subscriptions TO authenticated;
GRANT UPDATE(plan_code,status,starts_on,ends_on,admin_note,updated_by,updated_at)
 ON TABLE public.bn_school_subscriptions TO authenticated;

CREATE POLICY bn_subscriptions_read ON public.bn_school_subscriptions
 FOR SELECT TO authenticated
 USING (
  EXISTS (SELECT 1 FROM public.bn_platform_admins a
     WHERE a.auth_user_id=(select auth.uid()) AND a.active)
  OR school_private.has_role(institution_id, ARRAY['school_admin'::text])
 );
CREATE POLICY bn_subscriptions_platform_insert ON public.bn_school_subscriptions
 FOR INSERT TO authenticated
 WITH CHECK (
  EXISTS (SELECT 1 FROM public.bn_platform_admins a
    WHERE a.auth_user_id=(select auth.uid()) AND a.active)
  AND updated_by=(select auth.uid())
 );
CREATE POLICY bn_subscriptions_platform_update ON public.bn_school_subscriptions
 FOR UPDATE TO authenticated
 USING (
  EXISTS (SELECT 1 FROM public.bn_platform_admins a
    WHERE a.auth_user_id=(select auth.uid()) AND a.active)
 )
 WITH CHECK (
  EXISTS (SELECT 1 FROM public.bn_platform_admins a
    WHERE a.auth_user_id=(select auth.uid()) AND a.active)
  AND updated_by=(select auth.uid())
 );

-- A platform admin can list institution NAME, ID and operational status only.
-- This does not grant access to school_students, fees, addresses, teachers or parent records.
CREATE POLICY bn_platform_institutions_read ON public.institutions
 FOR SELECT TO authenticated
 USING (EXISTS (
   SELECT 1 FROM public.bn_platform_admins a
   WHERE a.auth_user_id=(select auth.uid()) AND a.active
 ));

CREATE TABLE IF NOT EXISTS public.bn_subscription_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,
  operation text NOT NULL CHECK(operation IN ('created','changed')),
  old_plan text,
  new_plan text NOT NULL,
  old_status text,
  new_status text NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bn_subscription_events_school_date
 ON public.bn_subscription_events(institution_id,recorded_at DESC);
ALTER TABLE public.bn_subscription_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.bn_subscription_events FROM anon,authenticated;
GRANT SELECT ON TABLE public.bn_subscription_events TO authenticated;
CREATE POLICY bn_subscription_events_platform_read ON public.bn_subscription_events
 FOR SELECT TO authenticated
 USING (EXISTS (
   SELECT 1 FROM public.bn_platform_admins a
   WHERE a.auth_user_id=(select auth.uid()) AND a.active
 ));

-- Trigger-only logger in non-exposed schema. Not exposed as a public RPC.
CREATE FUNCTION school_private.bn_subscription_event_guard()
 RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = pg_catalog, public, school_private
 AS $fn$
BEGIN
 IF (select auth.uid()) IS NULL
    OR NEW.updated_by IS DISTINCT FROM (select auth.uid())
    OR NOT EXISTS(
      SELECT 1 FROM public.bn_platform_admins a
      WHERE a.auth_user_id=(select auth.uid()) AND a.active
    ) THEN
   RAISE EXCEPTION 'Verified platform administrator required' USING ERRCODE='42501';
 END IF;
 IF TG_OP='INSERT' THEN
   INSERT INTO public.bn_subscription_events
    (institution_id,operation,old_plan,new_plan,old_status,new_status,actor_id)
   VALUES (NEW.institution_id,'created',NULL,NEW.plan_code,NULL,NEW.status,(select auth.uid()));
 ELSE
   INSERT INTO public.bn_subscription_events
    (institution_id,operation,old_plan,new_plan,old_status,new_status,actor_id)
   VALUES (NEW.institution_id,'changed',OLD.plan_code,NEW.plan_code,OLD.status,NEW.status,(select auth.uid()));
 END IF;
 RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION school_private.bn_subscription_event_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER bn_subscription_event_write
 AFTER INSERT OR UPDATE ON public.bn_school_subscriptions
 FOR EACH ROW EXECUTE FUNCTION school_private.bn_subscription_event_guard();

COMMIT;
