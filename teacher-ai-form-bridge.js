/* AI Teacher Tools — optional suggestions, no separate Topic/Chapter form field.
 * This is a compatibility layer for the existing bundled React UI. It does not
 * replace its layout, components, permissions or AI authentication.
 */
(function () {
  'use strict';
  function normalize(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
    var request = Object.assign({}, input);
    // The legacy UI includes a stale Topic/Chapter value even when the teacher
    // never requested it. Never let that hidden value drive generation.
    // The teacher's optional notes are the only source for a chapter/focus.
    delete request.topic;
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
  // A compact native picker replaces ten always-visible tool buttons.
  // Original React buttons remain in the DOM and receive their own onClick,
  // keeping every existing generator, permission, form, and save workflow.
  var groups = [
    ['Teaching & Homework', ['Lesson Plan Generator','Homework Generator','Worksheet Generator','Activity Ideas Generator']],
    ['Exams & Assessments', ['Question Paper Generator','Class Test Generator']],
    ['Student Support & Communication', ['Student Remark Generator','Weak Student Remedial Plan','Parent Message Generator','School Notice Generator']]
  ];
  var names = groups.reduce(function(all,g){return all.concat(g[1]);},[]);
  function compactToolNav(){
    var menus=document.querySelectorAll('aside');
    for(var i=0;i<menus.length;i++){
      var aside=menus[i],buttons=Array.prototype.slice.call(aside.querySelectorAll('button'));
      var toolButtons=buttons.filter(function(button){return names.indexOf((button.textContent||'').trim())>=0;});
      if(toolButtons.length!==names.length)continue;
      var panel=aside.querySelector('[data-bn-ai-tool-picker]');
      if(!panel){
        panel=document.createElement('div');
        panel.setAttribute('data-bn-ai-tool-picker','1');
        panel.style.cssText='padding:12px 10px 14px;box-sizing:border-box;width:100%';
        var label=document.createElement('label');
        label.textContent='Choose AI generator';
        label.setAttribute('for','bn-ai-tool-selection');
        label.style.cssText='font-size:13px;font-weight:700;display:block;margin-bottom:7px;color:#102640';
        var select=document.createElement('select');
        select.id='bn-ai-tool-selection';
        select.setAttribute('aria-label','Choose AI generator');
        select.style.cssText='width:100%;max-width:100%;box-sizing:border-box;padding:10px 8px;border:1px solid #ccdbe9;border-radius:9px;background:#fff;color:#102640;font-size:13px';
        groups.forEach(function(group){
          var optgroup=document.createElement('optgroup');
          optgroup.label=group[0];
          group[1].forEach(function(name){
            var opt=document.createElement('option');opt.value=name;opt.textContent=name;optgroup.appendChild(opt);
          });
          select.appendChild(optgroup);
        });
        select.addEventListener('change',function(){
          var buttonsNow=Array.prototype.slice.call(aside.querySelectorAll('button'));
          var selected=buttonsNow.find(function(b){return (b.textContent||'').trim()===select.value;});
          if(selected)selected.click(); // preserve React's original tool switch
        });
        panel.appendChild(label);panel.appendChild(select);
        aside.insertBefore(panel,aside.firstChild);
      }
      toolButtons.forEach(function(button){
        if(button.style.display!=='none')button.style.setProperty('display','none','important');
        if(button.getAttribute('aria-hidden')!=='true')button.setAttribute('aria-hidden','true');
        if(button.tabIndex!==-1)button.tabIndex=-1;
      });
      var select=panel.querySelector('select');
      var headings=Array.prototype.slice.call(document.querySelectorAll('h1,h2,h3,h4'));
      var visible=headings.find(function(h){return names.indexOf((h.textContent||'').trim())>=0;});
      var active=visible&&(visible.textContent||'').trim();
      if(!active){
        var chosen=toolButtons.find(function(b){return b.classList.contains('active')||b.getAttribute('aria-pressed')==='true';});
        active=chosen&&(chosen.textContent||'').trim();
      }
      if(active&&select.value!==active)select.value=active;
      return;
    }
  }
  function apply() {
    bridgeAI();
    hideTopicField();
    updateSuggestions();
    compactToolNav();
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
