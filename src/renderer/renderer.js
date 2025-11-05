// 全局变量
let currentMessages = [];
let currentMessageId = null;

// DOM 元素
const authScreen = document.getElementById('auth-screen');
const mainScreen = document.getElementById('main-screen');
const authBtn = document.getElementById('auth-btn');
const authCodeContainer = document.getElementById('auth-code-container');
const authCodeInput = document.getElementById('auth-code-input');
const submitAuthCodeBtn = document.getElementById('submit-auth-code-btn');
const authError = document.getElementById('auth-error');

const composeBtn = document.getElementById('compose-btn');
const refreshBtn = document.getElementById('refresh-btn');
const mailListContainer = document.getElementById('mail-list-container');
const loading = document.getElementById('loading');
const mailDetailEmpty = document.getElementById('mail-detail-empty');
const mailDetailContainer = document.getElementById('mail-detail-container');
const deleteBtn = document.getElementById('delete-btn');
const replyBtn = document.getElementById('reply-btn');

const composeModal = document.getElementById('compose-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const composeTo = document.getElementById('compose-to');
const composeSubject = document.getElementById('compose-subject');
const composeMessage = document.getElementById('compose-message');
const sendBtn = document.getElementById('send-btn');
const cancelBtn = document.getElementById('cancel-btn');
const composeError = document.getElementById('compose-error');
const composeSuccess = document.getElementById('compose-success');

// 初始化
async function initialize() {
  const result = await window.gmailAPI.checkAuth();
  if (result.success && result.isAuthorized) {
    showMainScreen();
    loadMessages();
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

// 授权按钮点击
authBtn.addEventListener('click', async () => {
  const result = await window.gmailAPI.authorize();
  if (result.success) {
    // 在外部浏览器打开授权 URL
    window.gmailAPI.openExternal(result.authUrl);
    authCodeContainer.classList.remove('hidden');
    authError.classList.add('hidden');
  } else {
    showError(authError, result.error);
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
    loadMessages();
  } else {
    showError(authError, result.error);
  }
});

// 加载邮件列表
async function loadMessages() {
  loading.classList.remove('hidden');
  mailListContainer.innerHTML = '';

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
    mailListContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #80868b;">暂无邮件</div>';
    return;
  }

  messages.forEach(message => {
    const mailItem = document.createElement('div');
    mailItem.className = 'mail-item';

    // 检查是否未读
    if (message.labelIds && message.labelIds.includes('UNREAD')) {
      mailItem.classList.add('unread');
    }

    const from = extractEmail(message.from);
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
      selectMessage(message.id);
    });

    mailListContainer.appendChild(mailItem);
  });
}

// 选择邮件
async function selectMessage(messageId) {
  // 更新选中状态
  const mailItems = document.querySelectorAll('.mail-item');
  mailItems.forEach((item, index) => {
    item.classList.remove('active');
    if (currentMessages[index] && currentMessages[index].id === messageId) {
      item.classList.add('active');
    }
  });

  currentMessageId = messageId;

  // 加载邮件详情
  const result = await window.gmailAPI.getMessage(messageId);
  if (result.success) {
    renderMessageDetail(result.message);

    // 标记为已读
    if (result.message.labelIds && result.message.labelIds.includes('UNREAD')) {
      await window.gmailAPI.markAsRead(messageId);
      // 重新加载邮件列表以更新未读状态
      loadMessages();
    }
  }
}

// 渲染邮件详情
function renderMessageDetail(message) {
  mailDetailEmpty.classList.add('hidden');
  mailDetailContainer.classList.remove('hidden');

  document.getElementById('detail-subject').textContent = message.subject || '(无主题)';
  document.getElementById('detail-from').textContent = message.from;
  document.getElementById('detail-to').textContent = message.to;
  document.getElementById('detail-date').textContent = message.date;

  // 渲染邮件正文
  const bodyElement = document.getElementById('detail-body');
  if (message.body.includes('<html') || message.body.includes('<body')) {
    // HTML 邮件
    bodyElement.innerHTML = message.body;
  } else {
    // 纯文本邮件
    bodyElement.textContent = message.body;
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
      loadMessages();
    } else {
      alert('删除失败: ' + result.error);
    }
  }
});

// 回复邮件
replyBtn.addEventListener('click', () => {
  if (!currentMessageId) return;

  const message = currentMessages.find(m => m.id === currentMessageId);
  if (message) {
    const replyTo = extractEmail(message.from);
    const replySubject = message.subject.startsWith('Re:')
      ? message.subject
      : 'Re: ' + message.subject;

    composeTo.value = replyTo;
    composeSubject.value = replySubject;
    composeMessage.value = '';

    showComposeModal();
  }
});

// 刷新按钮
refreshBtn.addEventListener('click', () => {
  loadMessages();
});

// 写邮件按钮
composeBtn.addEventListener('click', () => {
  composeTo.value = '';
  composeSubject.value = '';
  composeMessage.value = '';
  showComposeModal();
});

// 显示写邮件模态框
function showComposeModal() {
  composeModal.classList.remove('hidden');
  composeError.classList.add('hidden');
  composeSuccess.classList.add('hidden');
}

// 关闭模态框
function closeComposeModal() {
  composeModal.classList.add('hidden');
}

closeModalBtn.addEventListener('click', closeComposeModal);
cancelBtn.addEventListener('click', closeComposeModal);

// 点击模态框外部关闭
composeModal.addEventListener('click', (e) => {
  if (e.target === composeModal) {
    closeComposeModal();
  }
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

  // 简单的邮箱格式验证
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
      closeComposeModal();
      loadMessages();
    }, 1500);
  } else {
    showError(composeError, result.error);
  }
});

// 工具函数
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
