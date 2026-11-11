/* Bright Nexa: consistent passport-sized student/teacher photo viewing.
 * UI-only enhancement: never saves, changes or uploads a school record.
 * The existing form continues to own compression and Supabase confirmation.
 */
(function (root, doc) {
  'use strict';
  if (!doc || root.BNPortraitPreviewLoaded) return;
  root.BNPortraitPreviewLoaded = true;

  const VERSION = 'bn-passport-photo-v1';
  const PORTRAIT_LABEL = /\b(?:teacher photograph|student photograph|student photo|profile photo|passport photo|passport photograph)\b/i;
  const DOCUMENT_LABEL = /\b(?:aadhaar|aadhar|identity document|pan card|certificate)\b/i;
  let lastPhotoChoice = null;
  let draftUrl = null;
  let draftBox = null;
  let draftModal = null;

  const css = doc.createElement('style');
  css.id = VERSION;
  css.textContent = [
    '.student-cell img.bn-passport-list-photo{width:72px!important;height:96px!important;max-width:none!important;object-fit:contain!important;border-radius:6px;cursor:zoom-in;background:#edf2f8}',
    '.student-modal img.bn-passport-form-photo,[role="dialog"] img.bn-passport-form-photo,.modal-content img.bn-passport-form-photo{width:120px!important;height:160px!important;max-width:100%!important;object-fit:contain!important;border-radius:7px;cursor:zoom-in;background:#edf2f8}',
    '.bn-passport-clickable:focus-visible{outline:3px solid #1476c5;outline-offset:3px}',
    '.bn-passport-photo-dialog{border:0;border-radius:14px;padding:16px;background:white;color:#102640;box-shadow:0 18px 60px #0005;max-width:min(92vw,740px);max-height:94vh;overflow:auto}',
    '.bn-passport-photo-dialog::backdrop{background:#081d36bd}',
    '.bn-passport-photo-dialog header{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:12px}',
    '.bn-passport-photo-dialog header button,.bn-passport-draft button{font:inherit;cursor:pointer;border:1px solid #9db5cc;background:#eef4fa;border-radius:8px;padding:6px 10px}',
    '.bn-passport-photo-dialog img{display:block;max-width:100%;max-height:74vh;width:auto;height:auto;margin:auto;object-fit:contain}',
    '.bn-passport-draft{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:164px;box-sizing:border-box;background:white;border:1px solid #8eaac1;border-radius:12px;padding:10px;box-shadow:0 10px 35px #061a3640;color:#112b46;font:13px/1.4 system-ui,sans-serif}',
    '.bn-passport-draft img{display:block;width:120px;height:160px;object-fit:contain;margin:8px auto;background:#edf2f8;border-radius:6px}',
    '.bn-passport-draft small{display:block;color:#4c6177}',
    '@media(max-width:480px){.bn-passport-draft{right:8px;bottom:8px;width:148px;padding:7px}.bn-passport-draft img{width:120px;height:160px}}'
  ].join('');
  (doc.head || doc.documentElement).appendChild(css);

  function sourceOf(img) { return img.currentSrc || img.getAttribute('src') || img.src || ''; }
  function portraitType(img) {
    if (!img || img.tagName !== 'IMG' || !sourceOf(img)) return null;
    if (img.closest('.student-cell')) return 'list';
    if (!/^(?:data:image\/|blob:|https?:)/i.test(sourceOf(img))) return null;
    if (img.closest('.student-modal,[role="dialog"],.modal-content,.modal-dialog')) return 'form';
    return null;
  }
  function enhanceImages() {
    const rootNode = doc.querySelector('#root');
    if (!rootNode) return;
    rootNode.querySelectorAll('img').forEach(function (img) {
      const type = portraitType(img);
      if (!type) return;
      img.classList.add(type === 'list' ? 'bn-passport-list-photo' : 'bn-passport-form-photo');
      if (img.closest('button,a,[role="button"]')) return; // Existing React teacher viewer owns its click.
      img.classList.add('bn-passport-clickable');
      img.setAttribute('role', 'button');
      if (!img.hasAttribute('tabindex')) img.setAttribute('tabindex', '0');
      if (!img.hasAttribute('aria-label')) img.setAttribute('aria-label', 'Enlarge student or teacher photograph');
      img.title = 'Click to enlarge photograph';
    });
  }
  function openPhoto(img) {
    const source = sourceOf(img);
    if (!source || !portraitType(img)) return;
    const dialog = doc.createElement('dialog');
    dialog.className = 'bn-passport-photo-dialog';
    dialog.setAttribute('aria-label', 'Full-size student or teacher photograph');
    const heading = doc.createElement('header');
    const title = doc.createElement('strong');
    title.textContent = 'Photograph';
    const close = doc.createElement('button');
    close.type = 'button';
    close.textContent = 'Close';
    const photo = doc.createElement('img');
    photo.alt = img.alt || 'Full-size photograph';
    photo.src = source;
    heading.append(title, close);
    dialog.append(heading, photo);
    doc.body.appendChild(dialog);
    const finish = function () { if (dialog.open && typeof dialog.close === 'function') dialog.close(); dialog.remove(); };
    close.addEventListener('click', finish);
    dialog.addEventListener('close', finish, {once:true});
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }
  function photoButton(button) {
    if (!button || button.tagName !== 'BUTTON') return false;
    let ancestor = button;
    for (let depth = 0; depth < 4 && ancestor; depth++, ancestor = ancestor.parentElement) {
      const copy = (ancestor.textContent || '').trim();
      if (copy.length > 500) break;
      if (PORTRAIT_LABEL.test(copy) && !DOCUMENT_LABEL.test(copy)) return true;
    }
    return false;
  }
  function closeDraft() {
    if (draftUrl && root.URL && typeof root.URL.revokeObjectURL === 'function') root.URL.revokeObjectURL(draftUrl);
    draftUrl = null;
    if (draftBox) draftBox.remove();
    draftBox = null;
    draftModal = null;
  }
  function draftPhoto(file, modal) {
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
        !root.URL || typeof root.URL.createObjectURL !== 'function') return;
    closeDraft();
    draftUrl = root.URL.createObjectURL(file);
    draftModal = modal;
    const box = doc.createElement('aside');
    box.className = 'bn-passport-draft';
    box.setAttribute('role', 'status');
    const heading = doc.createElement('strong');
    heading.textContent = 'Photo preview';
    const close = doc.createElement('button');
    close.type = 'button';
    close.textContent = 'Close';
    close.setAttribute('aria-label', 'Close photo preview');
    close.addEventListener('click', closeDraft);
    const image = doc.createElement('img');
    image.src = draftUrl;
    image.alt = 'Selected photograph before saving';
    const help = doc.createElement('small');
    help.textContent = 'Preview only. Save the form to confirm in Supabase.';
    box.append(heading, close, image, help);
    doc.body.appendChild(box);
    draftBox = box;
  }
  doc.addEventListener('click', function (event) {
    const button = event.target.closest && event.target.closest('button');
    if (photoButton(button)) {
      lastPhotoChoice = {
        at: Date.now(),
        modal: button.closest('.student-modal,[role="dialog"],.modal-content,.modal-dialog'),
      };
    }
    const img = event.target.closest && event.target.closest('img');
    if (!img || !portraitType(img) || img.closest('button,a,[role="button"]')) return;
    event.preventDefault();
    openPhoto(img);
  }, true);
  doc.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const img = event.target;
    if (!portraitType(img) || img.closest('button,a,[role="button"]')) return;
    event.preventDefault();
    openPhoto(img);
  }, true);
  doc.addEventListener('change', function (event) {
    const input = event.target;
    if (!input || input.tagName !== 'INPUT' || input.type !== 'file') return;
    const file = input.files && input.files[0];
    if (!file) return;
    const hint = [input.id, input.name, input.getAttribute('aria-label'), input.closest('label')?.textContent].join(' ');
    const marked = PORTRAIT_LABEL.test(hint) && !DOCUMENT_LABEL.test(hint);
    const modal = input.closest('.student-modal,[role="dialog"],.modal-content,.modal-dialog');
    const recent = lastPhotoChoice && Date.now() - lastPhotoChoice.at < 90000 &&
      (!lastPhotoChoice.modal || lastPhotoChoice.modal === modal);
    if (!marked && !recent) return; // Aadhaar and other uploads are left untouched.
    lastPhotoChoice = null;
    draftPhoto(file, modal);
  }, true);

  let scanQueued = false;
  function scan() {
    if (scanQueued) return;
    scanQueued = true;
    root.queueMicrotask(function () {
      scanQueued = false;
      enhanceImages();
      if (draftBox && draftModal && !draftModal.isConnected) closeDraft();
    });
  }
  const observer = new MutationObserver(scan);
  observer.observe(doc.documentElement, {subtree:true,childList:true,attributes:true,attributeFilter:['src']});
  scan();
})(typeof window !== 'undefined' ? window : globalThis, typeof document !== 'undefined' ? document : null);
