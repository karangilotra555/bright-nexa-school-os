/* Presentation copy for verified school owners only.
 * The bundled School OS remains browser-local. This script only changes
 * displayed names / sample labels; it never alters records or access rules.
 */
(() => {
  'use strict';
  const map = [
    [/Bright Nexa Model School/gi, 'Haridwar Public School'],
    [/Bright Nexa Model Sch(?=\u2026|\.\.\.)/gi, 'Haridwar Public School'],
    [/Good morning, Rajesh/gi, 'Good morning'],
    [/Good afternoon, Rajesh/gi, 'Good afternoon'],
    [/Good evening, Rajesh/gi, 'Good evening'],
    [/Rajesh Sharma/g, 'School Owner'],
    [/PUBLIC DEMO/gi, 'SCHOOL WORKSPACE'],
    [/Isolated demo\s*[-—]\s*sample records only/gi, 'Presentation records • stored in this browser'],
    [/Isolated demo/gi, 'Presentation workspace'],
    [/Sample Owner Workspace/gi, 'School workspace']
  ];
  let scheduled=false;
  function updateLabels(){
    scheduled=false;
    const root=document.getElementById('root');
    if(!root)return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode()){
      const n=walker.currentNode;
      if(n.parentElement?.closest('script,style,textarea,input,[contenteditable="true"]'))continue;
      nodes.push(n);
    }
    for(const n of nodes){
      let next=n.nodeValue;
      for(const [re,text] of map)next=next.replace(re,text);
      if(next!==n.nodeValue)n.nodeValue=next;
    }
  }
  function schedule(){
    if(scheduled)return;
    scheduled=true;
    window.requestAnimationFrame(updateLabels);
  }
  const root=document.getElementById('root');
  if(root){
    new MutationObserver(schedule).observe(root,{childList:true,subtree:true,characterData:true});
    schedule();
  }
})();
