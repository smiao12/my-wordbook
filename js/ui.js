/**
 * UI 渲染模块 — v2 按考研年份分组
 */

// 全局状态
let allWords = [];
let filteredWords = [];
let activeYear = ''; // 当前筛选的年份，'' 表示全部
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

// ===== 年份排序（数字降序，未分类最后） =====
function sortYearValues(years) {
  return years.sort((a, b) => {
    if (a === '' && b !== '') return 1;
    if (b === '' && a !== '') return -1;
    const na = Number(a), nb = Number(b);
    if (!isNaN(na) && !isNaN(nb)) return nb - na;
    if (!isNaN(na)) return -1;
    if (!isNaN(nb)) return 1;
    return String(b).localeCompare(String(a));
  });
}

// ===== 事件委托：点击处理 =====
document.addEventListener('click', (e) => {
  // 删除单词
  const deleteBtn = e.target.closest('[data-action="delete"]');
  if (deleteBtn) {
    e.stopPropagation();
    const id = deleteBtn.dataset.id;
    if (id) deleteWord(id);
    return;
  }

  // 朗读按钮（单独处理，见 app.js 的 speak 委托）
  if (e.target.closest('.speak-btn')) {
    return;
  }

  // 编辑单词（点击行，排除删除按钮）
  const row = e.target.closest('.word-row');
  if (row) {
    const id = row.dataset.id;
    if (id) showEditWordModal(id);
    return;
  }

  // 年份筛选
  const yearBtn = e.target.closest('.tag-btn');
  if (yearBtn) {
    const year = yearBtn.dataset.year || '';
    filterByYear(year);
    return;
  }
});

// ===== 渲染单个单词行 =====
function renderWordRow(word) {
  return `
    <div class="word-row" data-id="${escapeHtml(word.id)}">
      <div class="word-row-main">
        <div class="word-row-title">
          <span class="word-text">${escapeHtml(word.word)}</span>
          ${word.phonetic ? `<span class="word-phonetic">${escapeHtml(word.phonetic)}</span>` : ''}
          <button class="speak-btn" data-speak="${escapeHtml(word.word)}" title="朗读">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
              <path d="M15.54 8.46a5 5 0 010 7.07"/>
            </svg>
          </button>
        </div>
        <button class="word-action-btn" data-action="delete" data-id="${escapeHtml(word.id)}" title="删除">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
        </button>
      </div>
      <div class="word-meaning">${escapeHtml(word.meaning)}</div>
      ${word.example ? `<div class="word-example">${escapeHtml(word.example)}</div>` : ''}
    </div>
  `;
}

// ===== 渲染单词列表（按年份分组） =====
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

  // 按年份分组
  const groups = new Map();
  words.forEach(word => {
    const year = (word.year || '').trim();
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year).push(word);
  });

  const years = sortYearValues(Array.from(groups.keys()));
  let html = '';
  years.forEach(year => {
    const yearWords = groups.get(year);
    const label = year === '' ? '未分类' : year;
    html += `<div class="year-group">`;
    html += `<div class="year-group-header">`;
    html += `<span class="year-group-title">${escapeHtml(label)}</span>`;
    html += `<span class="year-group-count">${yearWords.length} 词</span>`;
    html += `</div>`;
    html += `<div class="year-group-words">`;
    yearWords.forEach(word => {
      html += renderWordRow(word);
    });
    html += `</div></div>`;
  });

  container.innerHTML = html;
}

// ===== 渲染年份筛选 =====
function renderYearFilter() {
  const container = document.getElementById('year-filter');
  const yearSet = new Set();
  allWords.forEach(word => {
    const y = (word.year || '').trim();
    if (y !== '') yearSet.add(y);
  });

  const years = sortYearValues(Array.from(yearSet));
  let html = `<button class="tag-btn ${activeYear === '' ? 'active' : ''}" data-year="" onclick="filterByYear('')">全部</button>`;
  years.forEach(year => {
    html += `<button class="tag-btn ${activeYear === year ? 'active' : ''}" data-year="${escapeHtml(year)}" onclick="filterByYear('${escapeHtml(year)}')">${escapeHtml(year)}</button>`;
  });
  container.innerHTML = html;
}

// ===== 标签页切换 =====
function switchTab(tab) {
  // 更新导航状态
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });

  // 隐藏所有页面
  document.getElementById('app-page').classList.add('hidden');
  document.getElementById('import-page').classList.add('hidden');
  document.getElementById('writing-page').classList.add('hidden');

  // 显示对应页面
  if (tab === 'list') {
    document.getElementById('app-page').classList.remove('hidden');
  } else if (tab === 'import') {
    document.getElementById('import-page').classList.remove('hidden');
  } else if (tab === 'writing') {
    document.getElementById('writing-page').classList.remove('hidden');
  }
}

// ===== 模态框 =====
function showAddWordModal() {
  document.getElementById('modal-title').textContent = '添加单词';
  document.getElementById('word-id').value = '';
  document.getElementById('word-input').value = '';
  document.getElementById('meaning-input').value = '';
  document.getElementById('phonetic-input').value = '';
  document.getElementById('year-input').value = activeYear || '';
  document.getElementById('example-input').value = '';
  document.getElementById('word-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('word-input').focus(), 100);
}

function showEditWordModal(id) {
  const word = allWords.find(w => w.id === id);
  if (!word) return;

  document.getElementById('modal-title').textContent = '编辑单词';
  document.getElementById('word-id').value = word.id;
  document.getElementById('word-input').value = word.word;
  document.getElementById('meaning-input').value = word.meaning || '';
  document.getElementById('phonetic-input').value = word.phonetic || '';
  document.getElementById('year-input').value = word.year || '';
  document.getElementById('example-input').value = word.example || '';
  document.getElementById('word-modal').classList.remove('hidden');
}

function closeWordModal() {
  document.getElementById('word-modal').classList.add('hidden');
}

function showSettings() {
  updateAccountUI();
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
