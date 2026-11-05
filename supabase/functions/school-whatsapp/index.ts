declare const EdgeRuntime: {waitUntil(task:Promise<unknown>):void};
import { createService } from './service.mjs';
Deno.serve(createService({url:Deno.env.get('SUPABASE_URL')!,serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,anonKey:Deno.env.get('SUPABASE_ANON_KEY')!,waitUntil:(task:Promise<unknown>)=>EdgeRuntime.waitUntil(task)}));
