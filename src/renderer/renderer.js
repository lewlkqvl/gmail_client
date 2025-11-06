// 全局变量
let currentMessages = [];
let currentMessageId = null;
let currentAccounts = [];
let sidebarCurrentPage = 1;
let sidebarPageSize = 10;
let sidebarTotalPages = 1;

// DOM 元素
const authScreen = document.getElementById('auth-screen');
const mainScreen = document.getElementById('main-screen');
const authBtn = document.getElementById('auth-btn');
const authImportBtn = document.getElementById('auth-import-btn');
const authWaiting = document.getElementById('auth-waiting');
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
const deleteAllAccountsBtn = document.getElementById('delete-all-accounts-btn');
const accountsList = document.getElementById('accounts-list');
const accountsError = document.getElementById('accounts-error');
const accountsSuccess = document.getElementById('accounts-success');

// 侧边栏账号列表元素
const accountsSidebarList = document.getElementById('accounts-sidebar-list');
const accountsPagination = document.getElementById('accounts-pagination');
const prevPageBtn = document.getElementById('prev-page-btn');
const nextPageBtn = document.getElementById('next-page-btn');
const pageInfo = document.getElementById('page-info');
const sidebarAddAccountBtn = document.getElementById('sidebar-add-account-btn');

// 初始化
async function initialize() {
  const result = await window.gmailAPI.checkAuth();
  if (result.success && result.isAuthorized) {
    showMainScreen();
    await loadSidebarAccounts();
    await loadActiveAccount();
    await loadMessages();
  } else {
    showAuthScreen();
  }

  // 监听授权成功事件
  window.gmailAPI.onAuthSuccess(async (data) => {
    console.log('授权成功:', data);

    // 切换到主界面
    showMainScreen();

    // 加载侧边栏账号列表
    await loadSidebarAccounts();

    // 加载账号信息
    await loadActiveAccount();

    // 给服务一点时间初始化，然后尝试同步
    console.log('等待服务就绪...');
    setTimeout(async () => {
      try {
        // 首次同步不显示alert，静默失败
        await syncMessages(false);
        console.log('✅ 首次同步成功');
      } catch (error) {
        console.error('⚠️ 首次同步失败:', error);
        // 首次同步失败不阻塞用户，只在控制台记录
        // 用户可以稍后手动点击同步按钮
        console.log('💡 提示：可以点击"同步"按钮手动同步邮件');
      }
    }, 1500); // 延迟1.5秒再同步，给服务更多准备时间
  });

  // 监听授权失败事件
  window.gmailAPI.onAuthFailed((error) => {
    console.error('授权失败:', error);
    showError(authError, '授权失败: ' + error);
    // 恢复授权按钮
    authWaiting.classList.add('hidden');
    authBtn.classList.remove('hidden');
    authBtn.disabled = false;
    authBtn.textContent = '授权 Gmail 访问';
  });
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

// ==================== 侧边栏账号列表 ====================

// 加载侧边栏账号列表
async function loadSidebarAccounts() {
  const result = await window.gmailAPI.account.getAll();
  if (result.success) {
    currentAccounts = result.accounts;
    renderSidebarAccounts();
  } else {
    console.error('加载账号列表失败:', result.error);
  }
}

// 渲染侧边栏账号列表（支持分页）
function renderSidebarAccounts() {
  accountsSidebarList.innerHTML = '';

  if (currentAccounts.length === 0) {
    accountsSidebarList.innerHTML = `
      <div style="padding: 20px; text-align: center;">
        <div style="color: #80868b; font-size: 13px; margin-bottom: 16px;">暂无账号</div>
        <button id="sidebar-import-btn" class="btn btn-sm" style="width: 100%; margin-bottom: 8px;">
          📥 导入账号
        </button>
        <div style="color: #999; font-size: 11px; margin-top: 12px;">
          或点击顶部 ➕ 添加新账号
        </div>
      </div>
    `;

    // 绑定导入按钮事件
    const sidebarImportBtn = document.getElementById('sidebar-import-btn');
    if (sidebarImportBtn) {
      sidebarImportBtn.addEventListener('click', async () => {
        const result = await window.gmailAPI.account.import();

        if (result.success) {
          const summary = result.results.map(r => {
            if (r.status === 'added') return `✓ ${r.email} - 已添加`;
            if (r.status === 'updated') return `✓ ${r.email} - 已更新`;
            return `✗ ${r.email} - ${r.error}`;
          }).join('\n');

          alert(`导入完成！\n${summary}`);
          await loadSidebarAccounts();
          await loadActiveAccount();
          await loadMessages();
        } else if (result.error !== 'User cancelled') {
          alert('导入失败: ' + result.error);
        }
      });
    }

    accountsPagination.classList.add('hidden');
    return;
  }

  // 计算总页数
  sidebarTotalPages = Math.ceil(currentAccounts.length / sidebarPageSize);

  // 确保当前页在有效范围内
  if (sidebarCurrentPage > sidebarTotalPages) {
    sidebarCurrentPage = sidebarTotalPages;
  }
  if (sidebarCurrentPage < 1) {
    sidebarCurrentPage = 1;
  }

  // 计算当前页的账号
  const startIndex = (sidebarCurrentPage - 1) * sidebarPageSize;
  const endIndex = Math.min(startIndex + sidebarPageSize, currentAccounts.length);
  const pageAccounts = currentAccounts.slice(startIndex, endIndex);

  // 渲染当前页的账号
  pageAccounts.forEach(account => {
    const accountItem = document.createElement('div');
    accountItem.className = 'sidebar-account-item';

    if (account.is_active) {
      accountItem.classList.add('active');
    }

    if (!account.has_token) {
      accountItem.classList.add('not-authorized');
    }

    const statusClass = account.has_token ? 'authorized' : 'not-authorized';
    const statusText = account.has_token ? '✓ 已授权' : '✗ 未授权';

    accountItem.innerHTML = `
      <div class="sidebar-account-email" title="${escapeHtml(account.email)}">
        ${escapeHtml(account.email)}
      </div>
      <div class="sidebar-account-status ${statusClass}">${statusText}</div>
    `;

    // 只有已授权的账号才能点击切换
    if (account.has_token) {
      accountItem.onclick = () => {
        if (!account.is_active) {
          switchToAccount(account.id, account.email);
        }
      };
    }

    accountsSidebarList.appendChild(accountItem);
  });

  // 更新分页控件
  updatePaginationControls();
}

// 更新分页控件
function updatePaginationControls() {
  if (sidebarTotalPages <= 1) {
    accountsPagination.classList.add('hidden');
    return;
  }

  accountsPagination.classList.remove('hidden');
  pageInfo.textContent = `${sidebarCurrentPage}/${sidebarTotalPages}`;

  // 更新按钮状态
  prevPageBtn.disabled = sidebarCurrentPage <= 1;
  nextPageBtn.disabled = sidebarCurrentPage >= sidebarTotalPages;
}

// 切换到指定账号并同步邮件
async function switchToAccount(accountId, email) {
  console.log(`切换账号: ${email} (ID: ${accountId})`);

  // 显示加载状态
  loading.classList.remove('hidden');
  mailListContainer.innerHTML = '';

  try {
    // 调用切换账号API
    const result = await window.gmailAPI.account.switch(accountId);
    if (result.success) {
      console.log('✅ 账号切换成功');

      // 刷新侧边栏和顶部账号信息
      await loadSidebarAccounts();
      await loadActiveAccount();

      // 加载新账号的邮件列表
      await loadMessages();

      // 同步新账号的邮件（静默失败）
      setTimeout(async () => {
        try {
          await syncMessages(false);
          console.log('✅ 账号邮件同步成功');
        } catch (error) {
          console.error('⚠️ 账号邮件同步失败:', error);
        }
      }, 1000);
    } else {
      loading.classList.add('hidden');
      alert('切换账号失败: ' + result.error);
    }
  } catch (error) {
    loading.classList.add('hidden');
    alert('切换账号失败: ' + error.message);
    console.error('切换账号错误:', error);
  }
}

// 分页按钮事件监听
prevPageBtn.addEventListener('click', () => {
  if (sidebarCurrentPage > 1) {
    sidebarCurrentPage--;
    renderSidebarAccounts();
  }
});

nextPageBtn.addEventListener('click', () => {
  if (sidebarCurrentPage < sidebarTotalPages) {
    sidebarCurrentPage++;
    renderSidebarAccounts();
  }
});

// 侧边栏添加账号按钮
sidebarAddAccountBtn.addEventListener('click', async () => {
  showModal('accounts-modal');
  await loadAccounts();
});

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
  authBtn.textContent = '正在启动授权...';

  try {
    const result = await window.gmailAPI.authorize();
    console.log('授权结果:', result);

    if (result.success) {
      console.log('授权 URL:', result.authUrl);
      // 打开浏览器授权页面（隐私模式）
      await window.gmailAPI.openExternal(result.authUrl);
      // 显示等待界面
      authWaiting.classList.remove('hidden');
      authError.classList.add('hidden');
      authBtn.classList.add('hidden');
      authImportBtn.classList.add('hidden');
    } else {
      showError(authError, result.error);
      authBtn.textContent = '授权 Gmail 访问';
      authBtn.disabled = false;
    }
  } catch (error) {
    console.error('授权过程出错:', error);
    showError(authError, error.message);
    authBtn.textContent = '授权 Gmail 访问';
    authBtn.disabled = false;
  }
});

