/* Verified-membership navigation only. Never use a client-selected role as authority. */
(function(root){
 'use strict';
 function roleDestination(input){
  const {role,verified=false,membershipCount=0,search=''}=input||{};
  if(!verified || membershipCount!==1)return null;
  const params=new URLSearchParams(search);
  // Explicit module links from the full ERP must keep working. A bare
  // "staffPortal=1" is only an entry hint, never a reason to display a second,
  // mostly-empty Admin workspace. Authorization has already been verified.
  if(params.has('view'))return null;
  if(role==='school_admin')return './index.html?openSchool=true&tab=Dashboard';
  // Teachers, accountants and other staff retain their own role-bound portal.
  if(params.has('staffPortal'))return null;
  if(role==='librarian')return './library.html';
  return null;
 }
 function preferredView(role){
  return ({school_admin:'classes',principal:'classes',teacher:'attendance',accountant:'fees',librarian:'account',receptionist:'profiles',transport_staff:'notices'})[role]||'account';
 }
 const api=Object.freeze({roleDestination,preferredView});
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.BNSchoolRoleEntry=api;
})(typeof window!=='undefined'?window:globalThis);
