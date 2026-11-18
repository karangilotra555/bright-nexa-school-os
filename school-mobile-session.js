/* Device-local login for installed portals. Supabase verifies access on reopen. */
(function (root) {
  'use strict';

  const lastPortalKey = 'bright-nexa/mobile-last-portal/v1';

  function createStore(portal, device = root) {
    const agent = device.navigator?.userAgent || '';
    const installed = device.matchMedia?.('(display-mode: standalone)')?.matches
      || device.navigator?.standalone === true || (/Android/i.test(agent) && /\bwv\b/i.test(agent));
    if (!/Android|iPhone|iPad|iPod/i.test(agent) || !installed) return null;
    if (!device.indexedDB || !device.crypto?.subtle) return null;

    const crypto = device.crypto;
    const scope = 'bright-nexa/mobile-session/v1/' + portal;
    const context = new TextEncoder().encode(scope);
    let pending = Promise.resolve(), generation = 0;
    const logoutKey = scope + '/logged-out';
    const pref = {
      get(key) { try { return device.localStorage?.getItem(key) ?? null; } catch (_) { return null; } },
      set(key, value) { try { device.localStorage?.setItem(key, value); } catch (_) {} },
      clear(key) { try { device.localStorage?.removeItem(key); } catch (_) {} }
    };

    function transaction(mode, action) {
      return new Promise((resolve, reject) => {
        const open = device.indexedDB.open('bright-nexa-mobile-login', 1);
        let db, tx, stopped = false;
        const finish = (error, value) => {
          clearTimeout(timeout);
          db?.close();
          if (error) reject(error); else resolve(value);
        };
        const timeout = setTimeout(() => {
          stopped = true;
          try { tx?.abort(); } catch (_) {}
          finish(Error('Device login storage timed out'));
        }, 3000);
        open.onupgradeneeded = () => open.result.createObjectStore('sessions');
        open.onerror = () => finish(open.error);
        open.onblocked = () => { stopped = true; finish(Error('Device login storage unavailable')); };
        open.onsuccess = () => {
          db = open.result;
          if (stopped) { db.close(); return; }
          try {
            tx = db.transaction('sessions', mode);
            const request = action(tx.objectStore('sessions'));
            tx.oncomplete = () => finish(null, request.result);
            tx.onabort = tx.onerror = () => finish(tx.error || Error('Device login storage unavailable'));
          } catch (error) { finish(error); }
        };
      });
    }

    function ordered(operation) {
      const next = pending.then(operation).catch(() => null);
      pending = next;
      return next;
    }

    return {
      read: () => ordered(async () => {
        if (pref.get(logoutKey)) return null;
        const record = await transaction('readonly', store => store.get(scope));
        if (!record) return null;
        const bytes = await crypto.subtle.decrypt({
          name: 'AES-GCM', iv: record.iv, additionalData: context
        }, record.key, record.ciphertext);
        return pref.get(logoutKey) ? null : new TextDecoder().decode(bytes) || null;
      }),
      marker: () => pref.get(logoutKey),
      write(token, newLogin = false, marker = pref.get(logoutKey)) {
        const current = generation;
        return ordered(async () => {
          if (typeof token !== 'string' || !token || (marker && !newLogin)) return;
          const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
          const iv = crypto.getRandomValues(new Uint8Array(12));
          const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: context },
            key, new TextEncoder().encode(token));
          if (current !== generation || marker !== pref.get(logoutKey)) return false;
          await transaction('readwrite', store => store.put({ key, iv, ciphertext }, scope));
          if (current !== generation || marker !== pref.get(logoutKey)) return false;
          if (newLogin) pref.clear(logoutKey);
          return true;
        });
      },
      activate() { if (!pref.get(logoutKey)) pref.set(lastPortalKey, portal); },
      clear() {
        generation++;
        // Write the logout intent before a redirect can interrupt IndexedDB.
        pref.set(logoutKey, Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-'));
        if (pref.get(lastPortalKey) === portal) pref.clear(lastPortalKey);
        return ordered(() => transaction('readwrite', store => store.delete(scope)));
      }
    };
  }

  async function opensPortalOnLaunch(portal, device) {
    if (device.location?.search || !/Android.*\bwv\b/i.test(device.navigator?.userAgent || '')) return false;
    try {
      if (device.localStorage?.getItem(lastPortalKey) !== portal) return false;
    } catch (_) { return false; }
    return Boolean(await createStore(portal, device)?.read());
  }

  const opensTeacherOnLaunch = (device = root) => opensPortalOnLaunch('teacher', device);
  const opensLeadershipOnLaunch = (device = root) => opensPortalOnLaunch('leadership', device);
  const api = { createStore, opensTeacherOnLaunch, opensLeadershipOnLaunch };
  if (typeof module !== 'undefined') module.exports = api;
  else root.BNMobileSession = api;
})(typeof window === 'undefined' ? globalThis : window);
