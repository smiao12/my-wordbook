/**
 * 主应用逻辑 — 纯本地模式，按考研年份整理
 */

// 确保 db 存在（fallback）
if (typeof db === 'undefined' || !db) {
  console.warn('db.js not loaded, creating fallback');
  var db = {
    _memory: [],
    async getAll() {
      return [...this._memory].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    },
    async add(word) {
      const saved = {
        ...word,
        id: word.id || Date.now().toString(36) + Math.random().toString(36).slice(2),
        created_at: word.created_at || new Date().toISOString(),
        updated_at: word.updated_at || new Date().toISOString()
      };
      this._memory.unshift(saved);
      return saved;
    },
    async update(id, data) {
      const idx = this._memory.findIndex(w => w.id === id);
      if (idx === -1) throw new Error('Word not found');
      this._memory[idx] = { ...this._memory[idx], ...data, updated_at: new Date().toISOString() };
      return this._memory[idx];
    },
    async delete(id) {
      this._memory = this._memory.filter(w => w.id !== id);
    },
    async clear() {
      this._memory = [];
    },
    async export() {
      return [...this._memory];
    }
  };
}

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  showAppPage();

  // 绑定键盘事件
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeWordModal();
      closeSettings();
      closeAuthModal();
    }
  });

  // 尝试恢复登录会话（已登录则同步云端，否则本地模式）
  const user = await restoreSession();
  if (user) {
    await syncAfterLogin();
  } else {
    loadWords();
    updateAccountUI();
  }
});

// ===== 加载单词 =====
async function loadWords() {
  showLoading(true);
  try {
    allWords = await db.getAll();
    filteredWords = [...allWords];
    renderYearFilter();
    renderWordList(filteredWords);
  } catch (e) {
    showToast('加载失败：' + e.message);
  } finally {
    showLoading(false);
  }
}

// ===== 统一筛选（年份 + 搜索） =====
function applyFilters() {
  const query = document.getElementById('search-input').value.trim().toLowerCase();
  filteredWords = allWords.filter(word => {
    if (activeYear !== '') {
      const y = (word.year || '').trim();
      if (y !== activeYear) return false;
    }
    if (query) {
      return (word.word && word.word.toLowerCase().includes(query)) ||
        (word.meaning && word.meaning.toLowerCase().includes(query)) ||
        (word.example && word.example.toLowerCase().includes(query));
    }
    return true;
  });
  renderWordList(filteredWords);
}

// ===== 搜索 =====
function handleSearch() {
  applyFilters();
}

// ===== 年份筛选 =====
function filterByYear(year) {
  activeYear = year;
  document.querySelectorAll('.tag-btn').forEach(btn => {
    btn.classList.toggle('active', (btn.dataset.year || '') === year);
  });
  applyFilters();
}

// ===== 保存单词 =====
async function saveWord() {
  const id = document.getElementById('word-id').value;
  const word = document.getElementById('word-input').value.trim();
  const meaning = document.getElementById('meaning-input').value.trim();
  const phonetic = document.getElementById('phonetic-input').value.trim();
  const year = document.getElementById('year-input').value.trim();
  const example = document.getElementById('example-input').value.trim();

  if (!word) {
    showToast('请输入英文单词');
    return;
  }
  if (!meaning) {
    showToast('请输入中文释义');
    return;
  }

  showLoading(true);
  try {
    if (id) {
      // 编辑
      await db.update(id, { word, meaning, phonetic, example, year });
      const idx = allWords.findIndex(w => w.id === id);
      if (idx >= 0) {
        allWords[idx] = { ...allWords[idx], word, meaning, phonetic, example, year };
      }
      showToast('单词已更新');
    } else {
      // 新增
      const saved = await db.add({ word, meaning, phonetic, example, year });
      allWords.unshift(saved);
      showToast('单词已保存');
    }

    applyFilters();
    renderYearFilter();
    closeWordModal();
  } catch (e) {
    showToast('保存失败：' + e.message);
  } finally {
    showLoading(false);
  }
}

