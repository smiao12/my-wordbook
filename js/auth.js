/**
 * 简化版 — 无登录，直接本地模式
 */

let currentUser = { id: 'local', email: '本地用户' };

function updateUserDisplay() {
  const emailEl = document.getElementById('user-email');
  if (emailEl) {
    emailEl.textContent = '本地模式';
  }
}

function showAppPage() {
  document.getElementById('app-page').classList.remove('hidden');
  document.getElementById('review-page').classList.add('hidden');
  document.getElementById('import-page').classList.add('hidden');
  updateUserDisplay();
}

function showAuthPage() {
  // 不再使用，保留函数避免其他地方调用报错
  showAppPage();
}
