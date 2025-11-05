// 全局变量
let currentMessages = [];
let currentMessageId = null;
let currentAccounts = [];

// DOM 元素
const authScreen = document.getElementById('auth-screen');
const mainScreen = document.getElementById('main-screen');
const authBtn = document.getElementById('auth-btn');
const authCodeContainer = document.getElementById('auth-code-container');
const authCodeInput = document.getElementById('auth-code-input');
const submitAuthCodeBtn = document.getElementById('submit-auth-code-btn');
const authError = document.getElementById('auth-error');

const accountInfo = document.getElementById('account-info');
const accountsBtn = document.getElementById('accounts-btn');
const composeBtn = document.getElementById('compose-btn');
const syncBtn = document.getElementById('sync-btn');
const mailListContainer = document.getElementById('mail-list-container');
const loading = document.getElementById('loading');
const mailDetailEmpty = document.getElementById('mail-detail-empty');
const mailDetailContainer = document.getElementById('mail-detail-container');
const deleteBtn = document.getElementById('delete-btn');
const replyBtn = document.getElementById('reply-btn');

const composeModal = document.getElementById('compose-modal');
const composeTo = document.getElementById('compose-to');
const composeSubject = document.getElementById('compose-subject');
const composeMessage = document.getElementById('compose-message');
const sendBtn = document.getElementById('send-btn');
const composeError = document.getElementById('compose-error');
const composeSuccess = document.getElementById('compose-success');

const accountsModal = document.getElementById('accounts-modal');
const addAccountBtn = document.getElementById('add-account-btn');
const importAccountsBtn = document.getElementById('import-accounts-btn');
const exportAccountsBtn = document.getElementById('export-accounts-btn');
const accountsList = document.getElementById('accounts-list');
const accountsError = document.getElementById('accounts-error');
const accountsSuccess = document.getElementById('accounts-success');

// 初始化
async function initialize() {
  const result = await window.gmailAPI.checkAuth();
  if (result.success && result.isAuthorized) {
    showMainScreen();
    await loadActiveAccount();
    await loadMessages();
  } else {
    showAuthScreen();
  }
}

// 显示授权界面
function showAuthScreen() {
  authScreen.classList.remove('hidden');
  mainScreen.classList.add('hidden');
}

// 显示主界面
function showMainScreen() {
  authScreen.classList.add('hidden');
  mainScreen.classList.remove('hidden');
}

// 加载活动账号信息
async function loadActiveAccount() {
  const result = await window.gmailAPI.account.getActive();
  if (result.success && result.account) {
    accountInfo.textContent = result.account.email;
  }
}

// 授权按钮点击
authBtn.addEventListener('click', async () => {
  console.log('授权按钮被点击');
  authBtn.disabled = true;
  authBtn.textContent = '正在获取授权链接...';

  try {
    const result = await window.gmailAPI.authorize();
    console.log('授权结果:', result);

    if (result.success) {
      console.log('授权 URL:', result.authUrl);
      await window.gmailAPI.openExternal(result.authUrl);
      authCodeContainer.classList.remove('hidden');
      authError.classList.add('hidden');
      authBtn.textContent = '授权 Gmail 访问';
    } else {
      showError(authError, result.error);
      authBtn.textContent = '授权 Gmail 访问';
    }
  } catch (error) {
    console.error('授权过程出错:', error);
    showError(authError, error.message);
    authBtn.textContent = '授权 Gmail 访问';
  } finally {
    authBtn.disabled = false;
  }
});

// 提交授权码
submitAuthCodeBtn.addEventListener('click', async () => {
  const code = authCodeInput.value.trim();
  if (!code) {
    showError(authError, '请输入授权码');
    return;
  }

  const result = await window.gmailAPI.setAuthCode(code);
  if (result.success) {
    showMainScreen();
    await loadActiveAccount();
    await syncMessages();
  } else {
    showError(authError, result.error);
  }
});

// 同步邮件
async function syncMessages() {
  loading.classList.remove('hidden');
  mailListContainer.innerHTML = '';

  const result = await window.gmailAPI.syncMessages(50);
  loading.classList.add('hidden');

  if (result.success) {
    await loadMessages();
  } else {
    alert('同步失败: ' + result.error);
  }
}

// 加载邮件列表（从数据库）
async function loadMessages() {
  loading.classList.remove('hidden');

  const result = await window.gmailAPI.listMessages(50);
  loading.classList.add('hidden');

  if (result.success) {
    currentMessages = result.messages;
    renderMessageList(result.messages);
  } else {
    showError(authError, result.error);
  }
}

