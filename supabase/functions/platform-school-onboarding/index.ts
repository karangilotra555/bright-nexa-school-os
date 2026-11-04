/* Phase D2 school onboarding API. Deploy only after migration and isolated RLS tests.
   Service secret stays in Supabase Edge Function environment, never browser.
   Every request verifies Supabase Auth AND active platform admin membership. */
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const URL = Deno.env.get("SUPABASE_URL") || "";
function defaultKey(mapName:string,singleName:string,legacyName:string){
  try{
    const raw=Deno.env.get(mapName);
    if(raw){
      const parsed=JSON.parse(raw) as Record<string,string>;
      if(typeof parsed.default==="string" && parsed.default)return parsed.default;
    }
  }catch{/* malformed secret map must not expose secrets; fail closed below */}
  return Deno.env.get(singleName) || Deno.env.get(legacyName) || "";
}
const PRIVILEGED_KEY = defaultKey("SUPABASE_SECRET_KEYS","SUPABASE_SECRET_KEY","SUPABASE_SERVICE_ROLE_KEY");
const PUBLISHABLE_KEY = defaultKey("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_PUBLISHABLE_KEY","SUPABASE_ANON_KEY");
const SCHOOL_PORTAL = "https://bright-nexa-school-os.onrender.com/index.html";
const ALLOWED_ORIGINS = new Set([
 "https://bright-nexa-school-os.onrender.com",
 "https://karangilotra555.github.io"
]);
type OnboardingInput={
 action?:string; request_id?:string; request_key?:string;
 school_name?:string; owner_email?:string; contact_phone?:string|null; notes?:string|null
};
type Ready={invite_sent:boolean;owner_verified:boolean;institution_id:string|null;
 classes:number;teacher_accounts:number;teacher_assignments:number;ready:boolean};

const uuid=(x:unknown):x is string=>typeof x==="string"&&
 /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const tidy=(x:unknown)=>String(x??"").trim().replace(/\s+/g," ");
