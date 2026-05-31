/**
 * 主应用逻辑
 */

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initSupabase();
  await initAuth();

  // 如果未登录且没有本地用户，显示登录页
  if (!currentUser) {
    showAuthPage();
  }

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

  // 优先：尝试 Supabase Edge Function（如果配置了百度翻译）
  if (supabase) {
    try {
      const { data, error } = await supabase.functions.invoke('translate', {
        body: { word }
      });
      if (!error && data?.translation) {
        meaningInput.value = data.translation;
        showToast('查词完成');
        showLoading(false);
        return;
      }
    } catch (e) {
      // Edge Function 不可用，继续降级
    }
  }

  // 其次：MyMemory 翻译 API（免费，中英翻译）
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

  // 最后：Free Dictionary API（英文释义 + 音标）
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
        tags,
        user_id: currentUser?.id || 'local'
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
    renderReviewCard();
    return;
  }

  // 初始化复习顺序
  reviewOrder = Array.from({ length: allWords.length }, (_, i) => i);
  currentReviewIndex = 0;
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
}

function prevCard() {
  if (reviewOrder.length === 0) return;
  currentReviewIndex = (currentReviewIndex - 1 + reviewOrder.length) % reviewOrder.length;
  renderReviewCard();
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

      wordToSave.user_id = currentUser?.id || 'local';

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
  showToast(theme === '' ? '已切换为明亮主题' : theme === 'dark' ? '已切换为暗黑主题' : '已切换为浅紫主题');
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
  if (metaTheme) {
    metaTheme.content = theme === 'dark' ? '#0F172A' : theme === 'light-purple' ? '#FAF5FF' : '#4F46E5';
  }
  // 更新激活状态
  document.querySelectorAll('.theme-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
}

function toggleThemePicker() {
  showSettings();
}
