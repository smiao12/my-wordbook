/**
 * 数据层 — 本地存储（IndexedDB + localStorage 备选）
 */

const DB_NAME = 'WordBookDB';
const DB_VERSION = 1;
const STORE_NAME = 'words';
const LS_KEY = 'wordbook_data_v1';

let storageMode = 'idb'; // 'idb' | 'localStorage'

// 安全的 UUID 生成
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// 检测存储模式
function detectStorageMode() {
  try {
    if (!!window.indexedDB) return 'idb';
  } catch (e) {}
  try {
    const test = '__storage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return 'localStorage';
  } catch (e) {}
  return 'localStorage';
}

// ===== IndexedDB =====
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('word', 'word', { unique: false });
        store.createIndex('created_at', 'created_at', { unique: false });
      }
    };
  });
}

// ===== localStorage =====
function lsGetAll() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) : [];
  } catch (e) {
    return [];
  }
}

function lsSaveAll(words) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(words));
    return true;
  } catch (e) {
    console.error('localStorage save failed:', e);
    return false;
  }
}

// ===== 统一本地存储操作 =====
async function localGetAll() {
  if (storageMode === 'idb') {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => {
          const results = request.result;
          results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          resolve(results);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      storageMode = 'localStorage';
      return lsGetAll();
    }
  }
  return lsGetAll();
}

async function localAdd(word) {
  const wordToSave = {
    ...word,
    id: word.id || generateUUID(),
    created_at: word.created_at || new Date().toISOString(),
    updated_at: word.updated_at || new Date().toISOString()
  };

  if (storageMode === 'idb') {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.put(wordToSave);
        request.onsuccess = () => resolve(wordToSave);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      storageMode = 'localStorage';
    }
  }

  const words = lsGetAll();
  words.unshift(wordToSave);
  lsSaveAll(words);
  return wordToSave;
}

async function localUpdate(id, data) {
  if (storageMode === 'idb') {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          if (!getReq.result) {
            reject(new Error('Word not found'));
            return;
          }
          const updated = { ...getReq.result, ...data, updated_at: new Date().toISOString() };
          const putReq = store.put(updated);
          putReq.onsuccess = () => resolve(updated);
          putReq.onerror = () => reject(putReq.error);
        };
        getReq.onerror = () => reject(getReq.error);
      });
    } catch (e) {
      storageMode = 'localStorage';
    }
  }

  const words = lsGetAll();
  const idx = words.findIndex(w => w.id === id);
  if (idx === -1) throw new Error('Word not found');
  words[idx] = { ...words[idx], ...data, updated_at: new Date().toISOString() };
  lsSaveAll(words);
  return words[idx];
}

async function localDelete(id) {
  if (storageMode === 'idb') {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      storageMode = 'localStorage';
    }
  }

  const words = lsGetAll().filter(w => w.id !== id);
  lsSaveAll(words);
}

async function localClear() {
  if (storageMode === 'idb') {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      storageMode = 'localStorage';
    }
  }
  localStorage.removeItem(LS_KEY);
}

// ===== 统一接口 =====
var db = {
  async getAll() {
    return localGetAll();
  },

  async add(word) {
    return localAdd(word);
  },

  async update(id, data) {
    return localUpdate(id, data);
  },

  async delete(id) {
    return localDelete(id);
  },

  async clear() {
    return localClear();
  },

  async export() {
    return localGetAll();
  }
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  storageMode = detectStorageMode();
});

window.db = db;
