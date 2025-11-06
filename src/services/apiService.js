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
        console.log(`[API] Request to get last email for: ${email}`);

        const account = this.dbService.getAccountByEmail(email);
        if (!account) {
          console.log(`[API] Account not found: ${email}`);
          return res.status(404).json({
            success: false,
            error: `Account not found for email: ${email}`
          });
        }

        console.log(`[API] Found account: ${account.email} (ID: ${account.id})`);

        if (!account.access_token) {
          console.log(`[API] Account not authorized: ${email}`);
          return res.status(401).json({
            success: false,
            error: `Account ${email} is not authorized`
          });
        }

        // 使用无状态方法直接查询指定账号，不依赖活动账号
        // 这样支持并发查询多个不同邮箱，避免账号切换的竞态条件

        // 获取最后一封邮件（从数据库）
        let lastMessage = this.dbService.getMessages(account.id, 1)[0];
        let shouldSyncFromAPI = false;

        console.log(`[API] Checking database for messages of account ${email}...`);

        // 如果数据库中没有邮件，标记需要从 API 同步
        if (!lastMessage) {
          console.log(`[API] No messages in database for ${email}, will sync from Gmail API...`);
          shouldSyncFromAPI = true;
        } else {
          console.log(`[API] Found message in database: ${lastMessage.id || lastMessage.message_id}`);
        }

        // 如果数据库中有邮件，尝试获取完整内容
        let fullMessage = null;
        if (!shouldSyncFromAPI) {
          try {
            // 确保lastMessage有id属性
            if (!lastMessage.id && !lastMessage.message_id) {
              console.log(`Message data missing ID for ${email}, will sync from Gmail API...`);
              shouldSyncFromAPI = true;
            } else {
              // 获取完整邮件内容（包括body）- 直接使用账号对象
              const messageId = lastMessage.id || lastMessage.message_id;
              fullMessage = await this.gmailService.getMessageForAccount(messageId, account);
            }
          } catch (error) {
            // 如果获取失败（例如邮件已被删除），从 API 重新同步
            // 检查错误是否为 404 或包含 "not found" 消息
            const isNotFoundError =
              (error.code === 404) ||
              (error.status === 404) ||
              (error.message && (
                error.message.toLowerCase().includes('not found') ||
                error.message.toLowerCase().includes('requested entity')
              ));

            if (isNotFoundError) {
              console.log(`Message not found in Gmail for ${email} (${error.message}), will sync from Gmail API...`);
              shouldSyncFromAPI = true;
            } else {
              throw error; // 其他错误继续抛出
            }
          }
        }

        // 如果需要从 API 同步
        if (shouldSyncFromAPI) {
          console.log(`[API] Syncing messages from Gmail API for ${email}...`);
          const syncedMessages = await this.gmailService.syncMessagesForAccount(account, 1);
          console.log(`[API] Synced ${syncedMessages ? syncedMessages.length : 0} messages for ${email}`);

          if (!syncedMessages || syncedMessages.length === 0) {
            return res.status(404).json({
              success: false,
              error: `No messages found for email: ${email}`
            });
          }

          lastMessage = syncedMessages[0];

          // 确保同步的消息有id属性
          if (!lastMessage.id && !lastMessage.message_id) {
            return res.status(500).json({
              success: false,
              error: 'Invalid message data: missing message ID'
            });
          }

          // 获取完整邮件内容
          const messageId = lastMessage.id || lastMessage.message_id;
          fullMessage = await this.gmailService.getMessageForAccount(messageId, account);
        }

        // 确保获取到了完整邮件
        if (!fullMessage) {
          return res.status(500).json({
            success: false,
            error: 'Failed to retrieve message content'
          });
        }

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
