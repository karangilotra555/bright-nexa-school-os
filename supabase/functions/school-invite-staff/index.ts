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
  if (mobile && !/^[6-9][0-9]{9}$/.test(mobile)) throw Error("Teacher mobile is invalid. Correct the ERP profile.");
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
    const {data:member,error:memberError}=await admin.from("school_users")
      .select("id,institution_id,role,status")
      .eq("auth_user_id",identity.user.id).eq("role", "school_admin").eq("status", "active").maybeSingle();
    if(memberError || !member) return reply({error:"School administrator access required"},403);
    const body=await req.json().catch(()=>null);
    const email=norm(body?.email).toLowerCase(),role=norm(body?.role);
    if(!validEmail(email) || !roles.has(role))return reply({error:"Valid staff email and role required"},400);
    const facultyId=norm(body?.facultyId);
    let facultyProfile:Awaited<ReturnType<typeof teacherContext>>|null=null;
    if(role==="teacher"){
      try {facultyProfile=await teacherContext(admin,member.institution_id,facultyId,email);}
      catch(e){return reply({error:(e as Error).message},422);}
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
        return reply({ok:true,email,role,status:"updated",assignments:count},200);
      }catch(e){return reply({error:(e as Error).message},500);}
    }

    const {data:invite,error:inviteError}=await admin.auth.admin.inviteUserByEmail(email,{
      redirectTo:RENDER_ORIGIN+"/teacher-access.html"
    });
    if(inviteError || !invite.user)
      return reply({error:"Invitation not sent. Check email configuration and existing Auth accounts."},422);
    const {data:record,error:insertError}=await admin.from("school_users")
      .insert({institution_id:member.institution_id,email,role,
        status:role==="teacher"?"disabled":"active",auth_user_id:invite.user.id,
        ...(facultyProfile?{display_name:norm(facultyProfile.faculty.name)}:{})})
      .select("id").single();
    if(insertError || !record)
      return reply({error:"Auth invite created, but staff membership failed. Administrator reconciliation required."},500);
    let assignments=0;
    if(facultyProfile){
      try{assignments=await syncTeacher(admin,member.institution_id,record.id,facultyId,email,facultyProfile);}
      catch(e){return reply({error:(e as Error).message+" Invitation exists, but account remains disabled."},500);}
    }
    await admin.from("school_audit_events").insert({
      institution_id:member.institution_id,actor_id:member.id,action:"staff.invited",
      entity:"school_users",entity_id:record.id
    });
    return reply({ok:true,email,role,status:"invited",assignments},201);
  }catch(_e){return reply({error:"Unable to enroll staff; check school account and Supabase logs."},500);}
});