// 渲染邮件列表
function renderMessageList(messages) {
  mailListContainer.innerHTML = '';

  if (messages.length === 0) {
    mailListContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #80868b;">暂无邮件，点击"同步邮件"获取最新邮件</div>';
    return;
  }

  messages.forEach((message, index) => {
    const mailItem = document.createElement('div');
    mailItem.className = 'mail-item';

    // 检查是否未读
    if (message.labelIds && (message.labelIds.includes('UNREAD') || message.is_read === 0)) {
      mailItem.classList.add('unread');
    }

    const from = extractEmail(message.from || message.from_email || '');
    const subject = message.subject || '(无主题)';
    const snippet = message.snippet || '';
    const date = formatDate(message.date);

    mailItem.innerHTML = `
      <div class="mail-item-from">${escapeHtml(from)}</div>
      <div class="mail-item-subject">${escapeHtml(subject)}</div>
      <div class="mail-item-snippet">${escapeHtml(snippet)}</div>
      <div class="mail-item-date">${escapeHtml(date)}</div>
    `;

    mailItem.addEventListener('click', () => {
      selectMessage(message.message_id || message.id, index);
    });

    mailListContainer.appendChild(mailItem);
  });
}

// 选择邮件
async function selectMessage(messageId, index) {
  // 更新选中状态
  const mailItems = document.querySelectorAll('.mail-item');
  mailItems.forEach((item, idx) => {
    item.classList.remove('active');
    if (idx === index) {
      item.classList.add('active');
    }
  });

  currentMessageId = messageId;

  // 加载邮件详情
  const result = await window.gmailAPI.getMessage(messageId);
  if (result.success && result.message) {
    renderMessageDetail(result.message);

    // 标记为已读
    if (result.message.labelIds && result.message.labelIds.includes('UNREAD')) {
      await window.gmailAPI.markAsRead(messageId);
      mailItems[index].classList.remove('unread');
    }
  }
}

// 渲染邮件详情
function renderMessageDetail(message) {
  mailDetailEmpty.classList.add('hidden');
  mailDetailContainer.classList.remove('hidden');

  document.getElementById('detail-subject').textContent = message.subject || '(无主题)';
  document.getElementById('detail-from').textContent = message.from || message.from_email || '';
  document.getElementById('detail-to').textContent = message.to || message.to_email || '';
  document.getElementById('detail-date').textContent = message.date || '';

  // 渲染邮件正文
  const bodyElement = document.getElementById('detail-body');
  const body = message.body || '';

  if (body.includes('<html') || body.includes('<body')) {
    bodyElement.innerHTML = body;
  } else {
    bodyElement.textContent = body;
  }
}

// 删除邮件
deleteBtn.addEventListener('click', async () => {
  if (!currentMessageId) return;

  if (confirm('确定要删除这封邮件吗？')) {
    const result = await window.gmailAPI.deleteMessage(currentMessageId);
    if (result.success) {
      mailDetailEmpty.classList.remove('hidden');
      mailDetailContainer.classList.add('hidden');
      currentMessageId = null;
      await loadMessages();
    } else {
      alert('删除失败: ' + result.error);
    }
  }
});

// 回复邮件
replyBtn.addEventListener('click', () => {
  if (!currentMessageId) return;

  const message = currentMessages.find(m => (m.message_id || m.id) === currentMessageId);
  if (message) {
    const replyTo = extractEmail(message.from || message.from_email || '');
    const subject = message.subject || '';
    const replySubject = subject.startsWith('Re:') ? subject : 'Re: ' + subject;

    composeTo.value = replyTo;
    composeSubject.value = replySubject;
    composeMessage.value = '';

    showModal('compose-modal');
  }
});

// 同步按钮
syncBtn.addEventListener('click', syncMessages);

// 写邮件按钮
composeBtn.addEventListener('click', () => {
  composeTo.value = '';
  composeSubject.value = '';
  composeMessage.value = '';
  showModal('compose-modal');
});

// 发送邮件
sendBtn.addEventListener('click', async () => {
  const to = composeTo.value.trim();
  const subject = composeSubject.value.trim();
  const message = composeMessage.value.trim();

  if (!to || !subject || !message) {
    showError(composeError, '请填写所有字段');
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    showError(composeError, '请输入有效的邮箱地址');
    return;
  }

  sendBtn.disabled = true;
  sendBtn.textContent = '发送中...';

  const result = await window.gmailAPI.sendMessage({ to, subject, message });

  sendBtn.disabled = false;
  sendBtn.textContent = '发送';

  if (result.success) {
    showSuccess(composeSuccess, '邮件发送成功！');
    setTimeout(() => {
      closeModal('compose-modal');
    }, 1500);
  } else {
    showError(composeError, result.error);
  }
});

// ==================== 账号管理 ====================

// 打开账号管理
accountsBtn.addEventListener('click', async () => {
  showModal('accounts-modal');
  await loadAccounts();
});

// 加载账号列表
async function loadAccounts() {
  const result = await window.gmailAPI.account.getAll();
  if (result.success) {
    currentAccounts = result.accounts;
    renderAccounts(result.accounts);
  } else {
    showError(accountsError, result.error);
  }
}

