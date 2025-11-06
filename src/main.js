const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const http = require('http');
const url = require('url');
const puppeteer = require('puppeteer-core');
const PathHelper = require('./utils/pathHelper');
const GmailService = require('./services/gmailService');
const DatabaseService = require('./services/databaseService');
const ApiService = require('./services/apiService');

let mainWindow;
let pathHelper;
let gmailService;
let dbService;
let apiService;
let authServer = null;
let authBrowser = null; // puppeteer 浏览器实例

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

// 创建授权回调服务器
function startAuthServer() {
  return new Promise((resolve, reject) => {
    // 如果服务器已经在运行，先关闭
    if (authServer) {
      authServer.close();
    }

    authServer = http.createServer(async (req, res) => {
      const parsedUrl = url.parse(req.url, true);

      if (parsedUrl.pathname === '/callback') {
        const code = parsedUrl.query.code;
        const error = parsedUrl.query.error;

        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <title>授权失败</title>
              <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                .error { color: #d32f2f; }
              </style>
            </head>
            <body>
              <h1 class="error">❌ 授权失败</h1>
              <p>错误: ${error}</p>
              <p>窗口将在3秒后自动关闭...</p>
            </body>
            </html>
          `);

          // 通知前端授权失败
          if (mainWindow) {
            mainWindow.webContents.send('auth:failed', error);
          }

          // 3秒后关闭浏览器和服务器
          setTimeout(async () => {
            if (authBrowser) {
              try {
                await authBrowser.close();
              } catch (e) {}
              authBrowser = null;
            }
            if (authServer) {
              authServer.close();
              authServer = null;
            }
          }, 3000);
          return;
        }

        if (code) {
          try {
            // 自动保存授权码
            const email = await gmailService.setAuthCode(code);

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <title>授权成功</title>
                <style>
                  body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                  .success { color: #388e3c; }
                  .email { font-weight: bold; color: #1976d2; }
                </style>
              </head>
              <body>
                <h1 class="success">✅ 授权成功！</h1>
                <p>账号: <span class="email">${email}</span></p>
                <p>窗口将在3秒后自动关闭...</p>
                <p style="margin-top: 20px; color: #666; font-size: 14px;">您可以手动关闭此窗口</p>
              </body>
              </html>
            `);

            // 通知前端授权成功
            if (mainWindow) {
              mainWindow.webContents.send('auth:success', { email });
            }

            // 3秒后关闭浏览器和服务器
            setTimeout(async () => {
              if (authBrowser) {
                try {
                  await authBrowser.close();
                } catch (e) {}
                authBrowser = null;
              }
              if (authServer) {
                authServer.close();
                authServer = null;
              }
            }, 3000);
          } catch (error) {
            res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <title>保存授权失败</title>
                <style>
                  body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                  .error { color: #d32f2f; }
                </style>
              </head>
              <body>
                <h1 class="error">❌ 保存授权失败</h1>
                <p>${error.message}</p>
                <p>请关闭此窗口并重试</p>
              </body>
              </html>
            `);

            // 通知前端授权失败
            if (mainWindow) {
              mainWindow.webContents.send('auth:failed', error.message);
            }

            // 3秒后关闭浏览器和服务器
            setTimeout(async () => {
              if (authBrowser) {
                try {
                  await authBrowser.close();
                } catch (e) {}
                authBrowser = null;
              }
              if (authServer) {
                authServer.close();
                authServer = null;
              }
            }, 3000);
          }
        } else {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <title>缺少授权码</title>
            </head>
            <body>
              <h1>❌ 缺少授权码</h1>
              <p>请关闭此窗口并重试</p>
            </body>
            </html>
          `);
        }
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });

    authServer.listen(3001, 'localhost', () => {
      console.log('Authorization server started on http://localhost:3001');
      resolve();
    });

    authServer.on('error', (error) => {
      console.error('Authorization server error:', error);
      reject(error);
    });
  });
}

