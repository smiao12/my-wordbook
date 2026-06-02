/**
 * UI 渲染模块
 */

// 全局状态
let allWords = [];
let filteredWords = [];
let allTags = new Set();
let currentReviewIndex = 0;
let reviewOrder = []; // 复习顺序的索引数组
let isRandomOrder = false;
let pendingImportWords = [];
let toastTimeout = null;

// ===== Toast 提示 =====
function showToast(message, duration = 2500) {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toast-message');
  clearTimeout(toastTimeout);
  msgEl.textContent = message;
  toast.classList.remove('hidden');
  toastTimeout = setTimeout(() => {
    toast.classList.add('hidden');
  }, duration);
}

// ===== Loading =====
function showLoading(show) {
  const loading = document.getElementById('loading');
  if (show) {
    loading.classList.remove('hidden');
  } else {
    loading.classList.add('hidden');
  }
}

// ===== HTML 转义 =====
const escapeHtml = (() => {
  const div = document.createElement('div');
  return (text) => {
    if (!text) return '';
    div.textContent = text;
    return div.innerHTML.replace(/`/g, '&#96;').replace(/\$/g, '&#36;');
  };
})();

// ===== 事件委托：单词卡片点击 =====
document.addEventListener('click', (e) => {
  // 编辑单词
  const card = e.target.closest('.word-card');
  if (card && !e.target.closest('.word-actions')) {
    const id = card.dataset.id;
    if (id) showEditWordModal(id);
    return;
  }

  // 删除单词
  const deleteBtn = e.target.closest('[data-action="delete"]');
  if (deleteBtn) {
    const id = deleteBtn.dataset.id;
    if (id) deleteWord(id);
    return;
  }

  // 标签筛选
  const tagBtn = e.target.closest('.tag-btn');
  if (tagBtn) {
    const tag = tagBtn.dataset.tag || '';
    filterByTag(tag);
    return;
  }
});

// ===== 渲染单词列表 =====
function renderWordList(words) {
  const container = document.getElementById('word-list');
  const emptyState = document.getElementById('empty-state');
  const countEl = document.getElementById('word-count');

  countEl.textContent = `${words.length} 词`;

  if (words.length === 0) {
    container.innerHTML = '';
    container.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  container.classList.remove('hidden');
  emptyState.classList.add('hidden');

  container.innerHTML = words.map(word => `
    <div class="word-card" data-id="${escapeHtml(word.id)}">
      <div class="word-card-header">
        <div class="word-title">
          <span class="word-text">${escapeHtml(word.word)}</span>
          ${word.phonetic ? `<span class="word-phonetic">${escapeHtml(word.phonetic)}</span>` : ''}
          <button class="speak-btn" data-speak="${escapeHtml(word.word)}" title="朗读">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 010 7.07"/>
            </svg>
          </button>
        </div>
        <div class="word-actions">
          <button class="word-action-btn" data-action="delete" data-id="${escapeHtml(word.id)}" title="删除">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="word-meaning">${escapeHtml(word.meaning)}</div>
      ${word.example ? `<div class="word-example">${escapeHtml(word.example)}</div>` : ''}
      ${word.tags && word.tags.length > 0 ? `
        <div class="word-tags">
          ${word.tags.map(tag => `<span class="word-tag">${escapeHtml(tag)}</span>`).join('')}
        </div>
      ` : ''}
    </div>
  `).join('');
}

// ===== 渲染标签筛选 =====
function renderTagFilter() {
  const container = document.getElementById('tag-filter');
  allTags.clear();
  allWords.forEach(word => {
    if (word.tags) {
      word.tags.forEach(tag => allTags.add(tag));
    }
  });

  const tags = Array.from(allTags).sort();
  let html = `<button class="tag-btn active" data-tag="">全部</button>`;
  tags.forEach(tag => {
    html += `<button class="tag-btn" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`;
  });
  container.innerHTML = html;
}

// ===== 渲染复习卡片 =====
function renderReviewCard() {
  if (reviewOrder.length === 0) {
    document.getElementById('review-word').textContent = '暂无单词';
    document.getElementById('review-phonetic').textContent = '';
    document.getElementById('review-meaning').textContent = '先去添加一些单词吧';
    document.getElementById('review-example').textContent = '';
    document.getElementById('review-current').textContent = '0';
    document.getElementById('review-total').textContent = '0';
    return;
  }

  const wordIndex = reviewOrder[currentReviewIndex];
  const word = allWords[wordIndex];

  if (!word) return;

  const reviewWordEl = document.getElementById('review-word');
  if (reviewWordEl) reviewWordEl.textContent = word.word;
  document.getElementById('review-phonetic').textContent = word.phonetic || '';
  document.getElementById('review-meaning').textContent = word.meaning;
  document.getElementById('review-example').textContent = word.example || '';
  document.getElementById('review-current').textContent = currentReviewIndex + 1;
  document.getElementById('review-total').textContent = reviewOrder.length;

  // 重置翻转状态
  document.getElementById('review-card').classList.remove('flipped');
}

// ===== 标签页切换 =====
function switchTab(tab) {
  // 更新导航状态
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });

  // 隐藏所有页面
  document.getElementById('app-page').classList.add('hidden');
  document.getElementById('review-page').classList.add('hidden');
  document.getElementById('import-page').classList.add('hidden');

  // 显示对应页面
  if (tab === 'list') {
    document.getElementById('app-page').classList.remove('hidden');
  } else if (tab === 'review') {
    document.getElementById('review-page').classList.remove('hidden');
    initReview();
  } else if (tab === 'import') {
    document.getElementById('import-page').classList.remove('hidden');
  }
}

// ===== 模态框 =====
function showAddWordModal() {
  document.getElementById('modal-title').textContent = '添加单词';
  document.getElementById('word-id').value = '';
  document.getElementById('word-input').value = '';
  document.getElementById('meaning-input').value = '';
  document.getElementById('phonetic-input').value = '';
  document.getElementById('example-input').value = '';
  document.getElementById('tags-input').value = '';
  document.getElementById('word-input').disabled = false;
  document.getElementById('lookup-btn').style.display = '';
  document.getElementById('word-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('word-input').focus(), 100);
}

async function showEditWordModal(id) {
  const word = allWords.find(w => w.id === id);
  if (!word) return;

  document.getElementById('modal-title').textContent = '编辑单词';
  document.getElementById('word-id').value = word.id;
  document.getElementById('word-input').value = word.word;
  document.getElementById('meaning-input').value = word.meaning || '';
  document.getElementById('phonetic-input').value = word.phonetic || '';
  document.getElementById('example-input').value = word.example || '';
  document.getElementById('tags-input').value = (word.tags || []).join(', ');
  document.getElementById('word-input').disabled = true;
  document.getElementById('lookup-btn').style.display = 'none';
  document.getElementById('word-modal').classList.remove('hidden');
}

function closeWordModal() {
  document.getElementById('word-modal').classList.add('hidden');
}

function showSettings() {
  updateUserDisplay();
  document.getElementById('settings-modal').classList.remove('hidden');
}

function closeSettings() {
  document.getElementById('settings-modal').classList.add('hidden');
}

// ===== 导入标签切换 =====
function switchImportTab(tab) {
  document.querySelectorAll('.import-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.importTab === tab);
  });

  if (tab === 'text') {
    document.getElementById('import-text-panel').classList.remove('hidden');
    document.getElementById('import-json-panel').classList.add('hidden');
  } else {
    document.getElementById('import-text-panel').classList.add('hidden');
    document.getElementById('import-json-panel').classList.remove('hidden');
  }

  document.getElementById('import-preview').classList.add('hidden');
  pendingImportWords = [];
}
