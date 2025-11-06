const express = require('express');
const cors = require('cors');

class ApiService {
  constructor(gmailService, dbService) {
    this.gmailService = gmailService;
    this.dbService = dbService;
    this.app = express();
    this.server = null;
    this.port = 3100;

    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
  }

  setupRoutes() {
    // 健康检查
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', message: 'Gmail API Service is running' });
    });

    // 通过邮箱查询最后一封邮件
    this.app.get('/api/email/last', async (req, res) => {
      try {
        const { email } = req.query;

        if (!email) {
          return res.status(400).json({
            success: false,
            error: 'Email parameter is required'
          });
        }

        // 查找账号
        const account = this.dbService.getAccountByEmail(email);
        if (!account) {
          return res.status(404).json({
            success: false,
            error: `Account not found for email: ${email}`
          });
        }

        if (!account.access_token) {
          return res.status(401).json({
            success: false,
            error: `Account ${email} is not authorized`
          });
        }

        // 备份当前账号状态
        const currentAccountId = this.gmailService.currentAccountId;
        const needRestore = currentAccountId !== account.id;

        try {
          // 临时切换到目标账号（如果需要）
          if (needRestore) {
            await this.gmailService.switchAccount(account.id);
          }

          // 获取最后一封邮件（从数据库）
          let lastMessage = this.dbService.getMessages(account.id, 1)[0];

          // 如果数据库中没有邮件，或需要更新的邮件，从Gmail API同步
          if (!lastMessage) {
            await this.gmailService.syncMessages(1);
            lastMessage = this.dbService.getMessages(account.id, 1)[0];
          }

          if (!lastMessage) {
            return res.status(404).json({
              success: false,
              error: `No messages found for email: ${email}`
            });
          }

          // 获取完整邮件内容（包括body）
          const fullMessage = await this.gmailService.getMessage(lastMessage.id);

          res.json({
            success: true,
            data: {
              email: email,
              message: {
                id: fullMessage.id,
                threadId: fullMessage.threadId,
                from: fullMessage.from,
                to: fullMessage.to,
                subject: fullMessage.subject,
                date: fullMessage.date,
                snippet: fullMessage.snippet,
                body: fullMessage.body,
                labelIds: fullMessage.labelIds
              }
            }
          });
        } finally {
          // 恢复原来的账号（如果需要）
          if (needRestore && currentAccountId) {
            try {
              await this.gmailService.switchAccount(currentAccountId);
            } catch (error) {
              console.error('Error restoring account:', error);
            }
          }
        }
      } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({
          success: false,
          error: error.message || 'Internal server error'
        });
      }
    });

    // 获取所有账号列表
    this.app.get('/api/accounts', (req, res) => {
      try {
        const accounts = this.dbService.getAllAccounts();
        res.json({
          success: true,
          data: {
            accounts: accounts.map(acc => ({
              id: acc.id,
              email: acc.email,
              isActive: acc.is_active === 1,
              isAuthorized: !!acc.access_token
            }))
          }
        });
      } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({
          success: false,
          error: error.message || 'Internal server error'
        });
      }
    });
  }

  start() {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, () => {
          console.log(`📡 REST API server running on http://localhost:${this.port}`);
          console.log(`   - Health check: http://localhost:${this.port}/health`);
          console.log(`   - Get last email: http://localhost:${this.port}/api/email/last?email=YOUR_EMAIL`);
          console.log(`   - List accounts: http://localhost:${this.port}/api/accounts`);
          resolve();
        });

        this.server.on('error', (error) => {
          if (error.code === 'EADDRINUSE') {
            console.error(`❌ Port ${this.port} is already in use`);
          } else {
            console.error('❌ API Server error:', error);
          }
          reject(error);
        });
      } catch (error) {
        console.error('Failed to start API server:', error);
        reject(error);
      }
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('API server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = ApiService;
