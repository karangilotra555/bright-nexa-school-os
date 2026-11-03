-- Exact balances must include every permitted ledger entry, not only the first 500/1000 REST rows.
-- security_invoker=true ensures parent/staff RLS on school_fee_entries also applies here.
CREATE VIEW public.school_fee_balances WITH (security_invoker=true) AS
SELECT institution_id,student_id,
       COALESCE(SUM(CASE WHEN kind='charge' THEN amount_rupees ELSE -amount_rupees END),0) AS balance_rupees,
       COUNT(*) AS entry_count
FROM public.school_fee_entries
GROUP BY institution_id,student_id;
REVOKE ALL PRIVILEGES ON public.school_fee_balances FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.school_fee_balances TO authenticated;
