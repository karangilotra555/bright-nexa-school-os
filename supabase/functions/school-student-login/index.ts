import { createClient } from 'npm:@supabase/supabase-js@2.57.0';
const URL=Deno.env.get('SUPABASE_URL')||'';
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const ANON=Deno.env.get('SUPABASE_ANON_KEY')||'';
const DEFAULT_SCHOOL='bc80e32d-485d-48a8-903a-92338aa61005';
const ALLOWED=new Set(['https://bright-nexa-school-os.onrender.com','https://karangilotra555.github.io']);
const mobile=(v:string)=>{let s=String(v||'').replace(/\D/g,'');if(s.length===12&&s.startsWith('91'))s=s.slice(2);return /^[6-9]\d{9}$/.test(s)?s:'';};
const digest=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(n=>n.toString(16).padStart(2,'0')).join('');
export function handler(create=createClient){return async(req:Request)=>{
 const origin=req.headers.get('origin');
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':origin&&ALLOWED.has(origin)?origin:'https://bright-nexa-school-os.onrender.com','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(origin&&!ALLOWED.has(origin))return reply({error:'Origin not allowed'},403);
 if(req.method==='OPTIONS')return reply({ok:true});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 if(!URL||!SERVICE||!ANON)return reply({error:'Login service unavailable'},503);
 try{
  if(Number(req.headers.get('content-length')||0)>4096)return reply({error:'Request too large'},413);
  const raw=await req.text();if(raw.length>4096)return reply({error:'Request too large'},413);
  const body=JSON.parse(raw);
  const admin=create(URL,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});
  const auth=create(URL,ANON,{auth:{persistSession:false,autoRefreshToken:false}});
  const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
  const {data:ipOK,error:ipError}=await admin.rpc('bn_parent_login_attempt',{p_bucket:await digest('ip:'+ip),p_limit:60});
  if(ipError)return reply({error:'Login service unavailable'},503);
  if(!ipOK)return reply({error:'Too many attempts. Try again after 15 minutes.'},429);
  async function student(id:string,school:string){
   const {data:s,error}=await admin.from('school_students').select('id,institution_id,admission_number,status').eq('id',id).eq('institution_id',school).eq('status','active').maybeSingle();
   if(error||!s)return null;
   const {data:i}=await admin.from('institutions').select('status').eq('id',school).maybeSingle();
   return i&&['active','trial'].includes(i.status)?s:null;
  }
  async function linkUser(user:any,s:any){
   const {data:existing,error:readError}=await admin.from('school_guardians').select('id,status').eq('institution_id',s.institution_id).eq('auth_user_id',user.id).maybeSingle();
   if(readError||existing?.status==='disabled')throw Error('School access is disabled. Contact the school office.');
   let guardian=existing;
   if(!guardian){const {data,error}=await admin.from('school_guardians').upsert({institution_id:s.institution_id,auth_user_id:user.id,email:user.email,status:'active'},{onConflict:'institution_id,auth_user_id'}).select('id').single();if(error)throw Error('Cannot link student account');guardian=data;}
   const {error}=await admin.from('school_guardian_students').upsert({institution_id:s.institution_id,guardian_id:guardian.id,student_id:s.id,relationship:'guardian'},{onConflict:'guardian_id,student_id'});
   if(error)throw Error('Cannot link student account');
  }

  // Student authentication uses synthetic .invalid Auth addresses; built-in
  // recovery mail cannot be sent to them. The SCHOOL-REGISTERED guardian email
  // receives a Supabase magic link proving control of that mailbox instead.
  // The verified guardian can then reset only that linked student's password.
  if(body.action==='request-reset'){
   const generic=()=>reply({message:'If this admission number has a registered guardian email, a secure link will be sent. Check Inbox and Spam.'});
   const admission=String(body.admissionNumber||'').trim();
   const school=String(body.schoolId||DEFAULT_SCHOOL);
   const email=String(body.guardianEmail||'').trim().toLowerCase();
   if(!/^[A-Za-z0-9][A-Za-z0-9/_-]{0,63}$/.test(admission)||!/^[-a-f0-9]{36}$/.test(school)||email.length>254||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return generic();
   // Dedicated throttle prevents repeated emails and account discovery.
   const {data:allowed,error:limitError}=await admin.rpc('bn_parent_login_attempt',{
     p_bucket:await digest('recovery:'+school+':'+admission.toLowerCase()),p_limit:3
   });
   if(limitError||!allowed)return generic();
   const {data:record}=await admin.from('school_students').select('id').eq('institution_id',school).eq('admission_number',admission).eq('status','active').maybeSingle();
   if(!record)return generic();
   const {data:profile}=await admin.from('school_student_profiles').select('guardian_email').eq('student_id',record.id).eq('institution_id',school).maybeSingle();
   if(!profile?.guardian_email||profile.guardian_email.trim().toLowerCase()!==email)return generic();
   const {error:sendError}=await auth.auth.signInWithOtp({email,options:{
     shouldCreateUser:true,
     emailRedirectTo:'https://bright-nexa-school-os.onrender.com/parent-password-recovery.html'
   }});
   if(sendError)console.warn('[StudentRecovery] Mail service rejected a reset-link request.');
   return generic();
  }
  if(body.action==='complete-reset'){
   const denied=()=>reply({error:'Recovery link is invalid or expired, or this email is not registered for the student. Contact the school office.'},403);
   const jwt=(req.headers.get('authorization')||'').replace(/^Bearer /,'').trim();
   if(!jwt)return denied();
   const {data:verified,error:verifyError}=await auth.auth.getUser(jwt);
   const guardian=verified?.user;
   if(verifyError||!guardian||!guardian.email||!guardian.email_confirmed_at||guardian.is_anonymous)return denied();
   const school=String(body.schoolId||DEFAULT_SCHOOL),admission=String(body.admissionNumber||'').trim();
   const newPassword=String(body.newPassword||'');
   if(!/^[-a-f0-9]{36}$/.test(school)||!/^[A-Za-z0-9][A-Za-z0-9/_-]{0,63}$/.test(admission))return denied();
   if(newPassword.length<12||newPassword.length>128||!/[a-z]/i.test(newPassword)||!/[0-9]/.test(newPassword))
     return reply({error:'Use a strong new password: 12–128 characters including letters and digits.'},400);
   const {data:record}=await admin.from('school_students').select('id,institution_id').eq('institution_id',school).eq('admission_number',admission).eq('status','active').maybeSingle();
   if(!record)return denied();
   const {data:profile}=await admin.from('school_student_profiles').select('guardian_email,guardian_phone').eq('student_id',record.id).eq('institution_id',school).maybeSingle();
   if(!profile?.guardian_email||profile.guardian_email.trim().toLowerCase()!==String(guardian.email).trim().toLowerCase())return denied();
   if(mobile(newPassword)&&mobile(newPassword)===mobile(profile.guardian_phone))return reply({error:'Choose a password different from the registered mobile number.'},400);
   // The student login identity is synthetic; look up its VERIFIED persisted
   // school link. Never search/alter accounts solely by a submitted email.
   const shadowEmail=(await digest('student:'+school+':'+record.id))+'@student.brightnexa.invalid';
   const {data:shadow}=await admin.from('school_guardians').select('auth_user_id').eq('institution_id',school).eq('email',shadowEmail).eq('status','active').maybeSingle();
   if(!shadow?.auth_user_id)return denied();
   const {data:existing,error:existingError}=await admin.auth.admin.getUserById(shadow.auth_user_id);
   const studentUser=existing?.user,meta=studentUser?.app_metadata;
   if(existingError||!studentUser||studentUser.email!==shadowEmail||meta?.bn_student_id!==record.id||meta?.bn_institution_id!==school||meta?.bn_password_pending===true)return denied();
   let issuedAt=0;
   try{
     const payload=JSON.parse(atob(jwt.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
     if(payload.sub!==guardian.id)return denied();
     issuedAt=Number(payload.iat)*1000;
   }catch(_){return denied()}
   // Prevent replay with the same already-consumed email session. A new
   // Supabase magic link is necessary for another recovery.
   if(!Number.isFinite(issuedAt)||issuedAt<=0||issuedAt<=Number(meta.bn_last_email_reset_ms||0))return denied();
   const {error:updateError}=await admin.auth.admin.updateUserById(studentUser.id,{
     password:newPassword,
     app_metadata:{...meta,bn_last_email_reset_ms:Date.now()}
   });
   if(updateError)return reply({error:'Password could not be updated. Please try again or contact the school office.'},503);
   return reply({ok:true,message:'Password updated. Sign in with your admission number and new password.'});
  }
  if(body.action==='change-password'){
   const jwt=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
   const {data:{user},error}=await auth.auth.getUser(jwt);
   const meta=user?.app_metadata;
   let claims;try{claims=JSON.parse(atob(jwt.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));}catch(_){return reply({error:'Please log in again'},401);}
   if(claims.app_metadata?.bn_password_pending===true&&meta?.bn_password_pending!==true)return reply({error:'Please log in with your new password'},401);
   if(error||!user||!meta?.bn_student_id||!meta?.bn_institution_id)return reply({error:'Please log in again'},401);
   const s=await student(meta.bn_student_id,meta.bn_institution_id);if(!s)return reply({error:'Student access unavailable'},403);
   const password=String(body.newPassword||'');
   if(password.length<8||password.length>128||!/[A-Za-z]/.test(password)||!/[0-9]/.test(password))return reply({error:'Use 8–128 characters with letters and numbers'},400);
   const {data:profile}=await admin.from('school_student_profiles').select('guardian_phone').eq('student_id',s.id).eq('institution_id',s.institution_id).maybeSingle();
   if(mobile(password)&&mobile(password)===mobile(profile?.guardian_phone))return reply({error:'Choose a password different from the registered mobile number'},400);
   const {error:revokeError}=await admin.auth.admin.signOut(jwt,'global');
   if(revokeError)return reply({error:'Unable to renew login. Please try again.'},503);
   const {error:updateError}=await admin.auth.admin.updateUserById(user.id,{password,app_metadata:{...meta,bn_password_pending:false}});
   if(updateError)return reply({error:'Password could not be updated. Choose a stronger password.'},400);
   await linkUser(user,s);
   const {data,error:loginError}=await auth.auth.signInWithPassword({email:user.email!,password});
   if(loginError||!data.session)return reply({error:'Password changed. Please log in with your new password.'},401);
   return reply({session:data.session,mustChangePassword:false,links:[{institution_id:s.institution_id,student_id:s.id}]});
  }
  if(body.action!=='login')return reply({error:'Invalid action'},400);
  const admission=String(body.admissionNumber||'').trim(),school=String(body.schoolId||DEFAULT_SCHOOL),password=String(body.password||'');
  if(!/^[A-Za-z0-9][A-Za-z0-9/_-]{0,63}$/.test(admission)||!/^[-a-f0-9]{36}$/.test(school)||!password||password.length>128)return reply({error:'Enter admission number and password'},400);
  const {data:ok,error:rateError}=await admin.rpc('bn_parent_login_attempt',{p_bucket:await digest('account:'+school+':'+admission.toLowerCase()),p_limit:10});
  if(rateError)return reply({error:'Login service unavailable'},503);
  if(!ok)return reply({error:'Too many attempts. Try again after 15 minutes.'},429);
  const {data:found,error:findError}=await admin.from('school_students').select('id').eq('institution_id',school).eq('admission_number',admission).eq('status','active').maybeSingle();
  let studentId=found&&!findError?found.id:null;
  if(!studentId){const {data:alias,error:aliasError}=await admin.from('school_student_profiles').select('student_id').eq('institution_id',school).eq('admission_login_alias',admission).maybeSingle();if(!aliasError)studentId=alias?.student_id;}
  const s=studentId?await student(studentId,school):null;
  const invalid=()=>reply({error:'Admission number or password is incorrect. First login requires the mobile number saved by your school.'},401);
  if(!s)return invalid();
  const email=(await digest('student:'+s.institution_id+':'+s.id))+'@student.brightnexa.invalid';
  let result=await auth.auth.signInWithPassword({email,password});
  if(result.error||!result.data.session){
   const {data:profile,error:pError}=await admin.from('school_student_profiles').select('guardian_phone').eq('student_id',s.id).eq('institution_id',s.institution_id).maybeSingle();
   const phone=mobile(profile?.guardian_phone);
   if(pError||!phone||phone!==mobile(password))return invalid();
   // Creation never updates an existing user's password. A changed password stays changed.
   const {error:createError}=await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{bn_student_id:s.id,bn_institution_id:s.institution_id,bn_password_pending:true}});
   if(createError)return invalid();
   result=await auth.auth.signInWithPassword({email,password});
  }
  const session=result.data.session,user=result.data.user;
  if(result.error||!session||!user||user.app_metadata.bn_student_id!==s.id||user.app_metadata.bn_institution_id!==s.institution_id)return invalid();
  const pending=user.app_metadata.bn_password_pending===true;
  if(!pending)await linkUser(user,s);
  return reply({session,mustChangePassword:pending,links:pending?[]:[{institution_id:s.institution_id,student_id:s.id}]});
 }catch(_){return reply({error:'Unable to complete student login. Try again or contact the school office.'},500);}
};}
Deno.serve(handler());

