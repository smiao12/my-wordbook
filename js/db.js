/**
 * 数据层 — 支持 Supabase 云端同步 + IndexedDB 本地缓存
 */

const DB_NAME = 'WordBookDB';
const DB_VERSION = 1;
const STORE_NAME = 'words';

let supabase = null;
let isLocalMode = false;

// 初始化 Supabase（每次调用都从 localStorage 读取，支持动态配置）
function initSupabase() {
  const url = localStorage.getItem('sb_url') || '';
  const key = localStorage.getItem('sb_key') || '';
  if (!url || !key) {
    isLocalMode = true;
    return false;
  }
  try {
    supabase = window.supabase.createClient(url, key);
    return true;
  } catch (e) {
    console.error('Supabase init failed:', e);
    isLocalMode = true;
    return false;
  }
}

// ===== IndexedDB 本地存储 =====
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

async function localAdd(word) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const wordToSave = { ...word };
    wordToSave.id = wordToSave.id || crypto.randomUUID();
    wordToSave.created_at = wordToSave.created_at || new Date().toISOString();
    wordToSave.updated_at = wordToSave.updated_at || new Date().toISOString();
    const request = store.put(wordToSave);
    request.onsuccess = () => resolve(wordToSave);
    request.onerror = () => reject(request.error);
  });
}

async function localGetAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      const results = request.result;
      // 按时间倒序
      results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      resolve(results);
    };
    request.onerror = () => reject(request.error);
  });
}

async function localGetById(id) {
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
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
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
      // 批量写入，使用单次 transaction
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const word of words) {
        store.put(word);
      }
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
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
