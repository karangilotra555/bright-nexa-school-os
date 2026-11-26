import { createService } from './service.mjs';

Deno.serve(createService({
  url: Deno.env.get('SUPABASE_URL') || '',
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  anonKey: Deno.env.get('SUPABASE_ANON_KEY') || '',
  operatorEmails: Deno.env.get('BN_PLATFORM_OPERATOR_EMAILS') || ''
}));
