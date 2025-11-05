const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const GmailService = require('./services/gmailService');

let mainWindow;
let gmailService;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
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

app.whenReady().then(() => {
  createWindow();
  gmailService = new GmailService();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC 处理程序

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
    await gmailService.setAuthCode(code);
    return { success: true };
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

// 获取邮件列表
ipcMain.handle('gmail:listMessages', async (event, maxResults = 20) => {
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
