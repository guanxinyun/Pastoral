/* ============================================================
   IndexedDB 本地资产仓库 · 员工头像 / 个人图标 / 图标映射
   Blob 与本地显示偏好不进入 localStorage、MVU 或聊天消息。
   ============================================================ */
const Assets = (function () {
  'use strict';

  const DB_NAME = 'pastoral_assets';
  const DB_VERSION = 2;
  const STORE = 'Assets';
  const ICON_MAX_BYTES = 2 * 1024 * 1024;
  const ICON_MAX_COUNT = 100;
  const ICON_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
  const urls = new Map();
  let dbPromise = null;

  function available() { return typeof indexedDB !== 'undefined' && indexedDB && typeof indexedDB.open === 'function'; }

  function characterName() {
    try { return typeof getCurrentCharacterName === 'function' ? getCurrentCharacterName() || '' : ''; }
    catch (e) { return ''; }
  }
  function pagePath() { return typeof location !== 'undefined' && location.pathname ? location.pathname : 'standalone'; }
  function scope() { const character = characterName(); return character ? `${character}::${pagePath()}` : pagePath(); }
  function staffScope() { return characterName() || pagePath(); }

  function prefix(kind) { return scope() + '::' + kind + '::'; }
  // 保留 v1 员工头像键，升级数据库后既有头像无需迁移即可继续读取。
  function staffKey(name) { return staffScope() + '::' + String(name || ''); }
  function iconKey(id) { return prefix('custom-icon') + String(id || ''); }
  function bindingsKey() { return prefix('icon-bindings') + 'registry'; }

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

  async function transact(mode, run, fallback = null) {
    const db = await open();
    if (!db) return fallback;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      let request;
      try { request = run(store); } catch (e) { reject(e); return; }
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB 操作失败'));
    }).catch((e) => { console.error('[Pastoral][Assets]', e); return fallback; });
  }

  async function allRecords() {
    const records = await transact('readonly', (store) => store.getAll(), []);
    return Array.isArray(records) ? records : [];
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

  function validIconBlob(blob) {
    return !!blob && ICON_MIME.has(String(blob.type || '').toLowerCase()) && Number(blob.size) <= ICON_MAX_BYTES;
  }

  async function listCustomIcons() {
    const p = prefix('custom-icon');
    return (await allRecords())
      .filter((record) => record && record.kind === 'custom-icon' && String(record.key).startsWith(p))
      .map(({ id, name, mime, updatedAt }) => ({ id, name, mime, updatedAt }))
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  }

  function makeIconId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'icon-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  async function putCustomIcon(blob, name) {
    if (!available() || !validIconBlob(blob)) return null;
    if ((await listCustomIcons()).length >= ICON_MAX_COUNT) return null;
    const id = makeIconId();
    const cleanName = String(name || '我的图标').trim().slice(0, 80) || '我的图标';
    const record = { key: iconKey(id), kind: 'custom-icon', id, name: cleanName, blob, mime: blob.type, updatedAt: Date.now() };
    const result = await transact('readwrite', (store) => store.put(record));
    return result == null ? null : { id, name: cleanName, mime: blob.type, updatedAt: record.updatedAt };
  }

  async function getCustomIcon(id) {
    const record = await transact('readonly', (store) => store.get(iconKey(id)));
    return record && record.kind === 'custom-icon' ? record : null;
  }

  async function renameCustomIcon(id, name) {
    const record = await getCustomIcon(id);
    const cleanName = String(name || '').trim().slice(0, 80);
    if (!record || !cleanName) return false;
    record.name = cleanName; record.updatedAt = Date.now();
    return (await transact('readwrite', (store) => store.put(record))) != null;
  }

  async function getIconBindings() {
    const record = await transact('readonly', (store) => store.get(bindingsKey()));
    return record && record.bindings && typeof record.bindings === 'object' ? Object.assign({}, record.bindings) : {};
  }

  async function setIconBindings(bindings) {
    const clean = {};
    Object.entries(bindings && typeof bindings === 'object' ? bindings : {}).forEach(([key, id]) => {
      const k = String(key || '').trim().slice(0, 240), v = String(id || '').trim().slice(0, 120);
      if (k && v) clean[k] = v;
    });
    const result = await transact('readwrite', (store) => store.put({ key: bindingsKey(), kind: 'icon-bindings', bindings: clean, updatedAt: Date.now() }));
    return result != null;
  }

  async function removeBindingsForIcon(id) {
    const bindings = await getIconBindings();
    let count = 0;
    Object.keys(bindings).forEach((key) => { if (bindings[key] === id) { delete bindings[key]; count++; } });
    if (count) await setIconBindings(bindings);
    return count;
  }

  async function removeCustomIcon(id) {
    const key = iconKey(id);
    const removedBindings = await removeBindingsForIcon(id);
    const result = await transact('readwrite', (store) => store.delete(key));
    revoke(key);
    return result !== null ? removedBindings : null;
  }

  function revoke(key) {
    const old = urls.get(key);
    if (old && typeof URL !== 'undefined' && URL.revokeObjectURL) URL.revokeObjectURL(old);
    urls.delete(key);
  }

  async function blobUrl(key, loader) {
    if (urls.has(key)) return urls.get(key);
    const blob = await loader();
    if (!blob || typeof URL === 'undefined' || !URL.createObjectURL) return '';
    const url = URL.createObjectURL(blob); urls.set(key, url); return url;
  }

  async function avatarUrl(name) {
    const key = staffKey(name);
    return blobUrl(key, () => getStaffAvatar(name));
  }

  async function customIconUrl(id) {
    const key = iconKey(id);
    return blobUrl(key, async () => { const record = await getCustomIcon(id); return record && record.blob; });
  }

  function cleanup() { Array.from(urls.keys()).forEach(revoke); }
  if (typeof addEventListener === 'function') addEventListener('beforeunload', cleanup);

  return {
    ICON_MAX_BYTES, ICON_MAX_COUNT, ICON_MIME: Array.from(ICON_MIME), available, staffKey,
    putStaffAvatar, getStaffAvatar, removeStaffAvatar, avatarUrl,
    listCustomIcons, putCustomIcon, getCustomIcon, renameCustomIcon, removeCustomIcon, customIconUrl,
    getIconBindings, setIconBindings, removeBindingsForIcon, cleanup
  };
})();
window.Assets = Assets;