// 授权界面导入账号按钮
authImportBtn.addEventListener('click', async () => {
  console.log('授权界面导入按钮被点击');
  authImportBtn.disabled = true;
  authImportBtn.textContent = '正在导入...';

  try {
    const result = await window.gmailAPI.account.import();

    if (result.success) {
      const summary = result.results.map(r => {
        if (r.status === 'added') return `✓ ${r.email} - 已添加`;
        if (r.status === 'updated') return `✓ ${r.email} - 已更新`;
        return `✗ ${r.email} - ${r.error}`;
      }).join('\n');

      alert(`导入完成！\n${summary}`);

      // 切换到主界面
      showMainScreen();
      await loadSidebarAccounts();
      await loadActiveAccount();
      await loadMessages();
    } else if (result.error !== 'User cancelled') {
      showError(authError, '导入失败: ' + result.error);
    }
  } catch (error) {
    console.error('导入过程出错:', error);
    showError(authError, error.message);
  } finally {
    authImportBtn.textContent = '📥 导入已有账号';
    authImportBtn.disabled = false;
  }
});

// 同步邮件
async function syncMessages(showAlert = true) {
  loading.classList.remove('hidden');
  mailListContainer.innerHTML = '';

  try {
    const result = await window.gmailAPI.syncMessages(50);
    loading.classList.add('hidden');

    if (result.success) {
      await loadMessages();
      return true;
    } else {
      if (showAlert) {
        alert('同步失败: ' + result.error);
      } else {
        throw new Error(result.error);
      }
      return false;
    }
  } catch (error) {
    loading.classList.add('hidden');
    if (showAlert) {
      alert('同步失败: ' + error.message);
    }
    throw error;
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

  // 提取并显示邮件中的链接
  extractAndDisplayLinks(body);
}

// 提取邮件中的所有链接
function extractLinks(html) {
  const links = new Set(); // 使用Set去重
  const urlRegex = /(https?:\/\/[^\s<>"]+)/gi;

  // 方式1: 从HTML中提取<a>标签的href
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const anchorTags = doc.querySelectorAll('a[href]');

  anchorTags.forEach(a => {
    const href = a.getAttribute('href');
    if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
      links.add(href);
    }
  });

  // 方式2: 从纯文本中提取URL（处理纯文本邮件）
  const textContent = doc.body ? doc.body.textContent : html;
  const matches = textContent.matchAll(urlRegex);
  for (const match of matches) {
    links.add(match[0]);
  }

  return Array.from(links);
}

// 显示提取的链接
function extractAndDisplayLinks(body) {
  const linksSection = document.getElementById('mail-links-section');
  const linksList = document.getElementById('mail-links-list');
  const linksCount = document.getElementById('links-count');

  if (!body) {
    linksSection.classList.add('hidden');
    return;
  }

  const links = extractLinks(body);

  if (links.length === 0) {
    linksSection.classList.add('hidden');
    return;
  }

  // 显示链接区域
  linksSection.classList.remove('hidden');
  linksCount.textContent = links.length;

  // 清空列表
  linksList.innerHTML = '';

  // 渲染每个链接
  links.forEach((link, index) => {
    const linkItem = document.createElement('div');
    linkItem.className = 'link-item';

    const linkText = document.createElement('a');
    linkText.className = 'link-url';
    linkText.href = link;
    linkText.target = '_blank';
    linkText.rel = 'noopener noreferrer';
    linkText.textContent = truncateUrl(link, 60);
    linkText.title = link;

    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn-sm copy-link-btn';
    copyBtn.textContent = '📋 复制';
    copyBtn.dataset.url = link;
    copyBtn.onclick = (e) => {
      e.preventDefault();
      copyToClipboard(link, copyBtn);
    };

    linkItem.appendChild(linkText);
    linkItem.appendChild(copyBtn);
    linksList.appendChild(linkItem);
  });
}

// 截断过长的URL显示
function truncateUrl(url, maxLength) {
  if (url.length <= maxLength) return url;
  return url.substring(0, maxLength - 3) + '...';
}

// 复制到剪贴板
function copyToClipboard(text, button) {
  // 使用现代Clipboard API
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => {
        showCopySuccess(button);
      })
      .catch(err => {
        console.error('复制失败:', err);
        fallbackCopyToClipboard(text, button);
      });
  } else {
    // 降级方案
    fallbackCopyToClipboard(text, button);
  }
}

