-- Exact school-wide fee totals from the full ledger, not a capped REST result set.
-- SECURITY INVOKER keeps the current authenticated actor's RLS effective.
CREATE FUNCTION public.school_fee_summary(p_institution uuid)
RETURNS TABLE(outstanding_rupees numeric,entry_count bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT COALESCE(SUM(CASE WHEN e.kind='charge' THEN e.amount_rupees ELSE -e.amount_rupees END),0),
         COUNT(*)
  FROM public.school_fee_entries e
  WHERE e.institution_id=p_institution
    AND school_private.has_role(p_institution,ARRAY['school_admin','accountant']);
$$;
REVOKE ALL ON FUNCTION public.school_fee_summary(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.school_fee_summary(uuid) TO authenticated;
