const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];
const CREDENTIALS_PATH = path.join(__dirname, '../../config/credentials.json');

class GmailService {
  constructor(dbService) {
    this.dbService = dbService;
    this.oauth2Client = null;
    this.gmail = null;
    this.currentAccountId = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      const credentials = await this.loadCredentials();
      const { client_secret, client_id } = credentials.installed;

      // 使用本地服务器作为重定向 URI
      this.oauth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        'http://localhost:3001/callback'
      );

      // 尝试加载活动账号的 token
      const activeAccount = this.dbService.getActiveAccount();
      if (activeAccount && activeAccount.access_token) {
        this.currentAccountId = activeAccount.id;
        this.oauth2Client.setCredentials({
          access_token: activeAccount.access_token,
          refresh_token: activeAccount.refresh_token,
          expiry_date: activeAccount.token_expiry
        });
        this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
      }

      this.initialized = true;
      console.log('Gmail service initialized successfully');
    } catch (error) {
      console.error('Error initializing Gmail client:', error.message);
      throw error;
    }
  }

  async loadCredentials() {
    try {
      const content = await fs.readFile(CREDENTIALS_PATH);
      return JSON.parse(content);
    } catch (error) {
      throw new Error('请先配置 credentials.json 文件。参考 credentials.example.json');
    }
  }

  getAuthUrl() {
    if (!this.oauth2Client) {
      throw new Error('OAuth2 client not initialized');
    }

    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent'
    });

    return authUrl;
  }

  async setAuthCode(code, email) {
    if (!this.oauth2Client) {
      throw new Error('OAuth2 client not initialized');
    }

    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);

    // 初始化 Gmail API 获取用户邮箱
    const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const userEmail = profile.data.emailAddress;

    // 检查账号是否已存在
    let account = this.dbService.getAccountByEmail(userEmail);

    if (account) {
      // 更新现有账号的 token
      this.dbService.updateAccount(account.id, {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expiry: tokens.expiry_date
      });
      this.currentAccountId = account.id;
    } else {
      // 添加新账号
      this.currentAccountId = this.dbService.addAccount(userEmail, null, tokens);
    }

    // 设置为活动账号
    this.dbService.setActiveAccount(this.currentAccountId);
    this.gmail = gmail;

    return userEmail;
  }

  async switchAccount(accountId) {
    const account = this.dbService.getAccount(accountId);
    if (!account) {
      throw new Error('Account not found');
    }

    if (!account.access_token) {
      throw new Error('Account not authorized');
    }

    this.currentAccountId = accountId;
    this.oauth2Client.setCredentials({
      access_token: account.access_token,
      refresh_token: account.refresh_token,
      expiry_date: account.token_expiry
    });

    this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
    this.dbService.setActiveAccount(accountId);
  }

  async isAuthorized() {
    const activeAccount = this.dbService.getActiveAccount();
    return !!(activeAccount && activeAccount.access_token);
  }

  async syncMessages(maxResults = 50) {
    if (!this.gmail || !this.currentAccountId) {
      throw new Error('Not authorized. Please authorize first.');
    }

    const response = await this.gmail.users.messages.list({
      userId: 'me',
      maxResults: maxResults,
    });

    const messages = response.data.messages || [];

    // 获取每封邮件的详细信息并保存到数据库
    const detailedMessages = await Promise.all(
      messages.map(async (msg) => {
        try {
          const details = await this.gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'metadata',
            metadataHeaders: ['From', 'To', 'Subject', 'Date']
          });

          const headers = details.data.payload.headers;
          const getHeader = (name) => {
            const header = headers.find(h => h.name === name);
            return header ? header.value : '';
          };

          const message = {
            id: msg.id,
            threadId: msg.threadId,
            from: getHeader('From'),
            to: getHeader('To'),
            subject: getHeader('Subject'),
            date: getHeader('Date'),
            snippet: details.data.snippet,
            labelIds: details.data.labelIds || []
          };

          // 保存到数据库
          this.dbService.saveMessage(this.currentAccountId, message);

          return message;
        } catch (error) {
          console.error(`Error fetching message ${msg.id}:`, error);
          return null;
        }
      })
    );

    return detailedMessages.filter(msg => msg !== null);
  }

  async listMessages(maxResults = 50) {
    if (!this.currentAccountId) {
      throw new Error('No active account');
    }

    // 从数据库读取邮件
    return this.dbService.getMessages(this.currentAccountId, maxResults);
  }

  async getMessage(messageId) {
    // 先从数据库读取
    let message = this.dbService.getMessage(messageId);

    // 如果数据库中没有 body，从 API 获取
    if (message && !message.body) {
      if (!this.gmail) {
        throw new Error('Not authorized. Please authorize first.');
      }

      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full'
      });

      const apiMessage = response.data;
      const headers = apiMessage.payload.headers;

      const getHeader = (name) => {
        const header = headers.find(h => h.name === name);
        return header ? header.value : '';
      };

      // 解析邮件正文
      let body = '';
      if (apiMessage.payload.body.data) {
        body = Buffer.from(apiMessage.payload.body.data, 'base64').toString('utf-8');
      } else if (apiMessage.payload.parts) {
        const textPart = apiMessage.payload.parts.find(part =>
          part.mimeType === 'text/plain' || part.mimeType === 'text/html'
        );
        if (textPart && textPart.body.data) {
          body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
        }
      }

      message = {
        id: apiMessage.id,
        threadId: apiMessage.threadId,
        from: getHeader('From'),
        to: getHeader('To'),
        subject: getHeader('Subject'),
        date: getHeader('Date'),
        body: body,
        labelIds: apiMessage.labelIds || []
      };

      // 更新数据库
      this.dbService.saveMessage(this.currentAccountId, message);
    }

    return message;
  }

  async sendMessage({ to, subject, message }) {
    if (!this.gmail) {
      throw new Error('Not authorized. Please authorize first.');
    }

    const email = [
      `To: ${to}`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: ${subject}`,
      '',
      message
    ].join('\n');

    const encodedMessage = Buffer.from(email)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await this.gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    return response.data;
  }

  async deleteMessage(messageId) {
    if (!this.gmail) {
      throw new Error('Not authorized. Please authorize first.');
    }

    await this.gmail.users.messages.delete({
      userId: 'me',
      id: messageId,
    });

    // 在数据库中标记为已删除
    this.dbService.deleteMessage(messageId);
  }

  async markAsRead(messageId) {
    if (!this.gmail) {
      throw new Error('Not authorized. Please authorize first.');
    }

    await this.gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        removeLabelIds: ['UNREAD'],
      },
    });

    // 更新数据库
    this.dbService.markMessageAsRead(messageId);
  }

  getCurrentAccountId() {
    return this.currentAccountId;
  }
}

module.exports = GmailService;
