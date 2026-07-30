/* ============================================================
   IndexedDB 资产仓库 · 员工自定义头像
   Blob 只存 Assets 表，不进入 localStorage / MVU。
   ============================================================ */
const Assets = (function () {
  'use strict';

  const DB_NAME = 'pastoral_assets';
  const DB_VERSION = 1;
  const STORE = 'Assets';
  const urls = new Map();
  let dbPromise = null;

  function available() { return typeof indexedDB !== 'undefined' && indexedDB && typeof indexedDB.open === 'function'; }

  function scope() {
    try {
      if (typeof getCurrentCharacterName === 'function') return getCurrentCharacterName() || 'unknown-character';
    } catch (e) { /* ignore */ }
    return location && location.pathname ? location.pathname : 'standalone';
  }

  function staffKey(name) { return scope() + '::' + String(name || ''); }

  function open() {
    if (!available()) return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB 打开失败'));
    }).catch((e) => { dbPromise = null; console.error('[Pastoral][Assets]', e); return null; });
    return dbPromise;
  }

  async function transact(mode, run) {
    const db = await open();
    if (!db) return null;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let request;
      try { request = run(store); } catch (e) { reject(e); return; }
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB 操作失败'));
    }).catch((e) => { console.error('[Pastoral][Assets]', e); return null; });
  }

  async function putStaffAvatar(name, blob) {
    if (!blob || !String(blob.type || '').startsWith('image/')) return false;
    const key = staffKey(name);
    const result = await transact('readwrite', (store) => store.put({ key, kind: 'staff-avatar', blob, mime: blob.type, updatedAt: Date.now() }));
    revoke(key);
    return result != null;
  }

  async function getStaffAvatar(name) {
    const record = await transact('readonly', (store) => store.get(staffKey(name)));
    return record && record.blob ? record.blob : null;
  }

  async function removeStaffAvatar(name) {
    const key = staffKey(name);
    const result = await transact('readwrite', (store) => store.delete(key));
    revoke(key);
    return result !== null;
  }

  function revoke(key) {
    const old = urls.get(key);
    if (old && typeof URL !== 'undefined' && URL.revokeObjectURL) URL.revokeObjectURL(old);
    urls.delete(key);
  }

  async function avatarUrl(name) {
    const key = staffKey(name);
    if (urls.has(key)) return urls.get(key);
    const blob = await getStaffAvatar(name);
    if (!blob || typeof URL === 'undefined' || !URL.createObjectURL) return '';
    const url = URL.createObjectURL(blob); urls.set(key, url); return url;
  }

  function cleanup() { Array.from(urls.keys()).forEach(revoke); }
  if (typeof addEventListener === 'function') addEventListener('beforeunload', cleanup);

  return { available, staffKey, putStaffAvatar, getStaffAvatar, removeStaffAvatar, avatarUrl, cleanup };
})();
window.Assets = Assets;
