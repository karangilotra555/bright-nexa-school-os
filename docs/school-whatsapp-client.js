/* Official school WhatsApp. Publishable key only. Provider secrets stay in Vault. */
(function(root){'use strict';
 const base='https://mrfvbwmyxndrakskqyas.supabase.co',key='sb_publishable_qnOuxnbwCKcPbxpVMz3QTQ_9jAjLGGT',sessionKey='bn_school_staff_session_v1';
 async function json(response){const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error_description||data.msg||data.error||'WhatsApp request failed');return data;}
 function save(p){const s={access_token:p.access_token,refresh_token:p.refresh_token,expires_at:Date.now()/1000+(p.expires_in||3600)};sessionStorage.setItem(sessionKey,JSON.stringify(s));return s;}
 async function login(email,password){return save(await json(await fetch(base+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email,password})})));}
 async function request(path,body){let s;try{s=JSON.parse(sessionStorage.getItem(sessionKey)||'null');}catch{}if(!s?.access_token)throw Error('Sign in with your school administrator email and password');if(s.expires_at<Date.now()/1000+90)s=save(await json(await fetch(base+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:s.refresh_token})})));return json(await fetch(base+'/functions/v1/school-whatsapp'+path,{method:body?'POST':'GET',headers:{apikey:key,Authorization:'Bearer '+s.access_token,'Content-Type':'application/json'},cache:'no-store',...(body?{body:JSON.stringify(body)}:{})}));}
 root.BNSchoolWhatsApp={login,request};
})(typeof window!=='undefined'?window:globalThis);
