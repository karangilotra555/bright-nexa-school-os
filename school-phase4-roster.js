/* Smart Timetable: explicit, read-only school roster import from Supabase Auth + RLS.
   Never trust sample-mode flags or browser-supplied roles to grant cloud access. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.BrightNexaSchoolRoster=api;
})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const BASE='https://mrfvbwmyxndrakskqyas.supabase.co';
 const KEY='sb_publishable_qnOuxnbwCKcPbxpVMz3QTQ_9jAjLGGT';
 const SESSION='bn_school_staff_session_v1';
 function query(o){return new URLSearchParams(o).toString()}
 async function fetchRoster({storage,fetcher,now=Math.floor(Date.now()/1000)}={}){
   storage=storage||sessionStorage;fetcher=fetcher||fetch;
   let session;
   try{session=JSON.parse(storage.getItem(SESSION)||'null')}catch{}
   if(!session?.access_token)throw Error('Sign in as school admin or principal to load cloud roster.');
   if(Number(session.expires_at)<=now+60){
     if(!session.refresh_token)throw Error('School session expired. Sign in again.');
     const r=await fetcher(BASE+'/auth/v1/token?grant_type=refresh_token',{
       method:'POST',headers:{apikey:KEY,'content-type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token}),cache:'no-store'
     });
     const data=await r.json().catch(()=>({}));
     if(!r.ok||!data.access_token||!data.refresh_token)throw Error('Unable to refresh cloud school session. Please sign in again.');
     session={access_token:data.access_token,refresh_token:data.refresh_token,expires_at:now+(Number(data.expires_in)||3600)};
     storage.setItem(SESSION,JSON.stringify(session));
   }
   const headers={apikey:KEY,Authorization:'Bearer '+session.access_token};
   async function get(url){
     const res=await fetcher(url,{headers,cache:'no-store'});
     const rows=await res.json().catch(()=>null);
     if(!res.ok)throw Error(rows?.message||'Cloud roster access denied.');
     return rows;
   }
   const identity=await get(BASE+'/auth/v1/user');
   if(!identity?.id)throw Error('Verified school identity missing.');
   const memberships=await get(BASE+'/rest/v1/school_users?'+query({
     select:'id,institution_id,role,status',auth_user_id:'eq.'+identity.id,status:'eq.active'
   }));
   const own=(Array.isArray(memberships)?memberships:[]).filter(m=>m.status==='active'&&['school_admin','principal'].includes(m.role));
   if(!own.length)throw Error('Only an active school admin or principal can load the full school roster.');
   if(new Set(own.map(m=>m.institution_id)).size!==1)
     throw Error('This login manages more than one school. Choose a specific school before importing its timetable roster.');
   const institution_id=own[0].institution_id;
   const institutions=await get(BASE+'/rest/v1/institutions?'+query({select:'id,status',id:'eq.'+institution_id,limit:'1'}));
   if(!Array.isArray(institutions)||!institutions.some(s=>s.id===institution_id&&['active','trial'].includes(s.status)))
     throw Error('School is inactive or access was revoked.');
   async function pages(table,select,filters={}){
     const out=[];const limit=200;
     for(let offset=0;offset<4000;offset+=limit){
       const rows=await get(BASE+'/rest/v1/'+table+'?'+query({
         select,institution_id:'eq.'+institution_id,...filters,order:'id.asc',limit:String(limit),offset:String(offset)
       }));
       if(!Array.isArray(rows))throw Error('Invalid cloud roster response.');
       if(rows.some(x=>x.institution_id!==institution_id))throw Error('Cloud roster contained records from another school.');
       out.push(...rows);
       if(rows.length<limit)return out;
     }
     throw Error('School roster exceeds 4,000 records. Filter before exporting; no incomplete roster was loaded.');
   }
   const [classes,staff]=await Promise.all([
     pages('school_classes','id,institution_id,name,section,academic_year'),
     pages('school_staff_profiles','id,institution_id,display_name,staff_category,is_seeded_test',{staff_category:'eq.teaching'})
   ]);
   if(classes.length>200||staff.length>200)throw Error('Timetable editor supports up to 200 classes or teachers.');
   return {
     institution_id,
     classes:classes.map(c=>({id:c.id,label:c.name+' '+c.section+' ('+c.academic_year+')'})),
     teachers:staff.map(s=>({id:s.id,name:s.display_name,needsReview:s.is_seeded_test===true}))
   };
 }
 return {fetchRoster};
});
