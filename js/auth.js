/**
 * 认证模块 — Supabase Auth + 本地模式（自动）
 */

let currentUser = null;

// 更新云端状态提示
function updateCloudStatus() {
  const el = document.getElementById('cloud-status');
  if (!el) return;
  if (_sbClient) {
    el.textContent = '✓ 云端同步已配置';
    el.className = 'cloud-status configured';
  } else {
    el.textContent = '⚠ 云端同步未配置，已自动使用本地模式';
    el.className = 'cloud-status not-configured';
  }
}

// 初始化认证状态
async function initAuth() {
  updateCloudStatus();

  // 如果已配置 Supabase（且 auth 可用），检查会话
  if (_sbClient && _sbClient.auth) {
    try {
      const { data: { session } } = await _sbClient.auth.getSession();
      if (session?.user) {
        currentUser = session.user;
        showAppPage();
        loadWords();
        return;
      }

      // 监听认证状态变化
      const { data: { subscription } } = _sbClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          currentUser = session.user;
          showAppPage();
          loadWords();
        } else if (event === 'SIGNED_OUT') {
          currentUser = null;
          showAuthPage();
        }
      });

      window._authSubscription = subscription;
      return;
    } catch (e) {
      console.error('Supabase auth init failed:', e);
      // 清除错误配置，回退到本地
      _sbClient = null;
    }
  }

  // 未配置或配置不正确：自动进入本地模式
  if (_sbClient && !_sbClient.auth) {
    _sbClient = null;
  }
  enterLocalMode();
}

// 自动进入本地模式
function enterLocalMode() {
  isLocalMode = true;
  currentUser = { id: 'local', email: '本地用户' };
  showAppPage();
  loadWords();
}

// 注册
async function handleRegister() {
  if (!_sbClient || !_sbClient.auth) {
    showToast('云端同步未配置，已自动使用本地模式');
    // 清除可能错误的配置
    localStorage.removeItem('sb_url');
    localStorage.removeItem('sb_key');
    _sbClient = null;
    enterLocalMode();
    return;
  }

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
    const { data, error } = await _sbClient.auth.signUp({ email, password });
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
  if (!_sbClient || !_sbClient.auth) {
    showToast('云端同步未配置，已自动使用本地模式');
    localStorage.removeItem('sb_url');
    localStorage.removeItem('sb_key');
    _sbClient = null;
    enterLocalMode();
    return;
  }

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (!email || !password) {
    showToast('请填写邮箱和密码');
    return;
  }

  showLoading(true);
  try {
    const { data, error } = await _sbClient.auth.signInWithPassword({ email, password });
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
    currentUser = null;
    isLocalMode = false;
    showAuthPage();
    return;
  }

  showLoading(true);
  try {
    if (window._authSubscription) {
      window._authSubscription.unsubscribe();
      window._authSubscription = null;
    }
    await _sbClient.auth.signOut();
    currentUser = null;
    showAuthPage();
  } catch (e) {
    showToast('登出失败：' + e.message);
  } finally {
    showLoading(false);
  }
}

// 页面切换
function showAuthPage() {
  document.getElementById('auth-page').classList.remove('hidden');
  document.getElementById('app-page').classList.add('hidden');
  document.getElementById('review-page').classList.add('hidden');
  document.getElementById('import-page').classList.add('hidden');
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
