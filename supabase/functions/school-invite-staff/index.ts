import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const url = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const ORIGIN = "https://karangilotra555.github.io";
const RENDER_ORIGIN = "https://bright-nexa-school-os.onrender.com";
const roles = new Set(["teacher", "principal", "accountant", "librarian", "receptionist", "transport_staff"]);
const norm = (s: unknown) => String(s ?? "").trim();
const validEmail = (s: string) => s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const employment: Record<string,string> = {Permanent:"permanent",Contract:"contract","Part-time":"part_time",Visiting:"visiting"};

function respond(data: unknown, status = 200, origin = ORIGIN) {
  return new Response(JSON.stringify(data), {status, headers:{
    "content-type":"application/json; charset=utf-8","cache-control":"no-store",
    "access-control-allow-origin":origin,"access-control-allow-methods":"POST, OPTIONS",
    "access-control-allow-headers":"authorization, apikey, content-type","vary":"Origin"
  }});
}

type TeacherRecord = {
  id:string; email:string; name:string; status:string; joiningDate:string;
  employmentType:string; contractEndDate?:string; daysPerWeek?:number|string;
  hoursPerDay?:number|string; visitsPerMonth?:number|string;
  assignedClasses?:string[]; subjects?:string[]; mobile?:string; designation?:string;
};

async function teacherContext(admin: ReturnType<typeof createClient>, schoolId:string, facultyId:string, email:string) {
  if (!facultyId) throw Error("Select a saved ERP faculty profile before creating Teacher App access.");
  const {data:workspace,error:readError} = await admin.from("school_workspaces")
    .select("snapshot").eq("institution_id",schoolId).single();
  if (readError || !workspace) throw Error("Could not verify the current Supabase faculty record.");
  const list = workspace.snapshot?.operations?.teachers;
  const faculty:TeacherRecord|undefined = Array.isArray(list)
    ? list.find((row:TeacherRecord)=>norm(row?.id) === facultyId) : undefined;
  if (!faculty || norm(faculty.email).toLowerCase() !== email || norm(faculty.status) !== "Active" ||
      norm(faculty.name).length < 2 || !norm(faculty.joiningDate) || !employment[norm(faculty.employmentType)]) {
    throw Error("Faculty profile in Supabase is incomplete, inactive, or its email does not match. Save the ERP profile first.");
  }
  const mobile = norm(faculty.mobile) || null;
  if (!mobile || !/^[6-9][0-9]{9}$/.test(mobile)) throw Error("Teacher mobile number is required for first Teacher App login. Save a valid 10-digit number in the ERP profile.");
  const type=norm(faculty.employmentType);
  const partDays=Number(faculty.daysPerWeek);
  const partHours=Number(faculty.hoursPerDay);
  const visits=Number(faculty.visitsPerMonth);
  if ((type==="Contract" && (!norm(faculty.contractEndDate) || norm(faculty.contractEndDate) < norm(faculty.joiningDate))) ||
      (type==="Part-time" && (!Number.isInteger(partDays) || partDays < 1 || partDays > 7 || !(partHours > 0 && partHours <= 12))) ||
      (type==="Visiting" && (!Number.isInteger(visits) || visits < 1 || visits > 31))) {
    throw Error("Employment schedule is incomplete. Correct the ERP faculty profile.");
  }
  const {data:schoolClasses,error:classesError}=await admin.from("school_classes")
    .select("id,name,section").eq("institution_id",schoolId);
  if (classesError) throw Error("Could not verify school class assignments.");
  const assigned=Array.isArray(faculty.assignedClasses)?faculty.assignedClasses:[];
  const subjects=Array.isArray(faculty.subjects)
    ? [...new Set(faculty.subjects.map(norm).filter(Boolean))] : [];
  if (assigned.length && !subjects.length)
    throw Error("Assign a subject before publishing Teacher App class access.");
  const teachingRows:Array<{class_id:string;subject:string}> = [];
  for (const label of new Set(assigned)) {
    const candidates=(schoolClasses || []).filter(row => `${row.name}-${row.section}` === label);
    if (candidates.length !== 1) throw Error("Teacher has a missing or ambiguous class assignment: "+label);
    for (const subject of subjects) teachingRows.push({class_id:candidates[0].id,subject});
  }
  return {faculty,type,teachingRows,mobile,partDays,partHours,visits};
}

