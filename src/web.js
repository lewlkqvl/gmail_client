/**
 * Gmail Client - Web 模式入口
 *
 * 运行在 Linux 系统上的 Web 服务器版本
 * 使用 Express 提供 HTTP 服务，替代 Electron 的桌面应用
 */

const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const http = require('http');
const url = require('url');

const PathHelper = require('./utils/pathHelper');
const DatabaseService = require('./services/databaseService');
const GmailService = require('./services/gmailService');
const ApiService = require('./services/apiService');

// Web应用配置
const WEB_PORT = process.env.WEB_PORT || 3000;
const API_PORT = process.env.API_PORT || 3100;
const SESSION_SECRET = process.env.SESSION_SECRET || 'gmail-client-secret-key-change-in-production';

class WebServer {
  constructor() {
    this.app = express();
    this.pathHelper = new PathHelper('web');
    this.authServer = null;

    console.log('🌐 启动 Web 模式');
    console.log('📁 数据目录:', this.pathHelper.getDataDirectory());
    console.log('💾 数据库路径:', this.pathHelper.getDatabasePath());
  }

  async initialize() {
    try {
      // 初始化数据库服务
      this.dbService = new DatabaseService(this.pathHelper);
      await this.dbService.initialize();
      console.log('✅ 数据库服务初始化成功');

      // 初始化 Gmail 服务
      this.gmailService = new GmailService(this.dbService, this.pathHelper);
      await this.gmailService.initialize();
      console.log('✅ Gmail 服务初始化成功');

      // 初始化 REST API 服务
      this.apiService = new ApiService(this.gmailService, this.dbService);
      await this.apiService.start();
      console.log('✅ REST API 服务启动成功');

      // 设置 Web 服务器
      this.setupMiddleware();
      this.setupRoutes();

    } catch (error) {
      console.error('❌ 初始化失败:', error);
      throw error;
    }
  }

  setupMiddleware() {
    // CORS支持
    this.app.use(cors({
      origin: true,
      credentials: true
    }));

    // 解析JSON和表单数据
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // 会话管理
    this.app.use(session({
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: false, // 生产环境应使用 HTTPS 并设为 true
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24小时
      }
    }));

    // 静态文件服务（前端资源）
    const staticPath = this.pathHelper.getRendererPath();
    this.app.use(express.static(staticPath));
    console.log('📂 静态文件目录:', staticPath);

