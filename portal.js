'use strict';
let activeStudent = null;
let loginPending = false;
let authGeneration = 0;
let verificationGeneration = 0;
let deploymentIsDemo = false;
const $ = id => document.getElementById(id);
const value = input => input == null || input === '' ? 'Not available' : String(input);
const DEMO_STUDENT = Object.freeze({name:'DEMO STUDENT', admissionNumber:'DEMO-ONLY', className:'Sample class', section:'A'});
function clearToken() { try { sessionStorage.removeItem('bn_portal_token'); } catch (_) {} }
function showView(id) {
  for (const view of ['loginView','dashboardView','verificationView','schoolProfileView']) $(view).style.display = view === id ? 'block' : 'none';
}
async function api(url, options = {}) {
  const response = await fetch(url, {...options, cache:'no-store', signal:AbortSignal.timeout(15000)});
  if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('Service unavailable. Please try again later or contact the school office.');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.message || 'Request could not be completed.');
  return data;
}
async function loadSchoolProfile() {
  $('schoolStatus').textContent = 'Loading school details…';
  try {
    let profile;
    try { profile = await api('/api/school-profile'); }
    catch (_) { profile = await api('school-profile.json'); }
    const {institution} = profile;
    const demoOnly = profile.deploymentMode === 'demo';
    deploymentIsDemo = demoOnly;
    $('loginForm').hidden = demoOnly;
    $('loginTitle').textContent = demoOnly ? 'Explore the student portal' : 'Student & Parent Login';
    $('loginInfo').style.display = demoOnly ? 'block' : 'none';
    $('loginInfo').textContent = demoOnly ? 'Demo mode: explore a fictional student profile below. Real student login and official records are not connected on this site.' : '';
    if (!institution || typeof institution.name !== 'string') throw new Error('School details unavailable.');
    for (const [id,key] of Object.entries({schoolName:'name',schoolTagline:'tagline',schoolAddress:'address',schoolPhone:'phone',schoolEmail:'email',schoolSession:'session',schoolPrincipal:'principalName'})) $(id).textContent = value(institution[key]);
    $('navSchoolName').textContent = institution.name;
    $('cardSchoolName').textContent = institution.name;
    $('cardSession').textContent = 'Session: ' + value(institution.session);
    $('schoolStatus').textContent = demoOnly ? 'Demo portal • Profile details are not verified. Confirm current contacts and school information with the school office.' : '';
  } catch (_) { $('schoolStatus').textContent = 'School details are unavailable. Please try again later.'; }
}
function routePortal() {
  verificationGeneration++;
  const route = window.location.hash;
  if (route === '#/school-profile') { showView('schoolProfileView'); return; }
  if (route === '#/login') { showLoginScreen(); return; }
  if (activeStudent) {
    showView('dashboardView');
    switchTab(['#/marksheet','#/fees','#/attendance'].includes(route) ? 'tab-' + route.slice(2) : 'tab-idcard', false);
    return;
  }
  const params = new URLSearchParams(window.location.search);
  const adm = params.get('adm') || params.get('admission') || params.get('id');
  if (params.get('action') === 'verify' && adm) { showPublicVerification(adm, params.get('sig')); return; }
  showLoginScreen();
  if (adm) $('admInput').value = adm;
}
function initPortal() {
  clearToken(); // A refresh requires fresh authentication; never revive browser-local records.
  routePortal();
  return loadSchoolProfile();
}
function showLoginScreen() {
  showView('loginView');
  $('loginInfo').style.display = deploymentIsDemo ? 'block' : 'none';
}
function showLoginFromVerification(adm) {
  verificationGeneration++;
  window.location.hash = '#/login';
  showLoginScreen();
  $('admInput').value = adm || '';
  $('dobInput').value = '';
  $('dobInput').focus();
}
function showLoginError(message) {
  $('loginAlert').textContent = message;
  $('loginAlert').style.display = 'block';
}
async function handleLogin(event) {
  event.preventDefault();
  if (loginPending) return;
  clearToken();
  activeStudent = null;
  const admissionNumber = $('admInput').value.trim();
  const dob = $('dobInput').value.trim();
  $('loginAlert').style.display = 'none';
  if (!admissionNumber || !dob) { showLoginError('Enter your admission number and date of birth.'); return; }
  const generation = ++authGeneration;
  loginPending = true;
  $('loginButton').disabled = true;
  $('loginButton').textContent = 'Signing in…';
  try {
    const data = await api('/api/auth/login', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({admissionNumber,dob})});
    if (generation !== authGeneration) return;
    if (!data.token || !data.student || !data.student.admissionNumber) throw new Error('Service unavailable. Please contact the school office.');
    sessionStorage.setItem('bn_portal_token', data.token);
    loginStudent(data.student);
  } catch (error) {
    if (generation === authGeneration) {
      clearToken();
      showLoginError(error.message === 'Failed to fetch' || error.message === 'offline' || error.name === 'TimeoutError' ? 'Login service unavailable. Please try again later.' : error.message);
    }
  } finally {
    loginPending = false;
    $('loginButton').disabled = false;
    $('loginButton').textContent = 'View student portal';
  }
}
function demoLogin() {
  authGeneration++;
  clearToken();
  loginStudent(DEMO_STUDENT, true);
}
function loginStudent(student, demo = false) {
  activeStudent = student;
  $('dobInput').value = '';
  $('cardStatus').textContent = demo ? 'Demo — not an official credential' : 'Enrollment: ' + value(student.enrollmentStatus);
  const identity = {
    dashStudentName:value(student.name).toUpperCase(), dashClassSec:[student.className,student.section].filter(Boolean).join(' — ') || 'Not available',
    dashRoll:'Roll No: ' + value(student.rollNumber),dashAdm:'Adm: ' + value(student.admissionNumber),dashBlood:'Blood: ' + value(student.bloodGroup),
    cardName:value(student.name).toUpperCase(),cardBadge:[student.className,student.section].filter(Boolean).join(' — ') || 'Not available',
    cardFather:value(student.fatherName),cardPhone:value(student.contactNumber),cardBus:value(student.busStop),cardBlood:value(student.bloodGroup)
  };
  for (const [id,text] of Object.entries(identity)) $(id).textContent = text;
  $('portalNotice').textContent = demo ? 'Demo preview — fictional sample identity. No live student records are used.' : 'Read-only student profile. Academic, fee and attendance records are not yet connected. Contact the school office for official documents.';
  showView('dashboardView');
  window.location.hash = '#/idcard';
  switchTab('tab-idcard', false);
}
function handleLogout() {
  authGeneration++;
  verificationGeneration++;
  activeStudent = null;
  clearToken();
  $('dobInput').value = '';
  $('admInput').value = '';
  for (const id of ['dashStudentName','dashClassSec','dashRoll','dashAdm','dashBlood','cardName','cardBadge','cardFather','cardPhone','cardBus','cardBlood']) $(id).textContent = '';
  $('loginAlert').style.display = 'none';
  $('loginInfo').style.display = 'none';
  window.location.hash = '#/login';
  showLoginScreen();
}
function switchTab(id, updateHash = true) {
  if (!activeStudent) return;
  for (const button of document.querySelectorAll('.tab-btn')) {
    const selected = button.dataset.tab === id;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
  for (const panel of document.querySelectorAll('.tab-content')) panel.classList.toggle('active',panel.id === id);
  if (updateHash) window.location.hash = '#/' + id.replace('tab-','');
}
async function showPublicVerification(adm, sig) {
  const generation = ++verificationGeneration;
  showView('verificationView');
  for (const id of ['vName','vAdm','vClass','vRoll','vSigHash']) $(id).textContent = '—';
  $('vTitle').textContent = 'Checking credential…';
  $('vBadge').className = 'verification-badge badge-warning';
  $('vBadge').textContent = 'Not yet verified';
  $('vSigMatchBadge').textContent = 'Pending';
  $('vBtnLogin').onclick = () => showLoginFromVerification(adm);
  try {
    const data = await api('/api/verify?adm=' + encodeURIComponent(adm) + '&sig=' + encodeURIComponent(sig || ''));
    if (generation !== verificationGeneration) return;
    const verified = data.verified === true;
    $('vTitle').textContent = verified ? 'Verified credential' : 'Credential not verified';
    $('vBadge').className = 'verification-badge ' + (verified ? 'badge-valid' : 'badge-invalid');
    $('vBadge').textContent = verified ? 'Active enrollment confirmed' : value(data.status);
    $('vSigMatchBadge').textContent = verified ? 'Verified by school server' : 'Unverified';
    $('vSigHash').textContent = value(data.algorithm);
    // Do not render personal details from an unverified credential.
    if (verified && data.student) {
      $('vName').textContent = value(data.student.name);
      $('vAdm').textContent = value(data.student.admissionNumber);
      $('vClass').textContent = [data.student.className,data.student.section].filter(Boolean).join(' — ');
      $('vRoll').textContent = value(data.student.rollNumber);
    }
  } catch (_) {
    if (generation !== verificationGeneration) return;
    $('vTitle').textContent = 'Verification unavailable';
    $('vBadge').textContent = 'Unable to verify. Try again later.';
    $('vSigMatchBadge').textContent = 'Unverified';
  }
}
window.addEventListener('DOMContentLoaded', initPortal);
window.addEventListener('hashchange', routePortal);
