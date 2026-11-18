/* The native bridge exists only in the supported Android app. */
(function(root){
'use strict';
const isId=value=>typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
function create({bridge,register,button,status,uuid=()=>root.crypto.randomUUID()}){
 if(!bridge||!button||!status)return null;
 let scope=null, pending=null, active=null, dbOperation=Promise.resolve();
 const show=message=>{status.textContent=message;};
 function update(){
  button.hidden=!scope;
  button.disabled=Boolean(pending);
  button.textContent=active?'Turn off urgent alerts':'Enable urgent alerts';
 }
 function send(action,owner,extra={}){
  bridge.postMessage(JSON.stringify({action,school:owner?.school,member:owner?.member,...extra}));
 }
 function clear(){
  const previous=scope,device=active;
  scope=null;pending=null;active=null;
  send('clear',previous);
  if(device){
   const revocation=device.revoke().catch(()=>{});
   dbOperation=Promise.all([dbOperation,revocation]);
  }
  show('');update();
 }
 function ask(action){
  if(!scope||pending)return;
  pending={nonce:uuid(),owner:scope};
  send(action,scope,{nonce:pending.nonce});update();
 }
 function setScope(next){
  if(!next||!isId(next.school)||!isId(next.member)){clear();return;}
  if(next.school===scope?.school&&next.member===scope?.member)return;
  if(scope)clear();
  scope=next;update();ask('resume');
 }
 bridge.onmessage=async event=>{
  let result;
  try{result=JSON.parse(event.data);}catch(_){return;}
  const expected=pending;
  if(!expected||result.nonce!==expected.nonce||scope!==expected.owner)return;
  try{
   if(result.status!=='ready'){
    active=null;
    show(({
     denied:'Allow notifications for Bright Nexa in Android settings.',
     unconfigured:'Urgent alerts are unavailable in this app build.',
     error:'Could not connect to urgent alerts. Try again.'
    })[result.status]||'');
    return;
   }
   if(!isId(result.installation)||typeof result.token!=='string'||!result.token)throw Error('Invalid device');
   const registerCurrent=async()=>{
    if(pending!==expected||scope!==expected.owner)return;
    const device=await register(expected.owner,result,expected.nonce);
    if(!isId(device.binding)||typeof device.revoke!=='function')throw Error('Invalid registration');
    if(pending!==expected||scope!==expected.owner){await device.revoke();return;}
    active=device;
    send('bind',scope,{binding:device.binding});
    show('Urgent alerts are on for this phone.');
   };
   const operation=dbOperation.then(registerCurrent);
   dbOperation=operation.catch(()=>{});
   await operation;
  }catch(_){
   if(pending===expected)show('The school could not confirm urgent alerts. Try again.');
  }finally{
   if(pending===expected){pending=null;update();}
  }
 };
 button.addEventListener('click',()=>{
  if(!active){ask('enable');return;}
  const previous=scope;
  clear();scope=previous;update();show('Urgent alerts are off for this phone.');
 });
 update();
 return {setScope,clear,resume:()=>ask('resume')};
}
if(typeof module!=='undefined')module.exports={create};else root.BNUrgentCircularAlerts={create};
})(typeof window!=='undefined'?window:globalThis);
