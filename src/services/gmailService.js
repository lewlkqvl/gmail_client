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

    // 备份当前状态，以便失败时恢复
    const previousAccountId = this.currentAccountId;
    const previousActiveAccount = this.dbService.getActiveAccount();

    console.log('Starting authorization, current state:', {
      previousAccountId,
      previousActiveAccountEmail: previousActiveAccount ? previousActiveAccount.email : 'none'
    });

    try {
      // 创建新的OAuth2客户端实例用于这次授权
      const credentials = await this.loadCredentials();
      const { client_secret, client_id } = credentials.installed;
      const newOAuth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        'http://localhost:3001/callback'
      );

      // 获取token
      const { tokens } = await newOAuth2Client.getToken(code);
      newOAuth2Client.setCredentials(tokens);

      // 初始化 Gmail API 获取用户邮箱
      const tempGmail = google.gmail({ version: 'v1', auth: newOAuth2Client });
      const profile = await tempGmail.users.getProfile({ userId: 'me' });
      const userEmail = profile.data.emailAddress;

      console.log('New account authorization successful:', userEmail);

      // 检查账号是否已存在
      let account = this.dbService.getAccountByEmail(userEmail);
      let newAccountId;

      if (account) {
        // 更新现有账号的 token
        this.dbService.updateAccount(account.id, {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expiry: tokens.expiry_date
        });
        newAccountId = account.id;
        console.log('Updated existing account:', newAccountId);
      } else {
        // 添加新账号
        newAccountId = this.dbService.addAccount(userEmail, null, tokens);
        console.log('Added new account:', newAccountId);
      }

      // 设置为活动账号
      this.dbService.setActiveAccount(newAccountId);

      // 只有所有操作都成功后，才更新Gmail服务状态
      this.currentAccountId = newAccountId;
      this.oauth2Client.setCredentials(tokens);
      this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

      console.log('Authorization completed successfully:', {
        email: userEmail,
        accountId: this.currentAccountId,
        hasGmail: !!this.gmail,
        hasTokens: !!tokens.access_token,
        tokenPreview: tokens.access_token ? tokens.access_token.substring(0, 20) + '...' : 'none'
      });

      return userEmail;
    } catch (error) {
      console.error('Error in setAuthCode:', error);
      console.log('Authorization failed, attempting to restore previous state...');

      // 授权失败，尝试恢复之前的活动账号
      try {
        if (previousActiveAccount && previousActiveAccount.id) {
          // 恢复之前的活动账号
          this.dbService.setActiveAccount(previousActiveAccount.id);
          this.currentAccountId = previousAccountId;

          // 恢复Gmail服务状态
          if (previousActiveAccount.access_token) {
            this.oauth2Client.setCredentials({
              access_token: previousActiveAccount.access_token,
              refresh_token: previousActiveAccount.refresh_token,
              expiry_date: previousActiveAccount.token_expiry
            });
            this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
            console.log('Successfully restored previous account:', previousActiveAccount.email);
          }
        } else {
          console.log('No previous account to restore');
        }
      } catch (restoreError) {
        console.error('Failed to restore previous state:', restoreError);
      }

      throw error;
    }
  }

  async switchAccount(accountId) {
    // 备份当前状态
    const previousAccountId = this.currentAccountId;
    const previousActiveAccount = this.dbService.getActiveAccount();

    try {
      const account = this.dbService.getAccount(accountId);
      if (!account) {
        throw new Error('Account not found');
      }

      if (!account.access_token) {
        throw new Error('Account not authorized');
      }

      console.log('Switching account from', previousActiveAccount ? previousActiveAccount.email : 'none', 'to', account.email);

      // 更新服务状态
      this.currentAccountId = accountId;
      this.oauth2Client.setCredentials({
        access_token: account.access_token,
        refresh_token: account.refresh_token,
        expiry_date: account.token_expiry
      });

      this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });

      // 更新数据库活动账号
      this.dbService.setActiveAccount(accountId);

      console.log('Account switched successfully to:', account.email);
    } catch (error) {
      console.error('Error switching account:', error);

      // 尝试恢复之前的状态
      try {
        if (previousActiveAccount && previousActiveAccount.id) {
          this.currentAccountId = previousAccountId;
          this.oauth2Client.setCredentials({
            access_token: previousActiveAccount.access_token,
            refresh_token: previousActiveAccount.refresh_token,
            expiry_date: previousActiveAccount.token_expiry
          });
          this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
          console.log('Restored previous account after switch failure');
        }
      } catch (restoreError) {
        console.error('Failed to restore previous account:', restoreError);
      }

      throw error;
    }
  }

  async isAuthorized() {
    const activeAccount = this.dbService.getActiveAccount();
    return !!(activeAccount && activeAccount.access_token);
  }

  async syncMessages(maxResults = 50) {
    // 总是从数据库重新加载活动账号，确保状态同步
    const activeAccount = this.dbService.getActiveAccount();

    console.log('syncMessages called:', {
      hasGmail: !!this.gmail,
      hasCurrentAccountId: !!this.currentAccountId,
      hasOAuth2Client: !!this.oauth2Client,
      currentAccountId: this.currentAccountId,
      activeAccountFromDB: activeAccount ? activeAccount.id : null,
      activeAccountEmail: activeAccount ? activeAccount.email : null,
      activeAccountHasToken: activeAccount ? !!activeAccount.access_token : false
    });

    if (!activeAccount || !activeAccount.access_token) {
      throw new Error('Not authorized. Please authorize first.');
    }

    // 如果当前账号ID与数据库中的活动账号不一致，或Gmail实例不存在，重新初始化
    if (!this.gmail || !this.currentAccountId || this.currentAccountId !== activeAccount.id) {
      console.log('Reinitializing Gmail service with active account:', {
        reason: !this.gmail ? 'no gmail instance' :
                !this.currentAccountId ? 'no current account id' :
                'account id mismatch',
        oldAccountId: this.currentAccountId,
        newAccountId: activeAccount.id
      });

      // 重新设置凭据和Gmail实例
      this.currentAccountId = activeAccount.id;
      this.oauth2Client.setCredentials({
        access_token: activeAccount.access_token,
        refresh_token: activeAccount.refresh_token,
        expiry_date: activeAccount.token_expiry
      });
      this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
      console.log('Gmail service reinitialized successfully');
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
    if (!this.currentAccountId) {
      const activeAccount = this.dbService.getActiveAccount();
      if (activeAccount) {
        this.currentAccountId = activeAccount.id;
      }
    }
    return this.currentAccountId;
  }
}

module.exports = GmailService;