const normalizeEmail=(x:unknown)=>String(x??"").trim().toLowerCase();
function validate(raw:OnboardingInput){
 const school_name=tidy(raw.school_name),owner_email=normalizeEmail(raw.owner_email);
 const contact_phone=tidy(raw.contact_phone)||null,notes=tidy(raw.notes)||null;
 if(school_name.length<3||school_name.length>120)
   throw Error("School name must be 3–120 characters.");
 if(owner_email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner_email))
   throw Error("Enter a valid owner email.");
 if(contact_phone&&(!/^\+?[0-9 ()-]{7,20}$/.test(contact_phone)||
     contact_phone.replace(/\D/g,"").length<7))
   throw Error("Enter a valid contact number.");
 if(notes&&notes.length>300)throw Error("Notes exceed 300 characters.");
 if(!uuid(raw.request_key))throw Error("A unique request identifier is required.");
 return {school_name,owner_email,contact_phone,notes,request_key:raw.request_key};
}
function cors(origin:string|null){
 return {
   "content-type":"application/json; charset=utf-8",
   "cache-control":"no-store",
   "access-control-allow-origin":origin&&ALLOWED_ORIGINS.has(origin)?origin:"https://bright-nexa-school-os.onrender.com",
   "access-control-allow-methods":"POST, OPTIONS",
   "access-control-allow-headers":"authorization, apikey, content-type",
   "vary":"Origin"
 };
}
function reply(origin:string|null,data:unknown,status=200){
 return new Response(JSON.stringify(data),{status,headers:cors(origin)});
}
Deno.serve(async (req:Request)=>{
 const origin=req.headers.get("origin"),send=(data:unknown,status=200)=>reply(origin,data,status);
 if(origin&&!ALLOWED_ORIGINS.has(origin))return send({error:"Origin not allowed."},403);
 if(req.method==="OPTIONS")return send({ok:true});
 if(req.method!=="POST")return send({error:"Method not allowed."},405);
 if(!URL||!PRIVILEGED_KEY||!PUBLISHABLE_KEY)
   return send({error:"Onboarding server is not configured."},503);
 const match=/^Bearer (\S+)$/.exec(req.headers.get("authorization")||"");
 if(!match)return send({error:"Sign in as platform administrator."},401);
 let raw:OnboardingInput;
 try{
   const text=await req.text();
   if(text.length>8192)throw Error("Request is too large.");
   raw=JSON.parse(text) as OnboardingInput;
   if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error("Invalid request.");
 }catch{return send({error:"Invalid onboarding request."},400)}
 try{
   const auth=createClient(URL,PUBLISHABLE_KEY,{
     auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
   });
   const {data:verified,error:authErr}=await auth.auth.getUser(match[1]);
   if(authErr||!uuid(verified.user?.id)||verified.user?.is_anonymous)
     return send({error:"Verified platform session required."},401);
   const actor=verified.user.id;
   const admin=createClient(URL,PRIVILEGED_KEY,{
     auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
   });
   const {data:membership,error:membershipErr}=await admin.from("bn_platform_admins")
     .select("auth_user_id,active").eq("auth_user_id",actor).eq("active",true).maybeSingle();
   if(membershipErr||!membership||membership.auth_user_id!==actor||membership.active!==true)
     return send({error:"This account does not have active platform-admin authorization."},403);

   if(raw.action==="create"){
     let payload:ReturnType<typeof validate>;
     try{payload=validate(raw)}catch(e){return send({error:(e as Error).message},400)}
     const {data:created,error:createdErr}=await admin.from("bn_school_onboarding_requests")
       .insert({...payload,status:"draft",created_by:actor,updated_by:actor})
       .select("id,request_key,school_name,owner_email,status,institution_id,created_at")
       .single();
     if(createdErr){
       if(createdErr.code==="23505"){
         const {data:existing}=await admin.from("bn_school_onboarding_requests")
           .select("id,request_key,school_name,owner_email,status,institution_id")
           .eq("request_key",payload.request_key).maybeSingle();
         if(existing&&existing.school_name===payload.school_name&&existing.owner_email===payload.owner_email)
           return send({ok:true,id:existing.id,school_name:existing.school_name,
             owner_email:existing.owner_email,status:existing.status,reused:true});
         return send({error:"An existing onboarding already uses this email or request. Review it before proceeding."},409);
       }
       return send({error:"Cannot create onboarding request. Check staged migration and retry safely."},500);
     }
     const {error:auditErr}=await admin.from("bn_school_onboarding_events").insert({
       request_id:created.id,actor_id:actor,operation:"requested",note:"Approved platform administrator created draft"
     });
     if(auditErr)return send({ok:true,id:created.id,school_name:created.school_name,
       owner_email:created.owner_email,status:"draft",warning:"Request saved but audit log needs reconciliation."},201);
     return send({ok:true,id:created.id,school_name:created.school_name,
       owner_email:created.owner_email,status:"draft"},201);
   }

   if(!uuid(raw.request_id))return send({error:"Select a valid onboarding request."},400);
   const {data:row,error:rowErr}=await admin.from("bn_school_onboarding_requests")
      .select("*").eq("id",raw.request_id).maybeSingle();
   if(rowErr||!row)return send({error:"Onboarding request not found."},404);

   if(raw.action==="invite"){
     if(row.status!=="draft"||row.institution_id||row.owner_auth_user_id)
       return send({error:"Invitation already started or requires manual reconciliation. No duplicate email sent."},409);
     const {data:claimed,error:claimErr}=await admin.from("bn_school_onboarding_requests")
       .update({status:"inviting",updated_by:actor,updated_at:new Date().toISOString()})
       .eq("id",row.id).eq("status","draft")
       .select("id,status,owner_email,school_name").maybeSingle();
     if(claimErr||!claimed||claimed.status!=="inviting")
       return send({error:"Another administrator already started this invitation."},409);
     await admin.from("bn_school_onboarding_events").insert({
       request_id:row.id,actor_id:actor,operation:"invitation_started",note:"Explicit email invitation requested"
     });
     const {data:invitation,error:inviteErr}=await admin.auth.admin.inviteUserByEmail(row.owner_email,{
       redirectTo:SCHOOL_PORTAL
     });
     if(inviteErr||!uuid(invitation.user?.id)){
       await admin.from("bn_school_onboarding_requests").update({
         status:"needs_attention",updated_by:actor,updated_at:new Date().toISOString()
       }).eq("id",row.id).eq("status","inviting");
       await admin.from("bn_school_onboarding_events").insert({
         request_id:row.id,actor_id:actor,operation:"needs_attention",note:"Invitation provider failed; manual review required"
       });
       return send({error:"Invitation could not be confirmed. Review the request; automatic re-send is disabled."},422);
     }
     const {data:provisioned,error:provisionErr}=await admin.rpc("bn_complete_school_invitation",{
       p_request_id:row.id,p_owner_id:invitation.user.id,p_actor_id:actor,p_owner_email:row.owner_email
     });
     if(provisionErr||!uuid(provisioned)){
       await admin.from("bn_school_onboarding_requests").update({
         status:"needs_attention",updated_by:actor,updated_at:new Date().toISOString()
       }).eq("id",row.id).eq("status","inviting");
       await admin.from("bn_school_onboarding_events").insert({
         request_id:row.id,actor_id:actor,operation:"needs_attention",note:"Auth invitation sent but trial-school provisioning failed; reconcile manually"
       });
       return send({error:"Invitation may have been sent, but school creation needs manual reconciliation. Do not resend."},409);
     }
     return send({ok:true,id:row.id,status:"invited",institution_id:provisioned,
       next:"Owner must accept email invite, set password, add classes, invite teacher and assign a class."});
   }

   if(raw.action==="check"||raw.action==="activate"){
     if(row.status!=="invited"&&row.status!=="activated")
       return send({error:"Onboarding is not invited or needs manual review."},409);
     if(!uuid(row.institution_id)||!uuid(row.owner_auth_user_id))
       return send({error:"Missing school or owner identity; manual reconciliation required."},409);
     const {data:owner,error:ownerErr}=await admin.auth.admin.getUserById(row.owner_auth_user_id);
     if(ownerErr||!owner.user||normalizeEmail(owner.user.email)!==row.owner_email)
       return send({error:"Invited owner identity mismatch. Contact platform support."},409);
     const verified=Boolean(owner.user.email_confirmed_at);
     if(verified&&!row.owner_verified_at&&row.status==="invited"){
       const {data:marked,error:markErr}=await admin.from("bn_school_onboarding_requests")
         .update({owner_verified_at:new Date().toISOString(),updated_by:actor,updated_at:new Date().toISOString()})
         .eq("id",row.id).eq("status","invited").is("owner_verified_at",null)
         .select("id,owner_verified_at").maybeSingle();
       if(markErr)return send({error:"Owner verification is valid but progress could not be saved."},500);
       if(marked)await admin.from("bn_school_onboarding_events").insert({
         request_id:row.id,actor_id:actor,operation:"owner_verified",note:"Supabase Auth confirmed invited owner email"
       });
     }
     const {data:counts,error:countsErr}=await admin.rpc("bn_onboarding_readiness",{
       p_request_id:row.id,p_actor_id:actor
     });
     if(countsErr||!counts)return send({error:"Cannot verify real school classes and staff assignments."},500);
     const readiness=counts as Ready;
     if(raw.action==="check")return send({ok:true,id:row.id,status:row.status,...readiness});
     if(row.status==="activated")
       return send({error:"This school was already activated; no repeat activation."},409);
     if(!verified||!readiness.ready)
       return send({error:"Activation blocked: owner email, class and active teacher assignment must all be verified.",readiness},409);
     const {data:schoolId,error:activationErr}=await admin.rpc("bn_activate_invited_school",{
       p_request_id:row.id,p_actor_id:actor
     });
     if(activationErr||schoolId!==row.institution_id)
       return send({error:"Activation was not confirmed. Refresh and reconcile before trying again."},409);
     return send({ok:true,id:row.id,status:"activated",institution_id:schoolId});
   }
   return send({error:"Unsupported onboarding action."},400);
 }catch{
   return send({error:"Onboarding service failed. Review current status before retrying."},500);
 }
});
