/**
 * 数据层 — 支持 Supabase 云端同步 + IndexedDB 本地缓存 + localStorage 备选
 */

const DB_NAME = 'WordBookDB';
const DB_VERSION = 1;
const STORE_NAME = 'words';
const LS_KEY = 'wordbook_data_v1';

// CDN 加载的库会创建 window.supabase（含 createClient 方法）
// db.js 里我们用内部变量 _sbClient 持有实例，不覆盖 CDN 的全局对象
var _sbClient = null;
var isLocalMode = false;
var storageMode = 'idb'; // 'idb' | 'localStorage' | 'memory'

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

// 初始化 Supabase
// 硬编码 Supabase 配置（已部署的 wordbook 项目）
// 如需切换项目，可在浏览器控制台执行：
// localStorage.setItem('sb_url', '你的URL'); localStorage.setItem('sb_key', '你的KEY'); location.reload();
const DEFAULT_SB_URL = 'https://sipqiuoqdjdkldqcqji.supabase.co';
const DEFAULT_SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpcHFpdXVvcWRqZGtsZHFjcWppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MDkzNjAsImV4cCI6MjA5NTk4NTM2MH0.tUgLwx-bgO5YGvMQV_ITUoN9IF4alwOs3xRUz11V1LU';

function initSupabase() {
  try {
    // 优先从 localStorage 读取（方便用户切换项目）
    const url = localStorage.getItem('sb_url') || DEFAULT_SB_URL;
    const key = localStorage.getItem('sb_key') || DEFAULT_SB_KEY;

    console.log('[Supabase] URL:', url.substring(0, 30) + '...');
    console.log('[Supabase] CDN loaded?', !!window.supabase, 'createClient?', typeof window.supabase?.createClient);

    if (!url || !key || url === 'https://YOUR_PROJECT.supabase.co') {
      console.log('[Supabase] No valid URL/KEY');
      isLocalMode = true;
      return false;
    }

    // 检查 CDN 是否加载成功
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      console.error('[Supabase] CDN not loaded, falling back to local mode');
      isLocalMode = true;
      return false;
    }

    _sbClient = window.supabase.createClient(url, key);

    // 验证返回的对象是否正确
    if (!_sbClient || !_sbClient.auth) {
      console.error('[Supabase] Invalid object, missing .auth');
      _sbClient = null;
      isLocalMode = true;
      return false;
    }

    console.log('[Supabase] Initialized successfully');
    return true;
  } catch (e) {
    console.error('[Supabase] Init error:', e);
    _sbClient = null;
    isLocalMode = true;
    return false;
  }
}

// ===== 存储模式检测 =====
function detectStorageMode() {
  // 检测 IndexedDB
  try {
    if (!!window.indexedDB) {
      return 'idb';
    }
  } catch (e) {}

  // 检测 localStorage
  try {
    const test = '__storage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return 'localStorage';
  } catch (e) {}

  // 回退到内存
  return 'memory';
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

// ===== localStorage 操作 =====
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
      // IndexedDB 失败，降级到 localStorage
      storageMode = 'localStorage';
      return lsGetAll();
    }
  }
  if (storageMode === 'localStorage') {
    return lsGetAll();
  }
  // memory fallback
  return [];
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

  if (storageMode === 'localStorage') {
    const words = lsGetAll();
    words.unshift(wordToSave);
    lsSaveAll(words);
    return wordToSave;
  }

  // memory fallback (should not happen)
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

  if (storageMode === 'localStorage') {
    const words = lsGetAll();
    const idx = words.findIndex(w => w.id === id);
    if (idx === -1) throw new Error('Word not found');
    words[idx] = { ...words[idx], ...data, updated_at: new Date().toISOString() };
    lsSaveAll(words);
    return words[idx];
  }

  throw new Error('Word not found');
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

  if (storageMode === 'localStorage') {
    const words = lsGetAll().filter(w => w.id !== id);
    lsSaveAll(words);
  }
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

  if (storageMode === 'localStorage') {
    localStorage.removeItem(LS_KEY);
  }
}

// ===== Supabase 云端存储 =====
async function cloudGetAll() {
  if (!_sbClient || !currentUser) return [];
  const { data, error } = await _sbClient
    .from('words')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function cloudAdd(word) {
  if (!_sbClient) throw new Error('Supabase not initialized');
  const { data, error } = await _sbClient
    .from('words')
    .insert([word])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function cloudUpdate(id, data) {
  if (!_sbClient) throw new Error('Supabase not initialized');
  const { data: result, error } = await _sbClient
    .from('words')
    .update(data)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return result;
}

async function cloudDelete(id) {
  if (!_sbClient) throw new Error('Supabase not initialized');
  const { error } = await _sbClient.from('words').delete().eq('id', id);
  if (error) throw error;
}

// ===== 统一接口 =====
var db = {
  isLocal: () => isLocalMode,
  storageMode: () => storageMode,

  async getAll() {
    if (isLocalMode || !_sbClient) {
      return localGetAll();
    }
    try {
      const words = await cloudGetAll();
      if (!Array.isArray(words)) {
        throw new Error('Invalid response from cloud');
      }
      await localClear();
      if (storageMode === 'idb') {
        const idb = await openDB();
        const tx = idb.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const word of words) {
          store.put(word);
        }
        await new Promise((resolve, reject) => {
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
      } else if (storageMode === 'localStorage') {
        lsSaveAll(words);
      }
      return words;
    } catch (e) {
      console.warn('Cloud fetch failed, falling back to local:', e);
      return localGetAll();
    }
  },

  async add(word) {
    if (isLocalMode || !_sbClient) {
      return localAdd(word);
    }
    try {
      const result = await cloudAdd(word);
      await localAdd(result);
      return result;
    } catch (e) {
      console.warn('Cloud add failed, saving locally:', e);
      return localAdd(word);
    }
  },

  async update(id, data) {
    if (isLocalMode || !_sbClient) {
      return localUpdate(id, data);
    }
    try {
      const result = await cloudUpdate(id, data);
      await localUpdate(id, result);
      return result;
    } catch (e) {
      console.warn('Cloud update failed, updating locally:', e);
      return localUpdate(id, data);
    }
  },

  async delete(id) {
    if (isLocalMode || !_sbClient) {
      return localDelete(id);
    }
    try {
      await cloudDelete(id);
      await localDelete(id);
    } catch (e) {
      console.warn('Cloud delete failed, deleting locally:', e);
      await localDelete(id);
    }
  },

  async clear() {
    if (!isLocalMode && _sbClient) {
      try {
        const words = await cloudGetAll();
        for (const word of words) {
          await cloudDelete(word.id);
        }
      } catch (e) {
        console.warn('Cloud clear failed:', e);
        throw e;
      }
    }
    await localClear();
  },

  async export() {
    return localGetAll();
  }
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  storageMode = detectStorageMode();
  if (storageMode === 'memory') {
    console.warn('No persistent storage available. Data will be lost on page refresh.');
  }
  initSupabase();
});

window.db = db;
