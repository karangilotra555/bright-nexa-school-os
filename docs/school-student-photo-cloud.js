/* Private student photographs. Upload to school/student-scoped Supabase Storage
 * with authenticated RLS, then atomically publish the new photo_path.
 * No public URLs, service-role key, base64 photos or local master copies.
 */
(function(root){
 'use strict';
 const BUCKET='school-student-photos';
 const ALLOWED={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
 const MAX_BYTES=5*1024*1024;
 function create({base,key,token,fetcher}){
  if(!base||!key||typeof token!=='function')throw Error('Cloud photo client configuration missing');
  const fetchFn=fetcher||root.fetch.bind(root);
  const uuid=v=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v||''));
  const urlPath=path=>String(path).split('/').map(encodeURIComponent).join('/');
  async function secureFetch(path,opts={}){
   const jwt=await token();
   if(!jwt)throw Error('Sign in to the school portal again.');
   const res=await fetchFn(base+path,{...opts,cache:'no-store',headers:{apikey:key,Authorization:'Bearer '+jwt,...opts.headers}});
   const type=res.headers?.get?.('content-type')||'';
   let result={};
   try{result=type.includes('json')?await res.json():{}}catch(_){}
   if(!res.ok)throw Error(result.message||result.error||'Photo access denied. Check school account permissions.');
   return result;
  }
  function validate(file){
   if(!file||!ALLOWED[file.type])throw Error('Use a JPG, PNG or WebP student photo.');
   if(!Number.isSafeInteger(file.size)||file.size<1||file.size>MAX_BYTES)throw Error('Student photo must be under 5 MB.');
  }
  async function upload(schoolId,studentId,file){
   if(!uuid(schoolId)||!uuid(studentId))throw Error('Select a valid school student.');
   validate(file);
   if(typeof root.crypto?.randomUUID!=='function')throw Error('Secure random ID generation is not available in this browser.');
   const suffix=root.crypto.randomUUID().replaceAll('-','');
   const path=schoolId+'/'+studentId+'/photo-'+suffix+'.'+ALLOWED[file.type];
   const jwt=await token();
   if(!jwt)throw Error('Please sign in again.');
   const response=await fetchFn(base+'/storage/v1/object/'+BUCKET+'/'+urlPath(path),{
    method:'POST',headers:{apikey:key,Authorization:'Bearer '+jwt,'Content-Type':file.type,'cache-control':'3600','x-upsert':'false'},
    body:file,cache:'no-store'
   });
   if(!response.ok){
    const body=await response.json().catch(()=>({}));
    throw Error(body.message||body.error||'Photo upload rejected by school storage.');
   }
   // Only the admin RPC can publish the path for the selected student.
   await secureFetch('/rest/v1/rpc/bn_save_student_photo',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({p_student_id:studentId,p_storage_path:path})});
   return {path,url:await signedUrl(schoolId,studentId,path)};
  }
  async function signedUrl(schoolId,studentId,path){
   if(!path)return null;
   if(!uuid(schoolId)||!uuid(studentId)||
      !String(path).startsWith(schoolId+'/'+studentId+'/photo-')||
      !/^[-a-zA-Z0-9_/.]+$/.test(path))throw Error('Invalid student photo path');
   const result=await secureFetch('/storage/v1/object/sign/'+BUCKET+'/'+urlPath(path),{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expiresIn:300})
   });
   const signed=result.signedURL||result.signedUrl;
   if(!signed)throw Error('No signed student photo URL returned');
   const endpoint=signed.startsWith('/object/sign/')?'/storage/v1'+signed:signed;
   const resolved=new URL(endpoint,base);
   if(resolved.origin!==new URL(base).origin)throw Error('Photo URL origin rejected');
   return resolved.href;
  }
  return {upload,signedUrl,validate,BUCKET};
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={create};
 else root.BNStudentPhotos={create};
})(typeof window!=='undefined'?window:globalThis);