// 降级复制方案（兼容旧浏览器）
function fallbackCopyToClipboard(text, button) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  document.body.appendChild(textArea);
  textArea.select();

  try {
    const successful = document.execCommand('copy');
    if (successful) {
      showCopySuccess(button);
    } else {
      alert('复制失败，请手动复制');
    }
  } catch (err) {
    console.error('复制失败:', err);
    alert('复制失败，请手动复制');
  }

  document.body.removeChild(textArea);
}

// 显示复制成功提示
function showCopySuccess(button) {
  const originalText = button.textContent;
  button.textContent = '✅ 已复制';
  button.classList.add('copied');

  setTimeout(() => {
    button.textContent = originalText;
    button.classList.remove('copied');
  }, 2000);
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

// 切换账号（从账号管理模态框）
window.switchAccount = async function(accountId) {
  const result = await window.gmailAPI.account.switch(accountId);
  if (result.success) {
    showSuccess(accountsSuccess, '切换成功！');
    await loadAccounts();
    await loadSidebarAccounts();
    await loadActiveAccount();
    await loadMessages();

    setTimeout(() => {
      closeModal('accounts-modal');
    }, 1000);

    // 同步新账号的邮件（静默失败）
    setTimeout(async () => {
      try {
        await syncMessages(false);
        console.log('✅ 账号邮件同步成功');
      } catch (error) {
        console.error('⚠️ 账号邮件同步失败:', error);
      }
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
    await loadSidebarAccounts();
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

        // 刷新账号列表、侧边栏和活动账号信息
        await loadAccounts();
        await loadSidebarAccounts();
        await loadActiveAccount();

        // 加载新账号的邮件列表
        await loadMessages();

        // 关闭账号管理模态框
        setTimeout(() => {
          closeModal('accounts-modal');
        }, 1500);

        // 延迟后同步新账号的邮件（静默失败）
        console.log('新账号添加成功，准备同步邮件...');
        setTimeout(async () => {
          try {
            await syncMessages(false); // 静默失败
            console.log('✅ 新账号邮件同步成功');
          } catch (error) {
            console.error('⚠️ 新账号邮件同步失败:', error);
            console.log('💡 提示：可以点击"同步"按钮手动同步邮件');
          }
        }, 1500);
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
    await loadSidebarAccounts();
    await loadActiveAccount();
    await loadMessages();
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

// 删除所有账号
deleteAllAccountsBtn.addEventListener('click', async () => {
  const accountsCount = currentAccounts.length;

  if (accountsCount === 0) {
    alert('当前没有账号');
    return;
  }

  const confirmMessage = `⚠️ 警告：此操作将删除所有 ${accountsCount} 个账号及其关联的邮件数据！\n\n此操作不可撤销，确定要继续吗？`;

  if (!confirm(confirmMessage)) {
    return;
  }

  // 二次确认
  const doubleConfirm = confirm('请再次确认：真的要删除所有账号吗？');
  if (!doubleConfirm) {
    return;
  }

  try {
    const result = await window.gmailAPI.account.deleteAll();

    if (result.success) {
      showSuccess(accountsSuccess, `成功删除所有 ${accountsCount} 个账号！`);

      // 刷新所有相关界面
      await loadAccounts();
      await loadSidebarAccounts();

      // 切换回授权界面
      setTimeout(() => {
        closeModal('accounts-modal');
        showAuthScreen();
      }, 2000);
    } else {
      showError(accountsError, '删除失败: ' + result.error);
    }
  } catch (error) {
    showError(accountsError, '删除失败: ' + error.message);
    console.error('删除所有账号时出错:', error);
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
