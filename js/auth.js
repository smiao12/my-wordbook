/**
 * 认证 — Supabase Auth（邮箱 + 密码）
 * 未登录时纯本地模式，登录后云端同步
 */

function showAppPage() {
  document.getElementById('app-page').classList.remove('hidden');
  document.getElementById('import-page').classList.add('hidden');
  document.getElementById('writing-page').classList.add('hidden');
}

// 保留空壳，避免历史引用报错
function showAuthPage() {
  showAppPage();
}

// ===== 认证操作 =====
async function restoreSession() {
  if (!initSupabase()) return null;
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error || !data.session) return null;
    currentUser = { id: data.session.user.id, email: data.session.user.email };
    return currentUser;
  } catch (e) {
    return null;
  }
}

async function handleSignUp() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;

  if (!email || !password) {
    showToast('请输入邮箱和密码');
    return;
  }
  if (password.length < 6) {
    showToast('密码至少 6 位');
    return;
  }

  showLoading(true);
  try {
    if (!initSupabase()) throw new Error('Supabase 未初始化');
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) throw error;

    if (data.session) {
      currentUser = { id: data.user.id, email: data.user.email };
      showToast('注册成功，正在同步...');
      closeAuthModal();
      await syncAfterLogin();
    } else if (data.user) {
      // 需要邮箱验证
      showToast('注册成功！请查收邮箱验证后登录（或已在后台关闭验证）');
      closeAuthModal();
    }
  } catch (e) {
    showToast('注册失败：' + (e.message || e));
  } finally {
    showLoading(false);
  }
}

async function handleSignIn() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;

  if (!email || !password) {
    showToast('请输入邮箱和密码');
    return;
  }

  showLoading(true);
  try {
    if (!initSupabase()) throw new Error('Supabase 未初始化');
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;

    currentUser = { id: data.user.id, email: data.user.email };
    showToast('登录成功，正在同步...');
    closeAuthModal();
    await syncAfterLogin();
  } catch (e) {
    showToast('登录失败：' + (e.message || e));
  } finally {
    showLoading(false);
  }
}

async function handleSignOut() {
  showLoading(true);
  try {
    if (supabaseClient) {
      await supabaseClient.auth.signOut();
    }
  } catch (e) {
    console.error('Sign out error:', e);
  }
  currentUser = null;
  showLoading(false);
  closeSettings();
  showToast('已退出登录，回到本地模式');
  updateAccountUI();
}

// 登录/注册后的同步
async function syncAfterLogin() {
  try {
    allWords = await db.syncFromCloud();
  } catch (e) {
    allWords = await db.getAll();
    showToast('同步失败，已显示本地数据');
  }
  filteredWords = [...allWords];
  renderYearFilter();
  renderWordList(filteredWords);
  updateAccountUI();
}

// 更新账号相关 UI
function updateAccountUI() {
  const emailEl = document.getElementById('user-email');
  const accountActions = document.getElementById('account-actions');
  if (!emailEl) return;

  if (currentUser && currentUser.email) {
    emailEl.textContent = '已登录：' + currentUser.email;
    if (accountActions) {
      accountActions.innerHTML = `<button class="btn btn-outline btn-sm" onclick="handleSignOut()">退出登录</button>`;
    }
  } else {
    emailEl.textContent = '本地模式（未登录）';
    if (accountActions) {
      accountActions.innerHTML = `<button class="btn btn-primary btn-sm" onclick="openAuthModal()">登录 / 注册</button>`;
    }
  }
}

function openAuthModal() {
  document.getElementById('auth-modal').classList.remove('hidden');
}

function closeAuthModal() {
  document.getElementById('auth-modal').classList.add('hidden');
}
