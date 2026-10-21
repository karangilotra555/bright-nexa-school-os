/* Marketing-only copy patch for the published static demo.
   This does not pretend that local browser records are cloud-synced. */
(() => {
  const replacements = new Map([
    ['WELCOME TO BRIGHT NEXA', 'BRIGHT NEXA  ·  SCHOOL OS'],
    ['Start your institution workspace', 'Your school. One smart workspace.'],
    ['Offline-first', 'School Management'],
    ['Online School OS', 'School Management'],
    ['Daily school work without internet', 'Explore school administration features'],
    ['Cloud-based school management is the goal', 'Explore school administration features'],
    ['No connected service can lock your records', 'School records and access controls in one place'],
    ['School-owned data', 'School Data Management'],
    ['Cost protected', 'Simple Pricing'],
    ['No provider call without credits or BYOK', 'Transparent plans for schools'],
    ['without internet', 'with an internet connection'],
    ['offline-first', 'online school management'],
    ['Offline mode', 'Online access'],
    ['The core system remains available without internet access or paid providers.', 'Explore the school management demo. Secure multi-user cloud storage and synchronization are not yet enabled.'],
    ['Run complete school operations securely on this device.', 'Explore Bright Nexa School OS in a demonstration workspace.']
  ]);
  let queued = false;
  function refresh() {
    queued = false;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (n.parentElement && /^(SCRIPT|STYLE|TEXTAREA|INPUT)$/.test(n.parentElement.tagName)) continue;
      const old = n.nodeValue;
      let next = old;
      for (const [before, after] of replacements) next = next.replaceAll(before, after);
      if (next !== old) nodes.push([n, next]);
    }
    for (const [node, value] of nodes) node.nodeValue = value;
  }
  function queue() {
    if (!queued) {
      queued = true;
      requestAnimationFrame(refresh);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', queue, {once:true});
  else queue();
  new MutationObserver(queue).observe(document.documentElement, {childList:true, subtree:true, characterData:true});
})();