// ===== 删除单词 =====
async function deleteWord(id) {
  if (!confirm('确定要删除这个单词吗？')) return;

  showLoading(true);
  try {
    await db.delete(id);
    allWords = allWords.filter(w => w.id !== id);
    applyFilters();
    renderYearFilter();
    showToast('已删除');
  } catch (e) {
    showToast('删除失败：' + e.message);
  } finally {
    showLoading(false);
  }
}

// ===== 批量导入 =====
function previewImport() {
  const text = document.getElementById('import-text').value.trim();
  if (!text) {
    showToast('请输入要导入的内容');
    return;
  }

  pendingImportWords = [];
  const lines = text.split('\n').filter(l => l.trim());

  for (const line of lines) {
    const parts = line.split('|').map(p => p.trim());
    if (parts.length >= 1 && parts[0]) {
      pendingImportWords.push({
        word: parts[0],
        meaning: parts[1] || '',
        example: parts[2] || '',
        phonetic: ''
      });
    }
  }

  renderImportPreview();
}

function previewImportJson() {
  const text = document.getElementById('import-json').value.trim();
  if (!text) {
    showToast('请输入 JSON 内容');
    return;
  }

  try {
    const data = JSON.parse(text);
    if (!Array.isArray(data)) {
      showToast('JSON 格式错误：需要数组');
      return;
    }

    pendingImportWords = data.map(item => ({
      word: item.word || '',
      meaning: item.meaning || '',
      example: item.example || '',
      phonetic: item.phonetic || ''
    })).filter(item => item.word);

    renderImportPreview();
  } catch (e) {
    showToast('JSON 解析失败：' + e.message);
  }
}

function renderImportPreview() {
  const preview = document.getElementById('import-preview');
  const list = document.getElementById('import-preview-list');
  const count = document.getElementById('import-count');

  if (pendingImportWords.length === 0) {
    showToast('没有可导入的单词');
    return;
  }

  count.textContent = `(${pendingImportWords.length} 条)`;
  list.innerHTML = pendingImportWords.map((w, i) => `
    <div class="import-preview-item">
      <div class="import-preview-word">${i + 1}. ${escapeHtml(w.word)}</div>
      ${w.meaning ? `<div class="import-preview-meaning">${escapeHtml(w.meaning)}</div>` : '<div class="import-preview-meaning" style="color:var(--text-muted)">（无释义）</div>'}
      ${w.example ? `<div class="import-preview-example">${escapeHtml(w.example)}</div>` : ''}
    </div>
  `).join('');

  preview.classList.remove('hidden');
}

function cancelImport() {
  document.getElementById('import-preview').classList.add('hidden');
  pendingImportWords = [];
}

async function confirmImport() {
  if (pendingImportWords.length === 0) return;

  const importYear = document.getElementById('import-year').value.trim();

  showLoading(true);
  let successCount = 0;
  let failCount = 0;

  for (const wordData of pendingImportWords) {
    try {
      const wordToSave = { ...wordData, year: importYear };
      if (!wordToSave.meaning) {
        wordToSave.meaning = '（暂无释义）';
      }

      const saved = await db.add(wordToSave);
      allWords.unshift(saved);
      successCount++;
    } catch (e) {
      failCount++;
      console.error('Import failed for word:', wordData.word, e);
    }
  }

  applyFilters();
  renderYearFilter();

  document.getElementById('import-preview').classList.add('hidden');
  document.getElementById('import-text').value = '';
  document.getElementById('import-json').value = '';
  document.getElementById('import-year').value = '';
  pendingImportWords = [];

  showLoading(false);
  showToast(`导入完成：成功 ${successCount} 条，失败 ${failCount} 条`);

  switchTab('list');
}