async function syncTeacher(
  admin:ReturnType<typeof createClient>, schoolId:string, userId:string,
  facultyId:string, email:string, profile:Awaited<ReturnType<typeof teacherContext>>
) {
  const {faculty,type,teachingRows,mobile,partDays,partHours,visits}=profile;
  const staffRecord={
    institution_id:schoolId,school_user_id:userId,display_name:norm(faculty.name),
    staff_category:"teaching",designation:norm(faculty.designation)||null,
    employment_type:employment[type],contact_email:email,contact_mobile:mobile,
    contract_end_on:type==="Contract"?norm(faculty.contractEndDate):null,
    days_per_week:type==="Part-time"?partDays:null,
    hours_per_day:type==="Part-time"?partHours:null,
    visits_per_month:type==="Visiting"?visits:null,
    notes:"ERP faculty ref: "+facultyId
  };
  const {error:staffError}=await admin.from("school_staff_profiles")
    .upsert(staffRecord,{onConflict:"school_user_id,institution_id"});
  if (staffError) throw Error("Teacher profile sync failed. Account is disabled for safety.");
  const {error:deactivateError}=await admin.from("school_teacher_assignments")
    .update({active:false}).eq("institution_id",schoolId).eq("school_user_id",userId);
  if (deactivateError) throw Error("Previous teacher assignments could not be deactivated.");
  if (teachingRows.length) {
    const rows=teachingRows.map(row=>({
      institution_id:schoolId,school_user_id:userId,class_id:row.class_id,
      assignment_type:"subject_teacher",subject:row.subject,
      active:true,can_view_roster:true,can_take_attendance:true,
      can_assign_homework:true,can_enter_marks:true
    }));
    const {error:assignError}=await admin.from("school_teacher_assignments")
      .upsert(rows,{onConflict:"school_user_id,class_id,subject"});
    if (assignError) throw Error("Teacher class/subject assignment sync failed. Account remains disabled.");
  }
  const {error:activateError}=await admin.from("school_users")
    .update({status:"active",display_name:norm(faculty.name)})
    .eq("id",userId).eq("institution_id",schoolId).eq("role","teacher");
  if (activateError) throw Error("Teacher membership activation failed after profile sync.");
  return teachingRows.length;
}


/* School Admin provisions only a never-used invited Teacher Auth identity.
 * Never overwrite a password that has already been activated or used. */
async function teacherFirstMobilePassword(admin:ReturnType<typeof createClient>,schoolId:string,userId:string,email:string,phone:string){
  if(!/^[6-9][0-9]{9}$/.test(phone))throw Error("A valid 10-digit teacher mobile is required in the saved ERP profile.");
  const {data:member,error:memberError}=await admin.from("school_users")
    .select("id,auth_user_id,email,role,status").eq("id",userId).eq("institution_id",schoolId).eq("role","teacher").eq("status","active").maybeSingle();
  if(memberError||!member?.auth_user_id||norm(member.email).toLowerCase()!==email)throw Error("Active teacher account does not match saved school profile.");
  const {data:entry,error:entryError}=await admin.auth.admin.getUserById(member.auth_user_id);
  const user=entry?.user;
  if(entryError||!user||norm(user.email).toLowerCase()!==email)throw Error("Teacher Auth identity could not be verified.");
  if(user.app_metadata?.bn_teacher_mobile_pending===true&&user.email_confirmed_at)return "ready";
  if(user.last_sign_in_at||user.email_confirmed_at)return "already_activated";
  if(!user.invited_at)throw Error("This is not a never-used school invitation. Existing credentials were preserved.");
  const {error:passwordError}=await admin.auth.admin.updateUserById(user.id,{
    password:phone,email_confirm:true,
    app_metadata:{...user.app_metadata,bn_teacher_mobile_pending:true}
  });
  if(passwordError)throw Error("Could not enable initial mobile login in Supabase Auth.");
  const {data:verified,error:verificationError}=await admin.auth.admin.getUserById(user.id);
  if(verificationError||!verified?.user?.email_confirmed_at||verified.user.app_metadata?.bn_teacher_mobile_pending!==true)
    throw Error("Teacher mobile login was not verified in Supabase Auth.");
  return "ready";
}

