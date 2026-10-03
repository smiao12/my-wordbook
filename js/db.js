/**
 * 数据层 — 本地优先缓存 + Supabase 云端同步
 * 登录后所有操作双写（云端 + 本地缓存），未登录纯本地
 */

const DB_NAME = 'WordBookDB_v2';
const DB_VERSION = 1;
const STORE_NAME = 'words';
const LS_KEY = 'wordbook_data_v2';

const SUPABASE_URL = 'https://tweidwpxsrxiwjcyfnpn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3ZWlkd3B4c3J4aXdqY3lmbnBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwMTM4ODAsImV4cCI6MjEwNjU4OTg4MH0.-nfBGueMAohy_GivEdvezE-BZOXb9BuNJ4TG5CExd8M';

let storageMode = 'idb'; // 'idb' | 'localStorage'
var supabaseClient = null;
var currentUser = null; // { id, email } 登录后设置

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

// 清理旧版本遗留数据（v1 的存储 key 和旧数据库）
function cleanupLegacyData() {
  try {
    localStorage.removeItem('wordbook_data_v1');
    localStorage.removeItem('wordbook_review_progress');
  } catch (e) {}
  try {
    if (window.indexedDB) {
      indexedDB.deleteDatabase('WordBookDB');
    }
  } catch (e) {}
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

// ===== Supabase 初始化 =====
function initSupabase() {
  try {
    if (!supabaseClient && typeof supabase !== 'undefined' && supabase.createClient) {
      supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return !!supabaseClient;
  } catch (e) {
    console.error('Supabase init failed:', e);
    return false;
  }
}

function isCloudMode() {
  return !!(supabaseClient && currentUser && currentUser.id);
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
        store.createIndex('year', 'year', { unique: false });
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

// ===== 本地存储操作 =====
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

async function localReplaceAll(words) {
  if (storageMode === 'idb') {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        words.forEach(w => store.put(w));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      storageMode = 'localStorage';
    }
  }
  lsSaveAll(words);
}

// ===== 云端存储操作 =====
async function cloudGetAll() {
  const { data, error } = await supabaseClient
    .from('words')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function cloudAdd(word) {
  const payload = {
    ...word,
    id: word.id || generateUUID(),
    user_id: currentUser.id,
    created_at: word.created_at || new Date().toISOString(),
    updated_at: word.updated_at || new Date().toISOString()
  };
  const { data, error } = await supabaseClient
    .from('words')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function cloudUpdate(id, changes) {
  const { data, error } = await supabaseClient
    .from('words')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function cloudDelete(id) {
  const { error } = await supabaseClient
    .from('words')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

async function cloudClear() {
  const { error } = await supabaseClient
    .from('words')
    .delete()
    .eq('user_id', currentUser.id);
  if (error) throw error;
}

// ===== 统一接口 =====
var db = {
  async getAll() {
    // 返回本地缓存（登录后缓存已与云端同步）
    return localGetAll();
  },

  async add(word) {
    if (isCloudMode()) {
      const saved = await cloudAdd(word);
      await localAdd(saved);
      return saved;
    }
    return localAdd(word);
  },

  async update(id, data) {
    if (isCloudMode()) {
      const updated = await cloudUpdate(id, data);
      await localUpdate(id, data);
      return updated;
    }
    return localUpdate(id, data);
  },

  async delete(id) {
    if (isCloudMode()) {
      await cloudDelete(id);
      await localDelete(id);
      return;
    }
    return localDelete(id);
  },

  async clear() {
    if (isCloudMode()) {
      await cloudClear();
      await localClear();
      return;
    }
    return localClear();
  },

  async export() {
    if (isCloudMode()) {
      return cloudGetAll();
    }
    return localGetAll();
  },

  // 登录后：合并本地缓存 + 云端数据（云端优先，本地独有的上传）
  async syncFromCloud() {
    const localWords = await localGetAll();
    const cloudWords = await cloudGetAll();

    const merged = new Map();
    cloudWords.forEach(w => merged.set(w.id, w));

    for (const lw of localWords) {
      if (!merged.has(lw.id)) {
        try {
          const uploaded = await cloudAdd(lw);
          merged.set(uploaded.id, uploaded);
        } catch (e) {
          merged.set(lw.id, lw);
        }
      }
    }

    const result = Array.from(merged.values())
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    await localReplaceAll(result);
    return result;
  }
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  cleanupLegacyData();
  storageMode = detectStorageMode();
  initSupabase();
});

window.db = db;
