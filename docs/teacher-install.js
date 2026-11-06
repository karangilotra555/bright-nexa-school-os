/* Install helper: no school data is cached locally by this script. */
(function(){'use strict';
 const button=document.getElementById('installTeacherApp');if(!button)return;
 let pending=null;
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();pending=event;button.classList.remove('hidden');});
 button.addEventListener('click',async()=>{if(!pending)return;const prompt=pending;pending=null;button.classList.add('hidden');try{await prompt.prompt();await prompt.userChoice;}catch(_){}});
 window.addEventListener('appinstalled',()=>{pending=null;button.classList.add('hidden');});
 if('serviceWorker' in navigator&&window.isSecureContext)window.addEventListener('load',()=>{navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});},{once:true});
})();
