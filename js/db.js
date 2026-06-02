/**
 * 数据层 — 支持 Supabase 云端同步 + IndexedDB 本地缓存 + 内存回退
 */

const DB_NAME = 'WordBookDB';
const DB_VERSION = 1;
const STORE_NAME = 'words';

let supabase = null;
let isLocalMode = false;
let memoryStore = []; // 内存回退存储
let useMemory = false; // 是否使用内存存储（IndexedDB 不可用时）

// 安全的 UUID 生成（不依赖 crypto.randomUUID）
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // 回退实现
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// 初始化 Supabase（每次调用都从 localStorage 读取，支持动态配置）
function initSupabase() {
  try {
    const url = localStorage.getItem('sb_url') || '';
    const key = localStorage.getItem('sb_key') || '';
    if (!url || !key) {
      isLocalMode = true;
      return false;
    }
    supabase = window.supabase.createClient(url, key);
    return true;
  } catch (e) {
    console.error('Supabase init failed:', e);
    isLocalMode = true;
    return false;
  }
}

// 检查 IndexedDB 是否可用
function isIndexedDBAvailable() {
  try {
    return !!window.indexedDB;
  } catch (e) {
    return false;
  }
}

// ===== IndexedDB 本地存储 =====
function openDB() {
  return new Promise((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
      reject(new Error('IndexedDB not available'));
      return;
    }
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

async function localAdd(word) {
  if (useMemory) {
    const wordToSave = { ...word };
    wordToSave.id = wordToSave.id || generateUUID();
    wordToSave.created_at = wordToSave.created_at || new Date().toISOString();
    wordToSave.updated_at = wordToSave.updated_at || new Date().toISOString();
    memoryStore.push(wordToSave);
    return wordToSave;
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const wordToSave = { ...word };
    wordToSave.id = wordToSave.id || generateUUID();
    wordToSave.created_at = wordToSave.created_at || new Date().toISOString();
    wordToSave.updated_at = wordToSave.updated_at || new Date().toISOString();
    const request = store.put(wordToSave);
    request.onsuccess = () => resolve(wordToSave);
    request.onerror = () => reject(request.error);
  });
}

async function localGetAll() {
  if (useMemory) {
    return [...memoryStore].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

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
    // IndexedDB 失败，切换到内存模式
    console.warn('IndexedDB failed, switching to memory mode:', e);
    useMemory = true;
    return [...memoryStore].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
}

async function localGetById(id) {
  if (useMemory) {
    return memoryStore.find(w => w.id === id) || null;
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function localUpdate(id, data) {
  if (useMemory) {
    const idx = memoryStore.findIndex(w => w.id === id);
    if (idx === -1) throw new Error('Word not found');
    memoryStore[idx] = { ...memoryStore[idx], ...data, updated_at: new Date().toISOString() };
    return memoryStore[idx];
  }

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
}

async function localDelete(id) {
  if (useMemory) {
    memoryStore = memoryStore.filter(w => w.id !== id);
    return;
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function localClear() {
  if (useMemory) {
    memoryStore = [];
    return;
  }

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
    // 如果 IndexedDB 不可用，清空内存
    memoryStore = [];
  }
}

// ===== Supabase 云端存储 =====
async function cloudGetAll() {
  if (!supabase || !currentUser) return [];
  const { data, error } = await supabase
    .from('words')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function cloudAdd(word) {
  if (!supabase) throw new Error('Supabase not initialized');
  const { data, error } = await supabase
    .from('words')
    .insert([word])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function cloudUpdate(id, data) {
  if (!supabase) throw new Error('Supabase not initialized');
  const { data: result, error } = await supabase
    .from('words')
    .update(data)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return result;
}

async function cloudDelete(id) {
  if (!supabase) throw new Error('Supabase not initialized');
  const { error } = await supabase.from('words').delete().eq('id', id);
  if (error) throw error;
}

// ===== 统一接口 =====
var db = {
  isLocal: () => isLocalMode,
  isMemory: () => useMemory,

  async getAll() {
    if (isLocalMode || !supabase) {
      return localGetAll();
    }
    try {
      const words = await cloudGetAll();
      if (!Array.isArray(words)) {
        throw new Error('Invalid response from cloud');
      }
      // 同步到本地缓存
      await localClear();
      if (!useMemory) {
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
      } else {
        memoryStore = [...words];
      }
      return words;
    } catch (e) {
      console.warn('Cloud fetch failed, falling back to local:', e);
      return localGetAll();
    }
  },

  async add(word) {
    if (isLocalMode || !supabase) {
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
    if (isLocalMode || !supabase) {
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
    if (isLocalMode || !supabase) {
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
    if (!isLocalMode && supabase) {
      // 先删云端，再清本地（避免云端失败导致本地丢失）
      try {
        const words = await cloudGetAll();
        for (const word of words) {
          await cloudDelete(word.id);
        }
      } catch (e) {
        console.warn('Cloud clear failed:', e);
        throw e; // 云端失败则不清本地
      }
    }
    await localClear();
  },

  // 导出所有单词为 JSON
  async export() {
    return localGetAll();
  }
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
});

// 确保全局可用
window.db = db;