// ===== 设置 =====
async function exportWords() {
  showLoading(true);
  try {
    const words = await db.export();
    const blob = new Blob([JSON.stringify(words, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wordbook-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
    showToast('导出成功');
  } catch (e) {
    showToast('导出失败：' + e.message);
  } finally {
    showLoading(false);
  }
}

async function exportWordsPDF() {
  showLoading(true);
  try {
    const words = await db.export();
    if (words.length === 0) {
      showToast('没有单词可导出');
      showLoading(false);
      return;
    }

    const container = document.getElementById('pdf-container');
    const wordsContainer = document.getElementById('pdf-words');
    const dateEl = container.querySelector('.pdf-date');

    dateEl.textContent = `导出日期：${new Date().toLocaleDateString('zh-CN')}  共 ${words.length} 个单词`;

    // 按年份分组
    const groups = new Map();
    words.forEach(w => {
      const year = (w.year || '').trim();
      if (!groups.has(year)) groups.set(year, []);
      groups.get(year).push(w);
    });
    const years = sortYearValues(Array.from(groups.keys()));

    let html = '';
    let num = 0;
    years.forEach(year => {
      const yearWords = groups.get(year);
      const label = year === '' ? '未分类' : year;
      html += `<div class="pdf-year-header">${escapeHtml(label)}</div>`;
      yearWords.forEach(w => {
        num++;
        html += `
          <div class="pdf-word-item">
            <div class="pdf-word">${num}. ${escapeHtml(w.word)}</div>
            ${w.phonetic ? `<div class="pdf-phonetic">${escapeHtml(w.phonetic)}</div>` : ''}
            <div class="pdf-meaning">${escapeHtml(w.meaning)}</div>
            ${w.example ? `<div class="pdf-example">${escapeHtml(w.example)}</div>` : ''}
          </div>
        `;
      });
    });
    wordsContainer.innerHTML = html;

    container.classList.remove('hidden');
    closeSettings();

    setTimeout(() => {
      window.print();
      setTimeout(() => {
        container.classList.add('hidden');
      }, 500);
    }, 300);

    showToast('请在打印对话框中选择「保存为PDF」');
  } catch (e) {
    showToast('导出失败：' + e.message);
  } finally {
    showLoading(false);
  }
}

async function clearAllWords() {
  if (!confirm('确定要清空所有单词吗？此操作不可恢复！')) return;

  showLoading(true);
  try {
    await db.clear();
    allWords = [];
    filteredWords = [];
    activeYear = '';
    renderWordList(filteredWords);
    renderYearFilter();
    showToast('已清空所有单词');
  } catch (e) {
    showToast('清空失败：' + e.message);
  } finally {
    showLoading(false);
  }
}

// ===== 发音功能 =====
function speakWord(word) {
  if (!word) return;
  if (!window.speechSynthesis) {
    showToast('您的浏览器不支持语音朗读');
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = 'en-US';
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}

// 事件委托：朗读按钮
document.addEventListener('click', (e) => {
  const speakBtn = e.target.closest('.speak-btn');
  if (speakBtn) {
    e.stopPropagation();
    const word = speakBtn.dataset.speak;
    if (word) {
      speakWord(word);
    }
  }
});

// ===== 主题切换 =====
const THEME_KEY = 'wordbook_theme';

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved || '');
}

function setTheme(theme) {
  applyTheme(theme);
  localStorage.setItem(THEME_KEY, theme);
  const themeNames = {
    '': '明亮',
    'dark': '暗黑',
    'light-purple': '浅紫',
    'light-yellow': '暖黄',
    'sakura-pink': '樱粉',
    'matcha-green': '抹茶'
  };
  showToast(`已切换为${themeNames[theme] || '默认'}主题`);
}

function applyTheme(theme) {
  const html = document.documentElement;
  if (!theme) {
    html.removeAttribute('data-theme');
  } else {
    html.setAttribute('data-theme', theme);
  }
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  const themeColors = {
    '': '#4F46E5',
    'dark': '#0F172A',
    'light-purple': '#FAF5FF',
    'light-yellow': '#FFFBEB',
    'sakura-pink': '#FDF2F8',
    'matcha-green': '#F7FEE7'
  };
  if (metaTheme) {
    metaTheme.content = themeColors[theme] || '#4F46E5';
  }
  document.querySelectorAll('.theme-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
}
