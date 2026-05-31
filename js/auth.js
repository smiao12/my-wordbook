/**
 * 认证模块 — Supabase Auth + 本地模式
 */

let currentUser = null;

// 初始化认证状态
async function initAuth() {
  if (!supabase) {
    // 检查本地模式
    const localUser = localStorage.getItem('local_user');
    if (localUser) {
      currentUser = JSON.parse(localUser);
      isLocalMode = true;
      showAppPage();
      loadWords();
    }
    return;
  }

  // 检查已有会话
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    showAppPage();
    loadWords();
    return;
  }

  // 监听认证状态变化
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      currentUser = session.user;
      showAppPage();
      loadWords();
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      showAuthPage();
    }
  });

  // 保存订阅以便清理
  window._authSubscription = subscription;
}

// 注册
async function handleRegister() {
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;

  if (!email || !password) {
    showToast('请填写邮箱和密码');
    return;
  }
  if (password.length < 6) {
    showToast('密码至少 6 位');
    return;
  }

  showLoading(true);
  try {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    showToast('注册成功！请登录');
    showLogin();
  } catch (e) {
    showToast('注册失败：' + e.message);
  } finally {
    showLoading(false);
  }
}

// 登录
async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (!email || !password) {
    showToast('请填写邮箱和密码');
    return;
  }

  showLoading(true);
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user;
    showAppPage();
    loadWords();
    showToast('登录成功');
  } catch (e) {
    showToast('登录失败：' + e.message);
  } finally {
    showLoading(false);
  }
}

// 登出
async function handleLogout() {
  if (isLocalMode) {
    localStorage.removeItem('local_user');
    currentUser = null;
    isLocalMode = false;
    showAuthPage();
    return;
  }

  showLoading(true);
  try {
    // 清理订阅
    if (window._authSubscription) {
      window._authSubscription.unsubscribe();
      window._authSubscription = null;
    }
    await supabase.auth.signOut();
    currentUser = null;
    showAuthPage();
  } catch (e) {
    showToast('登出失败：' + e.message);
  } finally {
    showLoading(false);
  }
}

// 本地模式（无需登录）
function useLocalMode() {
  isLocalMode = true;
  currentUser = { id: 'local', email: '本地用户' };
  localStorage.setItem('local_user', JSON.stringify(currentUser));
  showAppPage();
  loadWords();
  showToast('已切换到本地模式，数据仅保存在本机');
}

// 页面切换
function showAuthPage() {
  document.getElementById('auth-page').classList.remove('hidden');
  document.getElementById('app-page').classList.add('hidden');
  document.getElementById('review-page').classList.add('hidden');
  document.getElementById('import-page').classList.add('hidden');
  // 清空输入
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
  document.getElementById('register-email').value = '';
  document.getElementById('register-password').value = '';
}

function showAppPage() {
  document.getElementById('auth-page').classList.add('hidden');
  document.getElementById('app-page').classList.remove('hidden');
  document.getElementById('review-page').classList.add('hidden');
  document.getElementById('import-page').classList.add('hidden');
  updateUserDisplay();
}

function showLogin() {
  document.getElementById('login-form').classList.remove('hidden');
  document.getElementById('register-form').classList.add('hidden');
}

function showRegister() {
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('register-form').classList.remove('hidden');
}

function updateUserDisplay() {
  const emailEl = document.getElementById('user-email');
  if (emailEl && currentUser) {
    emailEl.textContent = isLocalMode ? '本地模式' : (currentUser.email || '已登录');
  }
}