function setupIpcHandlers() {
  // ==================== Gmail IPC 处理程序 ====================

  // 授权
  ipcMain.handle('gmail:authorize', async () => {
    try {
      // 先启动授权服务器
      await startAuthServer();

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

  // 在隐私模式下打开外部链接
  ipcMain.handle('shell:openExternal', async (event, targetUrl) => {
    try {
      // 在隐私模式下打开浏览器
      await openInPrivateMode(targetUrl);
      return { success: true };
    } catch (error) {
      console.error('Error opening external URL:', error);
      return { success: false, error: error.message };
    }
  });
}

// 查找系统中的 Chrome 可执行文件路径
function findChromePath() {
  const platform = process.platform;

  if (platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  } else if (platform === 'win32') {
    const chromePaths = [
      process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    ];

    for (const chromePath of chromePaths) {
      if (fsSync.existsSync(chromePath)) {
        return chromePath;
      }
    }
  } else {
    // Linux
    const chromeCommands = [
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium'
    ];

    for (const chromePath of chromeCommands) {
      if (fsSync.existsSync(chromePath)) {
        return chromePath;
      }
    }
  }

  return null;
}

// 使用 Puppeteer 在隐私模式下打开浏览器
async function openInPrivateMode(targetUrl) {
  try {
    // 如果已有浏览器实例在运行，先关闭
    if (authBrowser) {
      try {
        await authBrowser.close();
      } catch (e) {
        console.error('Error closing previous browser:', e);
      }
      authBrowser = null;
    }

    // 查找 Chrome 路径
    const chromePath = findChromePath();
    if (!chromePath) {
      throw new Error('Chrome executable not found');
    }

    console.log('Launching Chrome at:', chromePath);

    // 启动浏览器
    authBrowser = await puppeteer.launch({
      executablePath: chromePath,
      headless: false, // 显示浏览器窗口
      args: [
        '--incognito', // 隐私模式
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled'
      ],
      defaultViewport: {
        width: 1280,
        height: 800
      }
    });

    // 创建新页面（已经在隐私模式下了）
    const pages = await authBrowser.pages();
    const page = pages[0] || await authBrowser.newPage();

    // 监听浏览器关闭事件 - 在导航之前设置
    authBrowser.on('disconnected', () => {
      console.log('Browser disconnected');
      authBrowser = null;
    });

    // 忽略页面错误和目标关闭错误，这些在授权成功后关闭浏览器时是正常的
    page.on('error', (error) => {
      console.log('Page error (expected during close):', error.message);
    });

    page.on('close', () => {
      console.log('Page closed');
    });

    // 导航到授权 URL，捕获导航错误（浏览器关闭时会抛出）
    try {
      await page.goto(targetUrl, {
        waitUntil: 'networkidle2',
        timeout: 60000 // 增加超时时间
      });
      console.log('Opened authorization page in incognito mode');
    } catch (navError) {
      // 如果是浏览器关闭导致的导航错误，忽略它
      if (navError.message.includes('Target closed') ||
          navError.message.includes('Session closed') ||
          navError.message.includes('Navigation failed')) {
        console.log('Navigation interrupted (browser closed), this is expected');
      } else {
        console.error('Navigation error:', navError);
        throw navError;
      }
    }

  } catch (error) {
    console.error('Error launching Chrome with Puppeteer:', error);
    // 如果 Puppeteer 失败，回退到默认浏览器
    console.warn('Falling back to default browser');
    await shell.openExternal(targetUrl);
  }
}

app.whenReady().then(async () => {
  try {
    // 初始化路径助手（Electron模式）
    pathHelper = new PathHelper('electron');
    // 设置Electron userData路径到环境变量，供PathHelper使用
    process.env.ELECTRON_USER_DATA = app.getPath('userData');
    console.log('Path helper initialized (Electron mode)');
    console.log('User data path:', app.getPath('userData'));

    // 初始化数据库服务
    dbService = new DatabaseService(pathHelper);
    await dbService.initialize();
    console.log('Database service initialized');

    // 初始化 Gmail 服务
    gmailService = new GmailService(dbService, pathHelper);
    await gmailService.initialize();
    console.log('Gmail service initialized');

    // 初始化并启动 REST API 服务
    apiService = new ApiService(gmailService, dbService);
    await apiService.start();
    console.log('REST API service started');

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

app.on('window-all-closed', async () => {
  // 关闭 REST API 服务器
  if (apiService) {
    await apiService.stop();
  }

  // 关闭数据库
  if (dbService) {
    dbService.close();
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});
