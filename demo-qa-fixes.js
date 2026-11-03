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
  function feeDialogFrom(element) {
    return element?.closest?.('section.simple-modal[role="dialog"][aria-label="Receive Student Fee"]') || null;
  }
  function cashierField(dialog) {
    if (!dialog) return null;
    const byPlaceholder = dialog.querySelector('input[placeholder="Cashier or authorised person"]');
    if (byPlaceholder) return byPlaceholder;
    const label = [...dialog.querySelectorAll('label.form-field')]
      .find(node => /^\s*Received By\s*$/i.test(node.querySelector('span')?.textContent || ''));
    return label?.querySelector('input') || null;
  }
  function cashierError(dialog) {
    const field = cashierField(dialog);
    if (field) {
      field.required = true;
      field.setAttribute('aria-required','true');
      field.setAttribute('aria-invalid','true');
      field.focus();
    }
    const footer = dialog.querySelector('.modal-actions') || dialog;
    let info = dialog.querySelector('[data-demo-cashier-error]');
    if (!info) {
      info = document.createElement('p');
      info.dataset.demoCashierError = 'true';
      info.setAttribute('role','alert');
      info.style.cssText = 'color:#9d241f;border-left:3px solid #d45438;padding:8px 10px;font-size:13px;margin:8px 0;background:#fff0eb;';
      footer.insertAdjacentElement('beforebegin',info);
    }
    info.textContent = 'Received By is required. Enter the cashier or authorised person before creating a fee receipt.';
  }
  function enforceFeeCashierOnSubmit(event) {
    const dialog = feeDialogFrom(event.target);
    if (!dialog) return;
    const cashier = cashierField(dialog);
    if (cashier && cashier.value.trim()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cashierError(dialog);
  }
  // Capture both click (React handlers) and actual HTML form submit so blank cashier
  // cannot generate even a browser-local demo receipt.
  document.addEventListener('submit',enforceFeeCashierOnSubmit,true);
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
    const feeButton = findButton(event, 'Save Payment & Create Receipt');
    if (feeButton) enforceFeeCashierOnSubmit(event);
    const saveStudent = findButton(event, 'Save Student');
    if (saveStudent) {
      const modal = modalFor(saveStudent);
      if (!modal) return;
      const fields = [...modal.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]),textarea,select')].filter(field => !field.disabled);
      const unfilled = fields.filter(field => !String(field.value || '').trim());
      // Intercept the known silent all-blank submit. The original form remains responsible
      // for valid submissions, keeping React state and validation unchanged.
      const textFields=fields.filter(field=>field.matches('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]),textarea'));
      const blankInputs=textFields.length && textFields.every(field => !String(field.value || '').trim());
      if (blankInputs) {
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
  function studentTable() {
    // Works with the actual rendered table; no reliance on framework-specific CSS classes.
    return [...root.querySelectorAll('table')].find(t => {
      const headings=[...t.querySelectorAll('thead th')].map(h => h.textContent.trim().toLowerCase());
      return headings.some(h => h.includes('student')) &&
             headings.some(h => h.includes('admission')) &&
             headings.some(h => h.includes('parent') || h.includes('guardian'));
    }) || null;
  }
  function maskPhoneText(text) {
    // Presentation-only redaction. Original sample data remains unchanged.
    return String(text || '').replace(/\b([6-9]\d{2})\d{5}(\d{2})\b/g, '$1*****$2');
  }
  function maskDemoProfiles() {
    // The real demo uses section.student-profile-modal in a portal beneath body.
    // Redact only contact display values; never modify React form inputs or stored data.
    const dialogs=document.querySelectorAll('section.student-profile-modal[role="dialog"], [role="dialog"][aria-label="Student Profile"]');
    for (const dialog of dialogs) {
      const fields=dialog.querySelectorAll('.profile-detail-grid-item');
      for (const field of fields) {
        const caption=field.querySelector('.profile-detail-label');
        const value=field.querySelector('.profile-detail-value');
        if (!caption || !value) continue;
        if (!/(?:parent|mother|father|guardian|student|emergency)?\s*(?:mobile|phone|contact|whatsapp)/i.test(caption.textContent || '')) continue;
        if (value.querySelector('input,select,textarea,button,[contenteditable="true"]')) continue;
        const safe=maskPhoneText(value.textContent);
        if (value.textContent !== safe) value.textContent=safe;
      }
    }
  }
  function prepareFeeDialog() {
    for (const dialog of document.querySelectorAll('section.simple-modal[role="dialog"][aria-label="Receive Student Fee"]')) {
      const field=cashierField(dialog);
      if (!field) continue;
      field.required=true;
      field.setAttribute('aria-required','true');
      if (field.dataset.demoFeeGuard==='1') continue;
      field.dataset.demoFeeGuard='1';
      field.addEventListener('input',()=>{
        if (field.value.trim()) {
          field.removeAttribute('aria-invalid');
          dialog.querySelector('[data-demo-cashier-error]')?.remove();
        }
      });
    }
  }
  function improveDemo() {
    const table=studentTable();
    if (!table) { knownSignature=''; return; }
    const tbody=table.tBodies && table.tBodies[0] || table.querySelector('tbody');
    if (!tbody) return;
    const rows=[...tbody.querySelectorAll(':scope > tr')];
    if (!rows.length) { knownSignature=''; return; }
    const guardianHeading=[...table.querySelectorAll('thead th')].findIndex(h => /parent|guardian/i.test(h.textContent));
    if (guardianHeading >= 0) {
      // Public demo only. Mask display text; never alter school or demo records in storage.
      for (const row of rows) {
        const cell=row.cells && row.cells[guardianHeading];
        if (!cell) continue;
        const walker=document.createTreeWalker(cell,NodeFilter.SHOW_TEXT);
        let node;
        while ((node=walker.nextNode())) {
          if (/\b[6-9]\d{9}\b/.test(node.nodeValue)) {
            node.nodeValue=node.nodeValue.replace(/\b([6-9]\d{2})\d{5}(\d{2})\b/g,'$1*****$2');
          }
        }
      }
    }
    const signature=rows.length+':'+rows.map(row=>(row.cells?.[0]?.textContent||'').trim()).join('|');
    if(signature!==knownSignature){page=0;knownSignature=signature;}
    let pager=table.nextElementSibling;
    if (!pager || !pager.matches('[data-demo-qa-pager]')) {
      pager=document.createElement('div');
      pager.dataset.demoQaPager='true';
      pager.style.cssText='display:flex;align-items:center;gap:12px;justify-content:flex-end;margin:12px 0;font-size:13px;flex-wrap:wrap;';
      table.insertAdjacentElement('afterend',pager);
    }
    const max=Math.ceil(rows.length/PAGE_SIZE);
    if (max<=1) {
      pager.hidden=true; rows.forEach(row=>row.style.display='');
      return;
    }
    pager.hidden=false;
    page=Math.max(0,Math.min(page,max-1));
    rows.forEach((row,index)=>{row.style.display=index>=page*PAGE_SIZE && index<(page+1)*PAGE_SIZE?'':'none';});
    const renderKey=signature+':'+page;
    if(pager.dataset.renderKey===renderKey) return;
    pager.dataset.renderKey=renderKey;
    pager.replaceChildren();
    const prev=document.createElement('button'),next=document.createElement('button'),count=document.createElement('span');
    prev.type=next.type='button';
    prev.textContent='Previous';next.textContent='Next';
    prev.disabled=page===0;next.disabled=page===max-1;
    count.textContent='Page '+(page+1)+' of '+max+' · '+rows.length+' students';
    for(const button of [prev,next]){
      button.style.cssText='background:#edf5fc;border:1px solid #95afc3;border-radius:8px;padding:7px 12px;color:#15385c;cursor:pointer;';
    }
    prev.addEventListener('click',()=>{page--;improveDemo();});
    next.addEventListener('click',()=>{page++;improveDemo();});
    pager.append(prev,count,next);
  }
  let pending = false;
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; improveDemo(); maskDemoProfiles(); prepareFeeDialog(); });
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  improveDemo();
  maskDemoProfiles();
  prepareFeeDialog();
})();
