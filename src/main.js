const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const GmailService = require('./services/gmailService');
const DatabaseService = require('./services/databaseService');

let mainWindow;
let gmailService;
let dbService;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // 开发模式下打开开发者工具
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupIpcHandlers() {
  // ==================== Gmail IPC 处理程序 ====================

  // 授权
  ipcMain.handle('gmail:authorize', async () => {
    try {
      const authUrl = await gmailService.getAuthUrl();
      return { success: true, authUrl };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 设置授权码
  ipcMain.handle('gmail:setAuthCode', async (event, code) => {
    try {
      const email = await gmailService.setAuthCode(code);
      return { success: true, email };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 检查授权状态
  ipcMain.handle('gmail:checkAuth', async () => {
    try {
      const isAuthorized = await gmailService.isAuthorized();
      return { success: true, isAuthorized };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 同步邮件（从 Gmail 服务器拉取到数据库）
  ipcMain.handle('gmail:syncMessages', async (event, maxResults = 50) => {
    try {
      const messages = await gmailService.syncMessages(maxResults);
      return { success: true, messages };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 获取邮件列表（从数据库读取）
  ipcMain.handle('gmail:listMessages', async (event, maxResults = 50) => {
    try {
      const messages = await gmailService.listMessages(maxResults);
      return { success: true, messages };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 获取邮件详情
  ipcMain.handle('gmail:getMessage', async (event, messageId) => {
    try {
      const message = await gmailService.getMessage(messageId);
      return { success: true, message };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 发送邮件
  ipcMain.handle('gmail:sendMessage', async (event, messageData) => {
    try {
      const result = await gmailService.sendMessage(messageData);
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 删除邮件
  ipcMain.handle('gmail:deleteMessage', async (event, messageId) => {
    try {
      await gmailService.deleteMessage(messageId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 标记为已读
  ipcMain.handle('gmail:markAsRead', async (event, messageId) => {
    try {
      await gmailService.markAsRead(messageId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ==================== 账号管理 IPC 处理程序 ====================

  // 获取所有账号
  ipcMain.handle('account:getAll', async () => {
    try {
      const accounts = dbService.getAllAccounts();
      // 不返回敏感信息
      const sanitizedAccounts = accounts.map(acc => ({
        id: acc.id,
        email: acc.email,
        is_active: acc.is_active,
        has_token: !!acc.access_token,
        created_at: acc.created_at,
        updated_at: acc.updated_at
      }));
      return { success: true, accounts: sanitizedAccounts };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 获取活动账号
  ipcMain.handle('account:getActive', async () => {
    try {
      const account = dbService.getActiveAccount();
      if (account) {
        return {
          success: true,
          account: {
            id: account.id,
            email: account.email,
            is_active: account.is_active,
            has_token: !!account.access_token
          }
        };
      }
      return { success: true, account: null };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 切换账号
  ipcMain.handle('account:switch', async (event, accountId) => {
    try {
      await gmailService.switchAccount(accountId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 添加账号（手动）
  ipcMain.handle('account:add', async (event, { email, password }) => {
    try {
      const accountId = dbService.addAccount(email, password);
      return { success: true, accountId };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 删除账号
  ipcMain.handle('account:delete', async (event, accountId) => {
    try {
      dbService.deleteAccount(accountId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ==================== 导入导出 IPC 处理程序 ====================

  // 导出账号
  ipcMain.handle('account:export', async () => {
    try {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: '导出账号',
        defaultPath: 'gmail_accounts.json',
        filters: [
          { name: 'JSON Files', extensions: ['json'] }
        ]
      });

      if (result.canceled || !result.filePath) {
        return { success: false, error: 'User cancelled' };
      }

      const accounts = dbService.exportAccounts();
      await fs.writeFile(result.filePath, JSON.stringify(accounts, null, 2), 'utf-8');

      return { success: true, filePath: result.filePath, count: accounts.length };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 导入账号
  ipcMain.handle('account:import', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: '导入账号',
        filters: [
          { name: 'JSON Files', extensions: ['json'] }
        ],
        properties: ['openFile']
      });

      if (result.canceled || !result.filePaths.length) {
        return { success: false, error: 'User cancelled' };
      }

      const fileContent = await fs.readFile(result.filePaths[0], 'utf-8');
      const accounts = JSON.parse(fileContent);

      if (!Array.isArray(accounts)) {
        return { success: false, error: 'Invalid file format' };
      }

      const results = dbService.importAccounts(accounts);

      return { success: true, results };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 获取邮件统计
  ipcMain.handle('gmail:getStats', async () => {
    try {
      const accountId = gmailService.getCurrentAccountId();
      if (!accountId) {
        return { success: false, error: 'No active account' };
      }

      const stats = dbService.getMessageStats(accountId);
      return { success: true, stats };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // ==================== Shell 工具函数 ====================

  // 打开外部链接
  ipcMain.handle('shell:openExternal', async (event, url) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error('Error opening external URL:', error);
      return { success: false, error: error.message };
    }
  });
}

app.whenReady().then(async () => {
  try {
    // 初始化数据库服务
    dbService = new DatabaseService();
    await dbService.initialize();
    console.log('Database service initialized');

    // 初始化 Gmail 服务
    gmailService = new GmailService(dbService);
    await gmailService.initialize();
    console.log('Gmail service initialized');

    // 注册 IPC 处理程序
    setupIpcHandlers();
    console.log('IPC handlers registered');

    // 创建窗口
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (error) {
    console.error('Error initializing application:', error);
    console.error('Stack trace:', error.stack);

    // 如果是 credentials.json 不存在的错误，显示友好提示
    if (error.message.includes('credentials.json')) {
      console.log('\n⚠️  请先配置 Gmail API credentials.json 文件');
      console.log('📝 参考 README.md 中的配置说明\n');
    }

    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (dbService) {
    dbService.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
