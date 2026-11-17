-- Apply once after deploying school-teacher-period-alerts. Set matching
-- teacher_period_scheduler_secret and school_project_url in Supabase Vault.
-- Never store either production secret in this file.
select cron.schedule('bright-nexa-teacher-period-alerts','* * * * *',$job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='school_project_url')
      || '/functions/v1/school-teacher-period-alerts',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-scheduler-secret',(select decrypted_secret from vault.decrypted_secrets where name='teacher_period_scheduler_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
  where (select count(*) from vault.decrypted_secrets where name in ('school_project_url','teacher_period_scheduler_secret'))=2;
$job$);