// 渲染账号列表
function renderAccounts(accounts) {
  accountsList.innerHTML = '';

  if (accounts.length === 0) {
    accountsList.innerHTML = '<div style="padding: 20px; text-align: center; color: #80868b;">暂无账号</div>';
    return;
  }

  accounts.forEach(account => {
    const accountItem = document.createElement('div');
    accountItem.className = 'account-item';

    if (account.is_active) {
      accountItem.classList.add('active');
    }

    const statusClass = account.has_token ? 'authorized' : 'not-authorized';
    const statusText = account.has_token ? '已授权' : '未授权';
    const activeBadge = account.is_active ? '<span class="account-badge">当前</span>' : '';

    accountItem.innerHTML = `
      <div class="account-info-group">
        <div class="account-email">${escapeHtml(account.email)}${activeBadge}</div>
        <div class="account-status ${statusClass}">${statusText}</div>
      </div>
      <div class="account-actions">
        ${!account.is_active && account.has_token ? `<button class="btn btn-sm" onclick="switchAccount(${account.id})">切换</button>` : ''}
        <button class="btn btn-sm btn-danger" onclick="deleteAccount(${account.id})">删除</button>
      </div>
    `;

    accountsList.appendChild(accountItem);
  });
}

// 切换账号
window.switchAccount = async function(accountId) {
  const result = await window.gmailAPI.account.switch(accountId);
  if (result.success) {
    showSuccess(accountsSuccess, '切换成功！');
    await loadAccounts();
    await loadActiveAccount();
    await loadMessages();

    setTimeout(() => {
      closeModal('accounts-modal');
    }, 1000);
  } else {
    showError(accountsError, result.error);
  }
};

// 删除账号
window.deleteAccount = async function(accountId) {
  if (!confirm('确定要删除此账号吗？')) return;

  const result = await window.gmailAPI.account.delete(accountId);
  if (result.success) {
    showSuccess(accountsSuccess, '删除成功！');
    await loadAccounts();
  } else {
    showError(accountsError, result.error);
  }
};

// 添加授权账号
addAccountBtn.addEventListener('click', async () => {
  const result = await window.gmailAPI.authorize();
  if (result.success) {
    window.gmailAPI.openExternal(result.authUrl);

    const code = prompt('请在浏览器完成授权后，输入授权码：');
    if (code) {
      const authResult = await window.gmailAPI.setAuthCode(code);
      if (authResult.success) {
        showSuccess(accountsSuccess, `账号 ${authResult.email} 添加成功！`);
        await loadAccounts();
        await loadActiveAccount();
      } else {
        showError(accountsError, authResult.error);
      }
    }
  } else {
    showError(accountsError, result.error);
  }
});

// 导入账号
importAccountsBtn.addEventListener('click', async () => {
  const result = await window.gmailAPI.account.import();

  if (result.success) {
    const summary = result.results.map(r => {
      if (r.status === 'added') return `✓ ${r.email} - 已添加`;
      if (r.status === 'updated') return `✓ ${r.email} - 已更新`;
      return `✗ ${r.email} - ${r.error}`;
    }).join('\n');

    showSuccess(accountsSuccess, `导入完成！\n${summary}`);
    await loadAccounts();
  } else if (result.error !== 'User cancelled') {
    showError(accountsError, result.error);
  }
});

// 导出账号
exportAccountsBtn.addEventListener('click', async () => {
  const result = await window.gmailAPI.account.export();

  if (result.success) {
    showSuccess(accountsSuccess, `成功导出 ${result.count} 个账号到 ${result.filePath}`);
  } else if (result.error !== 'User cancelled') {
    showError(accountsError, result.error);
  }
});

// ==================== 模态框管理 ====================

function showModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('hidden');

    // 清空错误/成功消息
    const errorEl = modal.querySelector('.error');
    const successEl = modal.querySelector('.success');
    if (errorEl) errorEl.classList.add('hidden');
    if (successEl) successEl.classList.add('hidden');
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('hidden');
  }
}

// 关闭按钮事件委托
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('close-btn') || e.target.hasAttribute('data-close')) {
    const modalId = e.target.getAttribute('data-close');
    if (modalId) {
      closeModal(modalId);
    } else {
      // 查找最近的模态框
      const modal = e.target.closest('.modal');
      if (modal) {
        modal.classList.add('hidden');
      }
    }
  }

  // 点击模态框背景关闭
  if (e.target.classList.contains('modal')) {
    e.target.classList.add('hidden');
  }
});

// ==================== 工具函数 ====================

function showError(element, message) {
  element.textContent = message;
  element.classList.remove('hidden');
}

function showSuccess(element, message) {
  element.textContent = message;
  element.classList.remove('hidden');
}

function extractEmail(emailString) {
  const match = emailString.match(/<(.+)>/);
  return match ? match[1] : emailString;
}

function formatDate(dateString) {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return '昨天';
    } else if (days < 7) {
      return days + ' 天前';
    } else {
      return date.toLocaleDateString('zh-CN');
    }
  } catch (error) {
    return dateString;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 启动应用
initialize();