    // 设置运行模式标识
    this.app.use((req, res, next) => {
      res.locals.mode = 'web';
      next();
    });
  }

  setupRoutes() {
    // ==================== 页面路由 ====================

    // 主页
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(this.pathHelper.getRendererPath(), 'index.html'));
    });

    // ==================== Gmail API 路由 ====================

    // 获取授权URL
    this.app.post('/api/gmail/authorize', async (req, res) => {
      try {
        await this.startAuthServer();
        const authUrl = this.gmailService.getAuthUrl();
        res.json({ success: true, authUrl });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // 设置授权码
    this.app.post('/api/gmail/setAuthCode', async (req, res) => {
      try {
        const { code } = req.body;
        const email = await this.gmailService.setAuthCode(code);

        // 保存到会话
        req.session.currentEmail = email;
        req.session.accountId = this.gmailService.getCurrentAccountId();

        res.json({ success: true, email });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // 检查授权状态
    this.app.get('/api/gmail/checkAuth', async (req, res) => {
      try {
        const isAuthorized = await this.gmailService.isAuthorized();
        res.json({ success: true, isAuthorized });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // 同步邮件
    this.app.post('/api/gmail/syncMessages', async (req, res) => {
      try {
        const { maxResults = 50 } = req.body;
        const messages = await this.gmailService.syncMessages(maxResults);
        res.json({ success: true, messages });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // 获取邮件列表
    this.app.get('/api/gmail/listMessages', async (req, res) => {
      try {
        const maxResults = parseInt(req.query.maxResults) || 50;
        const messages = await this.gmailService.listMessages(maxResults);
        res.json({ success: true, messages });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // 获取邮件详情
    this.app.get('/api/gmail/getMessage/:messageId', async (req, res) => {
      try {
        const { messageId } = req.params;
        const message = await this.gmailService.getMessage(messageId);
        res.json({ success: true, message });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // 发送邮件
    this.app.post('/api/gmail/sendMessage', async (req, res) => {
      try {
        const messageData = req.body;
        const result = await this.gmailService.sendMessage(messageData);
        res.json({ success: true, result });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // 删除邮件
    this.app.delete('/api/gmail/deleteMessage/:messageId', async (req, res) => {
      try {
        const { messageId } = req.params;
        await this.gmailService.deleteMessage(messageId);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // 标记为已读
    this.app.post('/api/gmail/markAsRead/:messageId', async (req, res) => {
      try {
        const { messageId } = req.params;
        await this.gmailService.markAsRead(messageId);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ==================== 账号管理路由 ====================

    // 获取所有账号
    this.app.get('/api/account/getAll', (req, res) => {
      try {
        const accounts = this.dbService.getAllAccounts();
        const sanitizedAccounts = accounts.map(acc => ({
          id: acc.id,
          email: acc.email,
          is_active: acc.is_active,
          has_token: !!acc.access_token,
          created_at: acc.created_at,
          updated_at: acc.updated_at
        }));
        res.json({ success: true, accounts: sanitizedAccounts });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // 获取活动账号
    this.app.get('/api/account/getActive', (req, res) => {
      try {
        const account = this.dbService.getActiveAccount();
        if (account) {
          res.json({
            success: true,
            account: {
              id: account.id,
              email: account.email,
              is_active: account.is_active,
              has_token: !!account.access_token
            }
          });
        } else {
          res.json({ success: true, account: null });
        }
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // 切换账号
    this.app.post('/api/account/switch', async (req, res) => {
      try {
        const { accountId } = req.body;
        await this.gmailService.switchAccount(accountId);

        // 更新会话
        const account = this.dbService.getAccount(accountId);
        req.session.currentEmail = account.email;
        req.session.accountId = accountId;

        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // 删除账号
    this.app.delete('/api/account/delete/:accountId', (req, res) => {
      try {
        const { accountId } = req.params;
        this.dbService.deleteAccount(parseInt(accountId));
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // 获取邮件统计
    this.app.get('/api/gmail/getStats', (req, res) => {
      try {
        const accountId = this.gmailService.getCurrentAccountId();
        if (!accountId) {
          return res.status(400).json({ success: false, error: 'No active account' });
        }
        const stats = this.dbService.getMessageStats(accountId);
        res.json({ success: true, stats });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ==================== 检测运行模式 ====================

    this.app.get('/api/mode', (req, res) => {
      res.json({ mode: 'web' });
    });

    // ==================== 404处理 ====================

    this.app.use((req, res) => {
      res.status(404).json({ error: 'Not Found' });
    });
  }

  /**
   * 启动OAuth授权回调服务器（端口3001）
   */
  async startAuthServer() {
    return new Promise((resolve, reject) => {
      if (this.authServer) {
        this.authServer.close();
      }

      this.authServer = http.createServer(async (req, res) => {
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
                <p><a href="/">返回首页</a></p>
              </body>
              </html>
            `);
            return;
          }

          if (code) {
            try {
              const email = await this.gmailService.setAuthCode(code);

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
                  <p id="message">正在返回应用...</p>
                  <script>
                    (function() {
                      const authData = {
                        type: 'gmail-auth-success',
                        email: '${email}',
                        timestamp: Date.now()
                      };

                      // 方式1：通过 postMessage 通知父窗口（如果是从应用打开的）
                      if (window.opener && !window.opener.closed) {
                        try {
                          window.opener.postMessage(authData, window.location.origin);
                          console.log('已通过postMessage通知主窗口');
                        } catch (e) {
                          console.error('postMessage失败:', e);
                        }
                      }

                      // 方式2：使用 localStorage 作为备选方案
                      try {
                        localStorage.setItem('gmail-auth-success', JSON.stringify(authData));
                        console.log('已保存授权状态到localStorage');
                      } catch (e) {
                        console.error('localStorage保存失败:', e);
                      }

                      // 方式3：使用 BroadcastChannel（如果浏览器支持）
                      if (typeof BroadcastChannel !== 'undefined') {
                        try {
                          const channel = new BroadcastChannel('gmail-auth-channel');
                          channel.postMessage(authData);
                          channel.close();
                          console.log('已通过BroadcastChannel通知');
                        } catch (e) {
                          console.error('BroadcastChannel失败:', e);
                        }
                      }

                      // 2秒后跳转回主页或关闭窗口
                      setTimeout(() => {
                        if (window.opener && !window.opener.closed) {
                          window.close();
                        } else {
                          window.location.href = '/';
                        }
                      }, 2000);
                    })();
                  </script>
                </body>
                </html>
              `);
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
                  <p><a href="/">返回首页</a></p>
                </body>
                </html>
              `);
            }
          }
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        }
      });

      this.authServer.listen(3001, 'localhost', () => {
        console.log('✅ OAuth回调服务器启动: http://localhost:3001');
        resolve();
      });

      this.authServer.on('error', (error) => {
        console.error('❌ OAuth回调服务器错误:', error);
        reject(error);
      });
    });
  }

  /**
   * 启动Web服务器
   */
  async start() {
    await this.initialize();

    return new Promise((resolve, reject) => {
      this.server = this.app.listen(WEB_PORT, () => {
        console.log('\n' + '='.repeat(60));
        console.log('🚀 Gmail Client - Web 模式启动成功！');
        console.log('='.repeat(60));
        console.log(`📱 Web 应用: http://localhost:${WEB_PORT}`);
        console.log(`📡 REST API: http://localhost:${API_PORT}`);
        console.log(`🔐 OAuth 回调: http://localhost:3001/callback`);
        console.log('='.repeat(60) + '\n');
        resolve();
      });

      this.server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`❌ 端口 ${WEB_PORT} 已被占用`);
        } else {
          console.error('❌ Web服务器错误:', error);
        }
        reject(error);
      });
    });
  }

  /**
   * 停止服务器
   */
  async stop() {
    console.log('\n正在关闭服务...');

    if (this.authServer) {
      this.authServer.close();
      console.log('✅ OAuth服务器已关闭');
    }

    if (this.apiService) {
      await this.apiService.stop();
      console.log('✅ REST API服务已关闭');
    }

    if (this.dbService) {
      this.dbService.close();
      console.log('✅ 数据库已关闭');
    }

    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          console.log('✅ Web服务器已关闭');
          resolve();
        });
      });
    }
  }
}

// 启动Web服务器
const webServer = new WebServer();

webServer.start().catch((error) => {
  console.error('❌ 启动失败:', error);
  process.exit(1);
});

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\n收到退出信号...');
  await webServer.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n收到终止信号...');
  await webServer.stop();
  process.exit(0);
});

module.exports = WebServer;
