const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const Store = require('electron-store');

const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];
const TOKEN_PATH = 'token.json';
const CREDENTIALS_PATH = path.join(__dirname, '../../config/credentials.json');

class GmailService {
  constructor() {
    this.store = new Store();
    this.oauth2Client = null;
    this.gmail = null;
    this.initializeClient();
  }

  async initializeClient() {
    try {
      const credentials = await this.loadCredentials();
      const { client_secret, client_id, redirect_uris } = credentials.installed;

      this.oauth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0]
      );

      // 尝试加载已保存的 token
      const token = this.store.get('token');
      if (token) {
        this.oauth2Client.setCredentials(token);
        this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
      }
    } catch (error) {
      console.error('Error initializing Gmail client:', error.message);
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
    });

    return authUrl;
  }

  async setAuthCode(code) {
    if (!this.oauth2Client) {
      throw new Error('OAuth2 client not initialized');
    }

    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);

    // 保存 token
    this.store.set('token', tokens);

    // 初始化 Gmail API
    this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
  }

  async isAuthorized() {
    const token = this.store.get('token');
    return !!token;
  }

  async listMessages(maxResults = 20) {
    if (!this.gmail) {
      throw new Error('Not authorized. Please authorize first.');
    }

    const response = await this.gmail.users.messages.list({
      userId: 'me',
      maxResults: maxResults,
    });

    const messages = response.data.messages || [];

    // 获取每封邮件的详细信息
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

          return {
            id: msg.id,
            threadId: msg.threadId,
            from: getHeader('From'),
            to: getHeader('To'),
            subject: getHeader('Subject'),
            date: getHeader('Date'),
            snippet: details.data.snippet,
            labelIds: details.data.labelIds || []
          };
        } catch (error) {
          console.error(`Error fetching message ${msg.id}:`, error);
          return null;
        }
      })
    );

    return detailedMessages.filter(msg => msg !== null);
  }

  async getMessage(messageId) {
    if (!this.gmail) {
      throw new Error('Not authorized. Please authorize first.');
    }

    const response = await this.gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full'
    });

    const message = response.data;
    const headers = message.payload.headers;

    const getHeader = (name) => {
      const header = headers.find(h => h.name === name);
      return header ? header.value : '';
    };

    // 解析邮件正文
    let body = '';
    if (message.payload.body.data) {
      body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
    } else if (message.payload.parts) {
      const textPart = message.payload.parts.find(part =>
        part.mimeType === 'text/plain' || part.mimeType === 'text/html'
      );
      if (textPart && textPart.body.data) {
        body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
      }
    }

    return {
      id: message.id,
      threadId: message.threadId,
      from: getHeader('From'),
      to: getHeader('To'),
      subject: getHeader('Subject'),
      date: getHeader('Date'),
      body: body,
      labelIds: message.labelIds || []
    };
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
  }
}

module.exports = GmailService;
