/* Verified-membership navigation only. Never use a client-selected role as authority. */
(function(root){
 'use strict';
 function roleDestination(input){
  const {role,verified=false,membershipCount=0,search=''}=input||{};
  if(!verified || membershipCount!==1)return null;
  const params=new URLSearchParams(search);
  // Staff deep links must remain accessible for timetable, profile, permissions,
  // and for explicit visits from the existing ERP navigation.
  if(params.has('view')||params.has('staffPortal'))return null;
  if(role==='school_admin')return './index.html?openSchool=true&tab=Dashboard';
  if(role==='librarian')return './library.html';
  return null;
 }
 function preferredView(role){
  return ({school_admin:'dashboard',principal:'classes',teacher:'attendance',accountant:'fees',librarian:'account',receptionist:'profiles',transport_staff:'notices'})[role]||'account';
 }
 const api=Object.freeze({roleDestination,preferredView});
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.BNSchoolRoleEntry=api;
})(typeof window!=='undefined'?window:globalThis);
