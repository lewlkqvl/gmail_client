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

        // 使用无状态方法直接查询指定账号，不依赖活动账号
        // 这样支持并发查询多个不同邮箱，避免账号切换的竞态条件

        // 获取最后一封邮件（从数据库）
        let lastMessage = this.dbService.getMessages(account.id, 1)[0];

        // 如果数据库中没有邮件，直接使用账号对象同步
        if (!lastMessage) {
          console.log(`No messages in database for ${email}, syncing from Gmail API...`);
          const syncedMessages = await this.gmailService.syncMessagesForAccount(account, 1);
          lastMessage = syncedMessages.length > 0 ? syncedMessages[0] : null;
        }

        if (!lastMessage) {
          return res.status(404).json({
            success: false,
            error: `No messages found for email: ${email}`
          });
        }

        // 确保lastMessage有id属性
        if (!lastMessage.id && !lastMessage.message_id) {
          return res.status(500).json({
            success: false,
            error: 'Invalid message data: missing message ID'
          });
        }

        // 获取完整邮件内容（包括body）- 直接使用账号对象
        const messageId = lastMessage.id || lastMessage.message_id;
        const fullMessage = await this.gmailService.getMessageForAccount(messageId, account);

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
