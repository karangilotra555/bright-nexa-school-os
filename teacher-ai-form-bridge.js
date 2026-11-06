/* AI Teacher Tools — optional suggestions, no separate Topic/Chapter form field.
 * This is a compatibility layer for the existing bundled React UI. It does not
 * replace its layout, components, permissions or AI authentication.
 */
(function () {
  'use strict';
  function normalize(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
    var request = Object.assign({}, input);
    var suggestions = String(request.instructions || '').trim();
    // The legacy UI includes a stale Topic/Chapter value even when the teacher
    // never requested it. Never let that hidden value drive generation.
    // The teacher's optional notes are the only source for a chapter/focus.
    request.topic = suggestions ? suggestions.slice(0, 200) : 'all';
    return request;
  }
  function bridgeAI() {
    var ai = window.BNSmartToolsAI;
    if (!ai || typeof ai.generate !== 'function' || ai.__bnOptionalTopicBridge) return;
    var original = ai.generate;
    ai.generate = function (input) {
      return original.call(ai, normalize(input));
    };
    ai.__bnOptionalTopicBridge = true;
  }
  function leafWithText(text) {
    var nodes = document.querySelectorAll('label, span, p, div');
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (node.children.length === 0 && (node.textContent || '').trim().toLowerCase() === text.toLowerCase()) return node;
    }
    return null;
  }
  function hideTopicField() {
    var label = leafWithText('Topic / Chapter');
    if (!label) return;
    // Locate the smallest parent owning only this field. Other controls stay
    // exactly where they are, and the React model is not restructured.
    var node = label;
    for (var i = 0; i < 5 && node; i++, node = node.parentElement) {
      var controls = node.querySelectorAll('input, textarea, select');
      if (controls.length === 1 && controls[0].tagName === 'INPUT') {
        node.style.display = 'none';
        node.setAttribute('aria-hidden', 'true');
        controls[0].tabIndex = -1;
        return;
      }
    }
    // Conservative fallback: don't hide an ancestor that contains other fields.
    label.style.display = 'none';
  }
  function updateSuggestions() {
    var label = leafWithText('Teacher Instructions');
    if (!label) label = leafWithText('Suggestions / Chapter (optional)');
    if (!label) return;
    var parent = label;
    var textarea = null;
    for (var i = 0; i < 6 && parent; i++, parent = parent.parentElement) {
      textarea = parent.querySelector('textarea');
      if (textarea) break;
    }
    if (!textarea) return;
    if (label.textContent.trim() !== 'Suggestions / Chapter (optional)') {
      label.textContent = 'Suggestions / Chapter (optional)';
    }
    var help = 'Optional: chapter/topic and any extra guidance, e.g. Food Components — use practical examples and easy language. Leave blank for general class-wise content.';
    if (textarea.placeholder !== help) textarea.placeholder = help;
    textarea.setAttribute('aria-label', 'Optional suggestions or chapter topic');
  }
  function apply() {
    bridgeAI();
    hideTopicField();
    updateSuggestions();
  }
  var scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(function () { scheduled = false; apply(); }, 60);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      apply();
      if (document.body) new MutationObserver(schedule).observe(document.body, {childList:true, subtree:true});
    }, {once:true});
  } else {
    apply();
    if (document.body) new MutationObserver(schedule).observe(document.body, {childList:true, subtree:true});
  }
  window.BNTeacherFormBridge = {normalize: normalize, apply: apply};
})();
