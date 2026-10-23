/* Dashboard quick-access to the existing student ID card print module.
   The generator reads the current browser workspace; this does not add cloud sync. */
(() => {
  const target = './id-card-a4.html';
  const smartTarget = './smart-tools.html';
  let scheduled = false;
  function update() {
    scheduled = false;
    const root = document.getElementById('root');
    if (!root) return;
    const isDashboard = /(?:^|[\/#])dashboard(?:[/?#]|$)/i.test(location.hash + location.pathname) ||
      [...root.querySelectorAll('h1,h2')].some(n => /^dashboard$/i.test((n.textContent || '').trim()));
    const old = document.getElementById('bn-id-card-dashboard-shortcut');
    const smartOld = document.getElementById('bn-smart-tools-dashboard-shortcut');
    if (!isDashboard || document.getElementById('entryStatus')) { if (old) old.remove(); if (smartOld) smartOld.remove(); return; }
    if (old && smartOld) return;
    const heading = [...root.querySelectorAll('h1,h2')].find(n => /^dashboard$/i.test((n.textContent || '').trim()));
    if (!heading) return;
    const card = document.createElement('a');
    card.id = 'bn-id-card-dashboard-shortcut';
    card.href = target;
    card.setAttribute('aria-label', 'Open ID Card Generator');
    card.innerHTML = '<span aria-hidden="true" style="font-size:23px">🪪</span><span><strong style="display:block;font-size:14px">ID Card Generator</strong><small style="display:block;font-size:11px;opacity:.85">Student cards · A4 bulk print</small></span><span aria-hidden="true" style="margin-left:auto;font-size:19px">→</span>';
    card.style.cssText = 'display:flex;align-items:center;gap:12px;max-width:350px;margin:14px 0;padding:14px 18px;background:linear-gradient(110deg,#0b3966,#087cc0);border-radius:14px;color:white;text-decoration:none;box-shadow:0 6px 18px #073c6d24;';
    if (!old) heading.insertAdjacentElement('afterend', card);
    if (!smartOld) {
      const smart = card.cloneNode(true);
      smart.id = 'bn-smart-tools-dashboard-shortcut';
      smart.href = smartTarget;
      smart.setAttribute('aria-label', 'Open Smart Tools');
      smart.children[0].textContent = '🧠';
      smart.children[1].children[0].textContent = 'Smart Tools';
      smart.children[1].children[1].textContent = 'Timetable · Substitute · Analysis · Import · Audit';
      (old || card).insertAdjacentElement('afterend', smart);
    }
  }
  function queue() { if (!scheduled) { scheduled = true; requestAnimationFrame(update); } }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', queue, {once:true});
  else queue();
  new MutationObserver(queue).observe(document.documentElement, {subtree:true,childList:true});
  window.addEventListener('hashchange', queue);
})();
