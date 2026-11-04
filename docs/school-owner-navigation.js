/* Bright Nexa School OS – owner information architecture.
 * Preserve all 24 menu destinations. Groups are navigational, NOT permissions.
 */
(function(root,factory){
  'use strict';const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.BrightNexaNavigation=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const GROUPS=[
    {title:'Overview',items:['Dashboard']},
    {title:'People & Admissions',items:['Students','Teachers','Non-Teaching Staff']},
    {title:'Academics',items:['Class & Section Setup','Attendance','Exams & Marks','Report Cards','Homework & Notices','AI Teacher Tools']},
    {title:'School Operations',items:['Transport & Routes','Infrastructure & Assets','Parent Messages']},
    {title:'Finance',items:['Fees','Expenses & Budget']},
    {title:'Insights & Growth',items:['School Quality Score','Growth Passport','Opportunity Desk']},
    {title:'Workspace',items:['School Profile','Teachers Online Access','Parents App','Smart Tools']},
    {title:'Administration',items:['Settings','Contact & Support']}
  ];
  const ALL=GROUPS.flatMap(g=>g.items);
  const LANDING=['Dashboard','Students','Attendance','Fees'];
  const defaults=()=>({density:'comfortable',landing:'Dashboard'});
  function prefs(p){
    return {density:p?.density==='compact'?'compact':'comfortable',
      landing:LANDING.includes(p?.landing)?p.landing:'Dashboard'};
  }
  function matching(query){
    const q=String(query??'').trim().toLocaleLowerCase('en');
    if(!q)return GROUPS.map(g=>({...g,items:g.items.slice()}));
    return GROUPS.map(g=>({...g,items:g.items.filter(x=>(x+' '+g.title).toLocaleLowerCase('en').includes(q))}))
      .filter(g=>g.items.length);
  }
  function preferenceKey(schoolId,ownerId){
    const safe=x=>String(x??'').toLowerCase().replace(/[^a-z0-9-]/g,'');
    if(!safe(schoolId)||!safe(ownerId))throw Error('Verified school and owner required for navigation preferences.');
    return 'bn_owner_ui_v2:'+safe(schoolId)+':'+safe(ownerId);
  }
  return {GROUPS,ALL,LANDING,defaults,prefs,matching,preferenceKey};
});