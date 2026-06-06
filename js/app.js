/**
 * 主应用逻辑 — 纯本地模式
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
  loadWords();

  // 绑定键盘事件
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeWordModal();
      closeSettings();
    }
  });
});

// ===== 加载单词 =====
async function loadWords() {
  showLoading(true);
  try {
    allWords = await db.getAll();
    filteredWords = [...allWords];
    renderTagFilter();
    renderWordList(filteredWords);
  } catch (e) {
    showToast('加载失败：' + e.message);
  } finally {
    showLoading(false);
  }
}

// ===== 搜索 =====
function handleSearch() {
  const query = document.getElementById('search-input').value.trim().toLowerCase();
  if (!query) {
    filteredWords = [...allWords];
  } else {
    filteredWords = allWords.filter(word =>
      (word.word && word.word.toLowerCase().includes(query)) ||
      (word.meaning && word.meaning.toLowerCase().includes(query)) ||
      (word.example && word.example.toLowerCase().includes(query))
    );
  }
  renderWordList(filteredWords);
}

// ===== 标签筛选 =====
function filterByTag(tag) {
  document.querySelectorAll('.tag-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tag === tag);
  });

  if (!tag) {
    filteredWords = [...allWords];
  } else {
    filteredWords = allWords.filter(word =>
      word.tags && word.tags.includes(tag)
    );
  }

  // 同时应用搜索筛选
  const query = document.getElementById('search-input').value.trim().toLowerCase();
  if (query) {
    filteredWords = filteredWords.filter(word =>
      (word.word && word.word.toLowerCase().includes(query)) ||
      (word.meaning && word.meaning.toLowerCase().includes(query)) ||
      (word.example && word.example.toLowerCase().includes(query))
    );
  }

  renderWordList(filteredWords);
}

// ===== 查词 =====
async function lookupWord() {
  const wordInput = document.getElementById('word-input');
  const meaningInput = document.getElementById('meaning-input');
  const phoneticInput = document.getElementById('phonetic-input');
  const word = wordInput.value.trim();

  if (!word) {
    showToast('请输入英文单词');
    return;
  }

  showLoading(true);

  // 首先：MyMemory 翻译 API（免费，中英翻译）
  try {
    const transResponse = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|zh`
    );
    const transData = await transResponse.json();
    if (transData.responseStatus === 200 && transData.responseData) {
      const translation = transData.responseData.translatedText;
      if (translation && translation.toLowerCase() !== word.toLowerCase()) {
        meaningInput.value = translation;
        showToast('查词完成');
        showLoading(false);
        return;
      }
    }
  } catch (e) {
    // MyMemory 失败，继续降级
  }

  // 其次：Free Dictionary API（英文释义 + 音标）
  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (response.ok) {
      const data = await response.json();
      const entry = data[0];

      // 提取音标
      if (entry.phonetic) {
        phoneticInput.value = entry.phonetic;
      } else if (entry.phonetics && entry.phonetics[0]) {
        phoneticInput.value = entry.phonetics[0].text || '';
      }

      // 提取英文释义
      const meanings = [];
      if (entry.meanings) {
        entry.meanings.forEach(m => {
          if (m.definitions) {
            m.definitions.slice(0, 2).forEach(d => {
              meanings.push(d.definition);
            });
          }
        });
      }

      if (!meaningInput.value && meanings.length > 0) {
        meaningInput.value = meanings.slice(0, 3).join('; ');
      }

      showToast('查词完成（英文释义），请补充中文释义');
    } else {
      showToast('查词失败，请手动输入释义');
    }
  } catch (e) {
    showToast('查词失败，请手动输入释义');
  } finally {
    showLoading(false);
  }
}

// ===== 保存单词 =====
async function saveWord() {
  const id = document.getElementById('word-id').value;
  const word = document.getElementById('word-input').value.trim();
  const meaning = document.getElementById('meaning-input').value.trim();
  const phonetic = document.getElementById('phonetic-input').value.trim();
  const example = document.getElementById('example-input').value.trim();
  const tagsStr = document.getElementById('tags-input').value.trim();

  if (!word) {
    showToast('请输入英文单词');
    return;
  }
  if (!meaning) {
    showToast('请输入中文释义');
    return;
  }

  const tags = tagsStr ? tagsStr.split(/[,，]/).map(t => t.trim()).filter(Boolean) : [];

  showLoading(true);
  try {
    if (id) {
      // 编辑
      await db.update(id, { word, meaning, phonetic, example, tags });
      const idx = allWords.findIndex(w => w.id === id);
      if (idx >= 0) {
        allWords[idx] = { ...allWords[idx], word, meaning, phonetic, example, tags };
      }
      showToast('单词已更新');
    } else {
      // 新增
      const newWord = {
        word,
        meaning,
        phonetic,
        example,
        tags
      };
      const saved = await db.add(newWord);
      allWords.unshift(saved);
      showToast('单词已保存');
    }

    // 更新标签
    tags.forEach(tag => allTags.add(tag));

    // 重新渲染
    handleSearch();
    renderTagFilter();

    // 如果在复习模式，将新词加入复习队列
    const reviewPage = document.getElementById('review-page');
    if (!reviewPage.classList.contains('hidden') && reviewOrder.length > 0) {
      // 旧索引映射到新 allWords（新词在 allWords[0]，其他索引+1）
      reviewOrder = reviewOrder.map(idx => idx + 1);
      // 在当前位置之后插入新词（索引 0）
      const insertPos = currentReviewIndex + 1;
      reviewOrder.splice(insertPos, 0, 0);
      // currentReviewIndex 不变，保持当前正在复习的词
      renderReviewCard();
      saveReviewProgress();
    }

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
    handleSearch();
    showToast('已删除');
  } catch (e) {
    showToast('删除失败：' + e.message);
  } finally {
    showLoading(false);
  }
}

// ===== 复习模式 =====
function initReview() {
  if (allWords.length === 0) {
    reviewOrder = [];
    currentReviewIndex = 0;
    isRandomOrder = false;
    renderReviewCard();
    return;
  }

  // 尝试加载保存的进度
  const saved = loadReviewProgress();
  if (saved && saved.reviewOrder && saved.reviewOrder.length > 0) {
    reviewOrder = saved.reviewOrder;
    currentReviewIndex = Math.min(saved.currentReviewIndex, reviewOrder.length - 1);
    isRandomOrder = saved.isRandomOrder || false;
  } else {
    reviewOrder = Array.from({ length: allWords.length }, (_, i) => i);
    currentReviewIndex = 0;
    isRandomOrder = false;
  }

  renderReviewCard();
}

function flipCard() {
  const card = document.getElementById('review-card');
  card.classList.toggle('flipped');
}

function nextCard() {
  if (reviewOrder.length === 0) return;
  currentReviewIndex = (currentReviewIndex + 1) % reviewOrder.length;
  renderReviewCard();
  saveReviewProgress();
}

function prevCard() {
  if (reviewOrder.length === 0) return;
  currentReviewIndex = (currentReviewIndex - 1 + reviewOrder.length) % reviewOrder.length;
  renderReviewCard();
  saveReviewProgress();
}

function shuffleCards() {
  if (reviewOrder.length <= 1) return;
  isRandomOrder = !isRandomOrder;

  if (isRandomOrder) {
    // Fisher-Yates 洗牌
    for (let i = reviewOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [reviewOrder[i], reviewOrder[j]] = [reviewOrder[j], reviewOrder[i]];
    }
  } else {
    // 恢复原始顺序
    reviewOrder.sort((a, b) => a - b);
  }

  currentReviewIndex = 0;
  renderReviewCard();
  showToast(isRandomOrder ? '已随机排序' : '已恢复顺序');
  saveReviewProgress();
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
        phonetic: '',
        tags: []
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
      phonetic: item.phonetic || '',
      tags: item.tags || []
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
      ${w.meaning ? `<div class="import-preview-meaning">${escapeHtml(w.meaning)}</div>` : '<div class="import-preview-meaning" style="color:var(--text-muted)">（无释义，将自动查词）</div>'}
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

  showLoading(true);
  let successCount = 0;
  let failCount = 0;

  for (const wordData of pendingImportWords) {
    try {
      const wordToSave = { ...wordData };

      // 如果没有释义，尝试查词
      if (!wordToSave.meaning) {
        let translated = false;

        // 先尝试 MyMemory
        try {
          const response = await fetch(
            `https://api.mymemory.translated.net/get?q=${encodeURIComponent(wordToSave.word)}&langpair=en|zh`
          );
          const data = await response.json();
          if (data.responseStatus === 200 && data.responseData) {
            const text = data.responseData.translatedText;
            if (text && text.toLowerCase() !== wordToSave.word.toLowerCase()) {
              wordToSave.meaning = text;
              translated = true;
            }
          }
        } catch (e) { /* ignore */ }

        if (!translated) {
          wordToSave.meaning = '（请手动补充释义）';
        }
      }

      // 纯本地模式，不需要 user_id

      const saved = await db.add(wordToSave);
      allWords.unshift(saved);
      successCount++;

      // 更新标签集合
      if (wordToSave.tags) {
        wordToSave.tags.forEach(tag => allTags.add(tag));
      }
    } catch (e) {
      failCount++;
      console.error('Import failed for word:', wordData.word, e);
    }
  }

  // 重新渲染
  handleSearch();
  renderTagFilter();

  document.getElementById('import-preview').classList.add('hidden');
  document.getElementById('import-text').value = '';
  document.getElementById('import-json').value = '';
  pendingImportWords = [];

  showLoading(false);
  showToast(`导入完成：成功 ${successCount} 条，失败 ${failCount} 条`);

  // 切换回单词列表
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

    // 设置日期
    dateEl.textContent = `导出日期：${new Date().toLocaleDateString('zh-CN')}  共 ${words.length} 个单词`;

    // 生成单词列表
    wordsContainer.innerHTML = words.map((w, i) => `
      <div class="pdf-word-item">
        <div class="pdf-word">${i + 1}. ${escapeHtml(w.word)}</div>
        ${w.phonetic ? `<div class="pdf-phonetic">${escapeHtml(w.phonetic)}</div>` : ''}
        <div class="pdf-meaning">${escapeHtml(w.meaning)}</div>
        ${w.example ? `<div class="pdf-example">${escapeHtml(w.example)}</div>` : ''}
        ${w.tags && w.tags.length ? `<div class="pdf-tags">${w.tags.map(t => `<span class="pdf-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
      </div>
    `).join('');

    // 显示打印容器
    container.classList.remove('hidden');

    // 关闭设置弹窗
    closeSettings();

    // 延迟执行打印，让浏览器渲染完成
    setTimeout(() => {
      window.print();
      // 打印完成后隐藏
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
    allTags.clear();
    renderWordList(filteredWords);
    renderTagFilter();
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
  // 取消之前的朗读
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = 'en-US';
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}

function speakCurrentWord() {
  if (reviewOrder.length === 0) return;
  const wordIndex = reviewOrder[currentReviewIndex];
  const word = allWords[wordIndex];
  if (word) {
    speakWord(word.word);
  }
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

// ===== 触摸滑动支持 =====
let touchStartX = 0;
let touchEndX = 0;

document.addEventListener('DOMContentLoaded', () => {
  const reviewCard = document.getElementById('review-card');
  if (reviewCard) {
    reviewCard.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    reviewCard.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      handleSwipe();
    }, { passive: true });
  }
});

function handleSwipe() {
  const swipeThreshold = 60;
  const diff = touchStartX - touchEndX;

  if (Math.abs(diff) > swipeThreshold) {
    if (diff > 0) {
      nextCard(); // 左滑 → 下一个
    } else {
      prevCard(); // 右滑 → 上一个
    }
  }
}

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
  // 更新 manifest theme-color
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
  // 更新激活状态
  document.querySelectorAll('.theme-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
}

function toggleThemePicker() {
  showSettings();
}
