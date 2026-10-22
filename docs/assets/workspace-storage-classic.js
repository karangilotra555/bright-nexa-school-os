(function(){
// Demo state is tab-scoped; persisted sample records never use school keys.
const DEMO_MODE_KEY = 'bright-nexa-school-os:demo-mode:v1';
const SESSION_KEY = 'bright-nexa-school-os:session:v2';
const DEMO_PREFIX = 'bright-nexa-demo:';
let demoWorkspace = false;
try {
  demoWorkspace = window.sessionStorage.getItem(DEMO_MODE_KEY) === 'true' ||
    JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || 'null')?.demo === true;
} catch (_) { /* Unavailable storage is reported by the normal app handlers. */ }
const workspaceStorage = {
  getItem(key) { return window.localStorage.getItem(demoWorkspace ? DEMO_PREFIX + key : key); },
  setItem(key, value) { window.localStorage.setItem(demoWorkspace ? DEMO_PREFIX + key : key, value); },
  removeItem(key) { window.localStorage.removeItem(demoWorkspace ? DEMO_PREFIX + key : key); }
};
function workspaceDatabaseName(name) { return demoWorkspace ? name + '-demo' : name; }
function isDemoWorkspace() { return demoWorkspace; }
function beginDemoWorkspace() {
  // Fail before any data writes if the tab cannot retain its mode on reload.
  window.sessionStorage.setItem(DEMO_MODE_KEY, 'true');
  demoWorkspace = true;
}
function endDemoWorkspace() {
  window.sessionStorage.removeItem(DEMO_MODE_KEY);
  window.sessionStorage.removeItem(SESSION_KEY);
  demoWorkspace = false;
}

window.BrightNexaWorkspace = {workspaceStorage, isDemoWorkspace};
})();
