/* Shared private homework attachments and in-app PDF/image reader. */
(function(root){
'use strict';
const MIME={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp'},MAX=10*1024*1024;
async function validate(file){
 if(!MIME[file.type]||!file.size||file.size>MAX)throw Error('Choose a PDF, JPG, PNG or WEBP file up to 10 MB.');
 const b=new Uint8Array(await file.slice(0,12).arrayBuffer());
 const valid=file.type==='application/pdf'?String.fromCharCode(...b.slice(0,5))==='%PDF-':file.type==='image/jpeg'?b[0]===255&&b[1]===216&&b[2]===255:file.type==='image/png'?b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71:String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP';
 if(!valid)throw Error('The selected file does not match its PDF / image format.');
}
function create({base,key,token,fetcher=root.fetch?.bind(root)}){
 async function authFetch(path,options={}){const jwt=await token();if(!jwt)throw Error('Please log in again.');const res=await fetcher(base+path,{...options,headers:{apikey:key,Authorization:'Bearer '+jwt,...options.headers},cache:'no-store'});if(!res.ok){const p=await res.json().catch(()=>({}));throw Error(p.message||p.error||'File request denied. Please retry.');}return res;}
 async function json(path,method='GET',body){const res=await authFetch(path,{method,headers:{'Content-Type':'application/json','Prefer':'return=representation'},body:body===undefined?undefined:JSON.stringify(body)});return res.json();}
 async function list(ids){if(!ids.length)return [];return json('/rest/v1/school_homework_files?select=*&homework_id=in.('+ids.join(',')+')&order=created_at.asc');}
 async function upload(homework,files){
  const selected=Array.from(files||[]);if(selected.length>5)throw Error('Choose up to 5 files at a time.');
  for(const f of selected)await validate(f);
  for(const f of selected){
   const id=crypto.randomUUID(),path=homework.institution_id+'/'+homework.id+'/'+id+'.'+MIME[f.type];
   await json('/rest/v1/school_homework_files','POST',{id,homework_id:homework.id,institution_id:homework.institution_id,storage_path:path,name:f.name.slice(0,180),mime:f.type,size:f.size});
   try{await authFetch('/storage/v1/object/school-homework/'+path,{method:'POST',headers:{'Content-Type':f.type,'x-upsert':'false'},body:f});}
   catch(e){await json('/rest/v1/school_homework_files?id=eq.'+id,'DELETE').catch(()=>{});throw e;}
  }
 }
 function links(container,files){for(const file of files||[]){const button=document.createElement('button');button.type='button';button.className='bn-file-button';button.textContent=(file.mime==='application/pdf'?'📄 ':'🖼 ')+file.name;button.addEventListener('click',()=>open(file));container.append(button);}}
 async function open(file){
  const previous=document.activeElement,overlay=document.createElement('div');overlay.className='bn-file-viewer';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label',file.name);
  const bar=document.createElement('div');bar.className='bn-file-toolbar';const title=document.createElement('strong');title.textContent=file.name;const close=document.createElement('button');close.textContent='Close ✕';close.type='button';bar.append(title,close);
  const status=document.createElement('p');status.setAttribute('role','status');status.textContent='Loading file…';const body=document.createElement('div');body.className='bn-file-body';overlay.append(bar,status,body);document.body.append(overlay);close.focus();
  let closed=false,objectUrl=null,pdf=null,renderTask=null,task=null;const abort=new AbortController();
  const finish=()=>{if(closed)return;closed=true;abort.abort();renderTask?.cancel();task?.destroy();pdf?.destroy();if(objectUrl)URL.revokeObjectURL(objectUrl);overlay.remove();document.removeEventListener('keydown',onKey);previous?.focus();};
  const onKey=e=>{if(e.key==='Escape')finish();if(e.key==='Tab'){const focusable=[...overlay.querySelectorAll('button:not(:disabled)')];if(!focusable.length)return;const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};
  close.onclick=finish;document.addEventListener('keydown',onKey);
  try{
   if(!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(pdf|jpg|png|webp)$/.test(file.storage_path))throw Error('Invalid file reference.');
   const res=await authFetch('/storage/v1/object/authenticated/school-homework/'+file.storage_path,{signal:abort.signal});const blob=await res.blob();if(closed)return;
   if(file.mime!=='application/pdf'){objectUrl=URL.createObjectURL(blob);const img=document.createElement('img');img.onload=()=>{if(!closed)status.textContent='';};img.onerror=()=>{if(!closed)status.textContent='Unable to read this image.';};img.src=objectUrl;img.alt=file.name;body.append(img);return;}
   const lib=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');if(closed)return;
   lib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
   task=lib.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false});pdf=await task.promise;if(closed){pdf.destroy();return;}
   let page=1,busy=false;const prev=document.createElement('button'),next=document.createElement('button');prev.textContent='← Previous';next.textContent='Next →';prev.type=next.type='button';bar.append(prev,next);const canvas=document.createElement('canvas');body.append(canvas);
   async function draw(){if(busy||closed)return;busy=true;prev.disabled=next.disabled=true;try{const p=await pdf.getPage(page);if(closed)return;const original=p.getViewport({scale:1});const scale=Math.min(2,Math.max(1,root.devicePixelRatio||1));const width=Math.min(1000,Math.max(250,body.clientWidth-24));const viewport=p.getViewport({scale:width/original.width*scale});canvas.width=viewport.width;canvas.height=viewport.height;canvas.style.width=width+'px';canvas.style.height=viewport.height/scale+'px';renderTask=p.render({canvasContext:canvas.getContext('2d'),viewport});await renderTask.promise;if(!closed)status.textContent='Page '+page+' of '+pdf.numPages;}finally{busy=false;prev.disabled=page<=1;next.disabled=page>=pdf.numPages;}}
   prev.onclick=()=>{if(page>1&&!busy){page--;draw().catch(e=>{if(!closed)status.textContent=e.message;});}};next.onclick=()=>{if(page<pdf.numPages&&!busy){page++;draw().catch(e=>{if(!closed)status.textContent=e.message;});}};await draw();
  }catch(e){if(!closed)status.textContent='Unable to open file: '+e.message;}
 }
 return {list,upload,links,open};
}
const api={create,validate,MAX};if(typeof module!=='undefined')module.exports=api;else root.BNHomeworkFiles=api;
})(typeof window!=='undefined'?window:globalThis);
