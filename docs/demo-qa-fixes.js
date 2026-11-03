/* Demo-only UX guardrails. Does not authenticate users or write to school APIs.
 * The sample app is a prebuilt bundle; keep these improvements isolated from live records.
 */
(() => {
  'use strict';
  const root = document.getElementById('root');
  if (!root) return;
  const label = element => (element.textContent || '').trim().replace(/\s+/g, ' ');
  const isButton = (element, text) => element && element.matches('button,[role="button"]') && label(element) === text;
  function findButton(event, text) {
    const button = event.target.closest?.('button,[role="button"]');
    return isButton(button, text) ? button : null;
  }
  function message(button, text) {
    let box = button.parentElement.querySelector('[data-demo-qa-message]');
    if (!box) {
      box = document.createElement('p');
      box.dataset.demoQaMessage = 'true';
      box.setAttribute('role', 'alert');
      box.style.cssText = 'background:#fff3dd;color:#713b06;border:1px solid #edbc79;padding:9px 12px;border-radius:8px;font-size:13px;margin:8px 0;';
      button.insertAdjacentElement('afterend', box);
    }
    box.textContent = text;
  }
  function modalFor(button) {
    const direct = button.closest('[role="dialog"],.modal,.modal-content,[class*="modal"]');
    if (direct) return direct;
    let node = button.parentElement;
    for (let i = 0; i < 7 && node && node !== root; i++, node = node.parentElement) {
      if (node.textContent.includes('Add New Student') && node.textContent.includes('Cancel')) return node;
    }
    return null;
  }
  document.addEventListener('click', event => {
    const saveStudent = findButton(event, 'Save Student');
    if (saveStudent) {
      const modal = modalFor(saveStudent);
      if (!modal) return;
      const fields = [...modal.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]),textarea,select')].filter(field => !field.disabled);
      const unfilled = fields.filter(field => !String(field.value || '').trim());
      // Intercept the known silent all-blank submit. The original form remains responsible
      // for valid submissions, keeping React state and validation unchanged.
      if (fields.length && unfilled.length === fields.length) {
        event.preventDefault();
        event.stopImmediatePropagation();
        message(saveStudent, 'Student not saved. Complete the required student and parent fields before saving.');
        const first = unfilled[0];
        first.setAttribute('aria-invalid', 'true');
        first.focus();
        return;
      }
    }
    const saveAttendance = findButton(event, 'Save Marked Records');
    if (saveAttendance) {
      const selected = root.querySelectorAll('button.selected.present,button.selected.absent,button.selected.late,button.selected.leave');
      if (!selected.length) {
        event.preventDefault();
        event.stopImmediatePropagation();
        message(saveAttendance, 'No attendance selected. Mark at least one student Present, Absent, Late or Leave, then save.');
      }
    }
  }, true);

  const PAGE_SIZE = 10;
  let page = 0;
  let knownSignature = '';
  function improveDemo() {
    // Mask only displayed sample phone numbers, never modify source data.
    for (const row of root.querySelectorAll('.student-row')) {
      const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (/\b[6-9]\d{9}\b/.test(node.nodeValue)) {
          node.nodeValue = node.nodeValue.replace(/\b([6-9]\d{2})\d{5}(\d{2})\b/g, '$1*****$2');
        }
      }
    }
    const rows = [...root.querySelectorAll('.student-row')];
    if (!rows.length) { knownSignature = ''; return; }
    const parent = rows[0].parentElement;
    if (!parent || !rows.every(row => row.parentElement === parent)) return;
    const signature = String(rows.length) + ':' + rows.map(row => row.textContent.slice(0,32)).join('|');
    if (signature !== knownSignature) { page = 0; knownSignature = signature; }
    let pager = parent.nextElementSibling;
    if (!pager || !pager.matches('[data-demo-qa-pager]')) {
      pager = document.createElement('div');
      pager.dataset.demoQaPager = 'true';
      pager.style.cssText = 'display:flex;align-items:center;gap:12px;justify-content:flex-end;margin:12px 0;font-size:13px;';
      parent.insertAdjacentElement('afterend', pager);
    }
    const max = Math.ceil(rows.length / PAGE_SIZE);
    if (max <= 1) { pager.hidden = true; rows.forEach(row => { row.style.display = ''; }); return; }
    pager.hidden = false;
    page = Math.min(page, max - 1);
    rows.forEach((row, index) => { row.style.display = index >= page * PAGE_SIZE && index < (page + 1) * PAGE_SIZE ? '' : 'none'; });
    pager.replaceChildren();
    const prev = document.createElement('button'), next = document.createElement('button'), text = document.createElement('span');
    prev.type = next.type = 'button';
    prev.textContent = 'Previous'; next.textContent = 'Next';
    prev.disabled = page === 0; next.disabled = page >= max - 1;
    text.textContent = 'Page ' + (page + 1) + ' of ' + max + ' · ' + rows.length + ' students';
    prev.addEventListener('click', () => { page--; improveDemo(); });
    next.addEventListener('click', () => { page++; improveDemo(); });
    pager.append(prev, text, next);
  }
  let pending = false;
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; improveDemo(); });
  });
  observer.observe(root, { childList: true, subtree: true });
  improveDemo();
})();