Deno.serve(async (req:Request)=>{
  const origin=req.headers.get("origin");
  const reply=(data:unknown,status=200)=>respond(data,status,origin||ORIGIN);
  if (origin && origin!==ORIGIN && origin!==RENDER_ORIGIN) return reply({error:"Origin not allowed"},403);
  if (req.method==="OPTIONS") return reply({ok:true});
  if (req.method!=="POST") return reply({error:"Method not allowed"},405);
  if (!url || !serviceKey || !anonKey) return reply({error:"Server not configured"},503);
  const match=/^Bearer (\S+)$/.exec(req.headers.get("authorization")||"");
  if(!match) return reply({error:"Login required"},401);
  try {
    const client=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:identity,error:authError}=await client.auth.getUser(match[1]);
    if(authError || !identity.user) return reply({error:"Invalid session"},401);
    const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const body=await req.json().catch(()=>null);
    // Password change is self-service, but only an already-authenticated teacher
    // with an active tenant membership may finish an initial mobile login.
    if(body?.action==="complete_teacher_mobile_password"){
      const pw=String(body?.newPassword||"");
      if(pw.length<12||pw.length>128||!/[a-z]/i.test(pw)||!/[0-9]/.test(pw))
        return reply({error:"New password must have 12–128 characters, letters and digits."},400);
      const user=identity.user;
      if(user.app_metadata?.bn_teacher_mobile_pending!==true)return reply({error:"Initial password change is not required for this account."},403);
      const {data:members,error:teacherError}=await admin.from("school_users")
        .select("id,institution_id").eq("auth_user_id",user.id).eq("role","teacher").eq("status","active").limit(2);
      if(teacherError||!members?.length)return reply({error:"Active Teacher App membership required."},403);
      const {data:profile,error:profileError}=await admin.from("school_staff_profiles")
        .select("contact_mobile").eq("school_user_id",members[0].id).eq("institution_id",members[0].institution_id).maybeSingle();
      if(profileError||!profile?.contact_mobile)return reply({error:"Teacher mobile profile could not be verified."},403);
      if(pw===profile.contact_mobile)return reply({error:"Choose a new password different from your mobile number."},400);
      const {error:changedError}=await admin.auth.admin.updateUserById(user.id,{
        password:pw,app_metadata:{...user.app_metadata,bn_teacher_mobile_pending:false}
      });
      if(changedError)return reply({error:"Password change could not be saved. Retry."},503);
      const {data:confirmed}=await admin.auth.admin.getUserById(user.id);
      if(confirmed?.user?.app_metadata?.bn_teacher_mobile_pending!==false)return reply({error:"Password change read-back could not be verified."},503);
      await admin.auth.admin.signOut(match[1],"global").catch(()=>{});
      return reply({ok:true,status:"password_changed_sign_in_again"});
    }
    const {data:member,error:memberError}=await admin.from("school_users")
      .select("id,institution_id,role,status")
      .eq("auth_user_id",identity.user.id).eq("role", "school_admin").eq("status", "active").maybeSingle();
    if(memberError || !member) return reply({error:"School administrator access required"},403);
    const email=norm(body?.email).toLowerCase(),role=norm(body?.role);
    if(!validEmail(email) || !roles.has(role))return reply({error:"Valid staff email and role required"},400);
    let facultyId=norm(body?.facultyId);
    if(["activation_link","initial_mobile_password"].includes(String(body?.action)) && role==="teacher" && !facultyId){
      const {data:staffMatches,error:matchError}=await admin.from("school_staff_profiles")
        .select("notes").eq("institution_id",member.institution_id)
        .eq("contact_email",email).eq("staff_category","teaching").limit(2);
      if(matchError||!staffMatches||staffMatches.length!==1)
        return reply({error:"Teacher ERP profile cannot be identified uniquely"},409);
      const match=/^ERP faculty ref: ([0-9a-f-]{36})$/i.exec(norm(staffMatches[0].notes));
      if(!match)return reply({error:"Teacher ERP faculty link is missing"},409);
      facultyId=match[1];
    }
    if (body?.action === "deactivate") {
      if (role !== "teacher" || !facultyId)
        return reply({error:"Verified faculty ID and teacher role are required to deactivate App access."},400);
      const {data:linked,error:linkError}=await admin.from("school_staff_profiles")
        .select("school_user_id").eq("institution_id",member.institution_id)
        .eq("notes","ERP faculty ref: "+facultyId).maybeSingle();
      if(linkError)return reply({error:"Could not verify faculty account linkage"},500);
      const query=admin.from("school_users").select("id,email,role,status")
        .eq("institution_id",member.institution_id).eq("role","teacher");
      const {data:account,error:accountError}=linked?.school_user_id
        ? await query.eq("id",linked.school_user_id).maybeSingle()
        : await query.eq("email",email).maybeSingle();
      if(accountError)return reply({error:"Could not verify Teacher App membership"},500);
      if(!account)return reply({ok:true,role,email,status:"not-enrolled"},200);
      if(account.email.toLowerCase() !== email)
        return reply({error:"ERP faculty email does not match the linked Teacher App account"},409);
      const {error:disabledError}=await admin.from("school_users").update({status:"disabled"})
        .eq("id",account.id).eq("institution_id",member.institution_id).eq("role","teacher");
      if(disabledError)return reply({error:"Could not disable Teacher App membership"},500);
      const {error:assignmentError}=await admin.from("school_teacher_assignments")
        .update({active:false}).eq("institution_id",member.institution_id).eq("school_user_id",account.id);
      if(assignmentError)return reply({error:"Teacher login disabled but assignment revocation needs administrator review."},500);
      await admin.from("school_audit_events").insert({
        institution_id:member.institution_id,actor_id:member.id,
        action:"staff.disabled",entity:"school_users",entity_id:account.id
      });
      return reply({ok:true,email,role,status:"disabled"},200);
    }
    let facultyProfile:Awaited<ReturnType<typeof teacherContext>>|null=null;
    if(role==="teacher"){
      try {facultyProfile=await teacherContext(admin,member.institution_id,facultyId,email);}
      catch(e){return reply({error:(e as Error).message},422);}
    }
    if(body?.action==="initial_mobile_password"){
      if(role!=="teacher"||!facultyProfile)return reply({error:"Saved, active teacher profile required."},422);
      const {data:memberRow,error:lookupError}=await admin.from("school_users")
        .select("id").eq("institution_id",member.institution_id).eq("role","teacher").eq("email",email).eq("status","active").maybeSingle();
      if(lookupError||!memberRow)return reply({error:"Create / Sync Teacher App Access first."},409);
      const {data:linked,error:linkError}=await admin.from("school_staff_profiles")
        .select("school_user_id,notes").eq("school_user_id",memberRow.id)
        .eq("institution_id",member.institution_id).maybeSingle();
      if(linkError||linked?.notes!=="ERP faculty ref: "+facultyId)
        return reply({error:"Teacher profile is not linked to this school account."},409);
      try{
        const status=await teacherFirstMobilePassword(admin,member.institution_id,memberRow.id,email,facultyProfile.mobile!);
        return reply({ok:true,status,initialMobilePassword:status==="ready",emailSent:false});
      }catch(error){return reply({error:(error as Error).message},409);}
    }
    // Admin-controlled, email-free activation for a *never-used* invited teacher.
    // This only creates a short-lived recovery link: it never sets a password,
    // never confirms another user's email, and never exposes the service key.
    if(body?.action==="activation_link"){
      if(role!=="teacher"||!facultyProfile||!facultyId)
        return reply({error:"A saved, active teacher profile is required"},422);
      const {data:staff,error:staffError}=await admin.from("school_staff_profiles")
        .select("school_user_id").eq("institution_id",member.institution_id)
        .eq("contact_email",email).eq("notes","ERP faculty ref: "+facultyId).maybeSingle();
      if(staffError||!staff?.school_user_id)
        return reply({error:"Teacher profile is not linked to an enrolled account"},409);
      const {data:enrollment,error:enrollmentError}=await admin.from("school_users")
        .select("id,email,auth_user_id,role,status").eq("id",staff.school_user_id)
        .eq("institution_id",member.institution_id).eq("role","teacher")
        .eq("status","active").eq("email",email).maybeSingle();
      if(enrollmentError||!enrollment?.auth_user_id)
        return reply({error:"Teacher account is not enrolled and active"},409);
      const {data:authEntry,error:authEntryError}=await admin.auth.admin.getUserById(enrollment.auth_user_id);
      if(authEntryError||!authEntry?.user||norm(authEntry.user.email).toLowerCase()!==email)
        return reply({error:"Teacher Auth identity could not be verified"},409);
      if(authEntry.user.last_sign_in_at||authEntry.user.email_confirmed_at)
        return reply({error:"Account has already been activated. Use normal sign-in or password reset."},409);
      const {data:generated,error:generatedError}=await admin.auth.admin.generateLink({
        type:"recovery",email,options:{redirectTo:RENDER_ORIGIN+"/teacher-access.html"}
      });
      // Use an Auth-issued, one-time token hash directly on our first-party
      // page. Never redirect through the project's SITE_URL (which may still
      // be configured as localhost during initial setup). The client calls
      // /auth/v1/verify; Supabase validates expiry and consumes the token.
      const tokenHash=generated?.properties?.hashed_token;
      const tokenType=generated?.properties?.verification_type;
      if(generatedError || tokenType!=="recovery" || typeof tokenHash!=="string" ||
         !/^[A-Za-z0-9_-]{24,256}$/.test(tokenHash))
        return reply({error:"Could not generate a valid one-time Auth token: "+(generatedError?.message||"Invalid Auth response")},503);
      const activationUrl=RENDER_ORIGIN+"/teacher-access.html#type=recovery&token_hash="+encodeURIComponent(tokenHash);
      await admin.from("school_audit_events").insert({
        institution_id:member.institution_id,actor_id:member.id,action:"staff.activation_link_issued",
        entity:"school_users",entity_id:enrollment.id
      });
      return reply({ok:true,email,activationUrl,notice:"This is a one-time sign-in link. Share privately and set a new password. No email was sent."},200);
    }

    const {data:existing,error:existingError}=await admin.from("school_users")
      .select("id,role,status").eq("institution_id",member.institution_id).eq("email",email).maybeSingle();
    if(existingError)return reply({error:"Staff enrollment check failed"},500);
    if(existing && (role!=="teacher" || existing.role!=="teacher"))
      return reply({error:"This email is already enrolled at this school"},409);

    // Updating an existing teacher is a data-sync action, not a new email invitation.
    if(existing && facultyProfile){
      const {error:disableError}=await admin.from("school_users").update({status:"disabled"})
        .eq("id",existing.id).eq("institution_id",member.institution_id);
      if(disableError)return reply({error:"Could not safely lock teacher account during sync"},500);
      try{
        const count=await syncTeacher(admin,member.institution_id,existing.id,facultyId,email,facultyProfile);
        const passwordStatus=await teacherFirstMobilePassword(admin,member.institution_id,existing.id,email,facultyProfile.mobile!);
        return reply({ok:true,email,role,status:"updated",assignments:count,initialMobilePassword:passwordStatus==="ready",emailSent:false},200);
      }catch(e){return reply({error:(e as Error).message},500);}
    }

    // Reconcile an already invited Auth identity instead of failing on duplicate email.
    // Auth lookup runs server-side only; no privileged key is exposed to the ERP.
    let authUserId = "";
    let reusedAuth = false;
    for (let page=1; page<=20; page++) {
      const {data:pageData,error:pageError}=await admin.auth.admin.listUsers({page,perPage:1000});
      if(pageError)return reply({error:"Unable to inspect existing Auth accounts safely"},503);
      const users=pageData?.users || [];
      const matchUser=users.find(u=>norm(u.email).toLowerCase()===email);
      if(matchUser){authUserId=matchUser.id;reusedAuth=true;break;}
      if(users.length<1000)break;
    }
    if(!authUserId){
      if(role==="teacher"&&facultyProfile){
        const {data:created,error:createError}=await admin.auth.admin.createUser({
          email,password:facultyProfile.mobile!,email_confirm:true,
          app_metadata:{bn_teacher_mobile_pending:true}
        });
        if(createError||!created?.user)return reply({error:"Teacher mobile-password account creation failed."},422);
        authUserId=created.user.id;
      }else{
        const {data:invite,error:inviteError}=await admin.auth.admin.inviteUserByEmail(email,{
          redirectTo:RENDER_ORIGIN+"/teacher-access.html"
        });
        if(inviteError || !invite?.user)
          return reply({error:"Auth invitation failed: "+(inviteError?.message||"Unknown mail provider error")},422);
        authUserId=invite.user.id;
      }
    }
    const {data:record,error:insertError}=await admin.from("school_users")
      .insert({institution_id:member.institution_id,email,role,
        status:role==="teacher"?"disabled":"active",auth_user_id:authUserId,
        ...(facultyProfile?{display_name:norm(facultyProfile.faculty.name)}:{})})
      .select("id").single();
    if(insertError || !record)
      return reply({error:"Auth invite created, but staff membership failed. Administrator reconciliation required."},500);
    let assignments=0;
    let mobilePasswordStatus="not_applicable";
    if(facultyProfile){
      try{
        assignments=await syncTeacher(admin,member.institution_id,record.id,facultyId,email,facultyProfile);
        if(reusedAuth)mobilePasswordStatus=await teacherFirstMobilePassword(admin,member.institution_id,record.id,email,facultyProfile.mobile!);
        else mobilePasswordStatus="ready";
      }catch(e){return reply({error:(e as Error).message+" Account needs administrator reconciliation."},500);}
    }
    await admin.from("school_audit_events").insert({
      institution_id:member.institution_id,actor_id:member.id,action:"staff.invited",
      entity:"school_users",entity_id:record.id
    });
    return reply({ok:true,email,role,status:reusedAuth?"existing-auth-linked":"invited",
      emailSent:role==="teacher"?false:!reusedAuth,
      requiresEmailConfirmation:role==="teacher"?false:reusedAuth,
      initialMobilePassword:mobilePasswordStatus==="ready",assignments},reusedAuth?200:201);
  }catch(_e){return reply({error:"Unable to enroll staff; check school account and Supabase logs."},500);}
});
