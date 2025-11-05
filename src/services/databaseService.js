const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');
const fs = require('fs');
const crypto = require('crypto');

class DatabaseService {
  constructor() {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'gmail_client.db');

    this.db = new Database(dbPath);
    this.initializeTables();
  }

  // 加密密码
  encrypt(text) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync('gmail-client-secret-key', 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + ':' + encrypted;
  }

  // 解密密码
  decrypt(text) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync('gmail-client-secret-key', 'salt', 32);

    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  initializeTables() {
    // 创建账号表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT,
        access_token TEXT,
        refresh_token TEXT,
        token_expiry INTEGER,
        is_active INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    // 创建邮件表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        message_id TEXT UNIQUE NOT NULL,
        thread_id TEXT,
        from_email TEXT,
        to_email TEXT,
        subject TEXT,
        snippet TEXT,
        body TEXT,
        date TEXT,
        labels TEXT,
        is_read INTEGER DEFAULT 0,
        is_deleted INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
      )
    `);

    // 创建索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_account_id ON messages(account_id);
      CREATE INDEX IF NOT EXISTS idx_messages_message_id ON messages(message_id);
      CREATE INDEX IF NOT EXISTS idx_messages_date ON messages(date DESC);
      CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);
    `);
  }

  // ==================== 账号管理 ====================

  // 添加账号
  addAccount(email, password = null, tokens = null) {
    const stmt = this.db.prepare(`
      INSERT INTO accounts (email, password, access_token, refresh_token, token_expiry)
      VALUES (?, ?, ?, ?, ?)
    `);

    const encryptedPassword = password ? this.encrypt(password) : null;
    const accessToken = tokens?.access_token || null;
    const refreshToken = tokens?.refresh_token || null;
    const tokenExpiry = tokens?.expiry_date || null;

    const result = stmt.run(email, encryptedPassword, accessToken, refreshToken, tokenExpiry);
    return result.lastInsertRowid;
  }

  // 更新账号
  updateAccount(id, data) {
    const fields = [];
    const values = [];

    if (data.email) {
      fields.push('email = ?');
      values.push(data.email);
    }
    if (data.password !== undefined) {
      fields.push('password = ?');
      values.push(data.password ? this.encrypt(data.password) : null);
    }
    if (data.access_token !== undefined) {
      fields.push('access_token = ?');
      values.push(data.access_token);
    }
    if (data.refresh_token !== undefined) {
      fields.push('refresh_token = ?');
      values.push(data.refresh_token);
    }
    if (data.token_expiry !== undefined) {
      fields.push('token_expiry = ?');
      values.push(data.token_expiry);
    }
    if (data.is_active !== undefined) {
      fields.push('is_active = ?');
      values.push(data.is_active ? 1 : 0);
    }

    fields.push('updated_at = ?');
    values.push(Math.floor(Date.now() / 1000));

    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE accounts SET ${fields.join(', ')} WHERE id = ?
    `);

    return stmt.run(...values);
  }

  // 获取账号
  getAccount(id) {
    const stmt = this.db.prepare('SELECT * FROM accounts WHERE id = ?');
    const account = stmt.get(id);

    if (account && account.password) {
      account.password = this.decrypt(account.password);
    }

    return account;
  }

  // 通过邮箱获取账号
  getAccountByEmail(email) {
    const stmt = this.db.prepare('SELECT * FROM accounts WHERE email = ?');
    const account = stmt.get(email);

    if (account && account.password) {
      account.password = this.decrypt(account.password);
    }

    return account;
  }

  // 获取所有账号
  getAllAccounts() {
    const stmt = this.db.prepare('SELECT * FROM accounts ORDER BY created_at DESC');
    const accounts = stmt.all();

    return accounts.map(account => {
      if (account.password) {
        account.password = this.decrypt(account.password);
      }
      return account;
    });
  }

  // 获取活动账号
  getActiveAccount() {
    const stmt = this.db.prepare('SELECT * FROM accounts WHERE is_active = 1 LIMIT 1');
    const account = stmt.get();

    if (account && account.password) {
      account.password = this.decrypt(account.password);
    }

    return account;
  }

  // 设置活动账号
  setActiveAccount(id) {
    // 先将所有账号设置为非活动
    this.db.prepare('UPDATE accounts SET is_active = 0').run();

    // 设置指定账号为活动
    const stmt = this.db.prepare('UPDATE accounts SET is_active = 1, updated_at = ? WHERE id = ?');
    return stmt.run(Math.floor(Date.now() / 1000), id);
  }

  // 删除账号
  deleteAccount(id) {
    const stmt = this.db.prepare('DELETE FROM accounts WHERE id = ?');
    return stmt.run(id);
  }

  // ==================== 邮件管理 ====================

  // 保存邮件
  saveMessage(accountId, message) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO messages
      (account_id, message_id, thread_id, from_email, to_email, subject, snippet, body, date, labels, is_read)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const labels = Array.isArray(message.labelIds) ? message.labelIds.join(',') : '';
    const isRead = message.labelIds && !message.labelIds.includes('UNREAD') ? 1 : 0;

    return stmt.run(
      accountId,
      message.id,
      message.threadId || '',
      message.from || '',
      message.to || '',
      message.subject || '',
      message.snippet || '',
      message.body || '',
      message.date || '',
      labels,
      isRead
    );
  }

  // 批量保存邮件
  saveMessages(accountId, messages) {
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO messages
      (account_id, message_id, thread_id, from_email, to_email, subject, snippet, body, date, labels, is_read)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((messages) => {
      for (const message of messages) {
        const labels = Array.isArray(message.labelIds) ? message.labelIds.join(',') : '';
        const isRead = message.labelIds && !message.labelIds.includes('UNREAD') ? 1 : 0;

        insert.run(
          accountId,
          message.id,
          message.threadId || '',
          message.from || '',
          message.to || '',
          message.subject || '',
          message.snippet || '',
          message.body || '',
          message.date || '',
          labels,
          isRead
        );
      }
    });

    insertMany(messages);
  }

  // 获取邮件列表
  getMessages(accountId, limit = 50, offset = 0) {
    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE account_id = ? AND is_deleted = 0
      ORDER BY date DESC
      LIMIT ? OFFSET ?
    `);

    const messages = stmt.all(accountId, limit, offset);

    return messages.map(msg => ({
      ...msg,
      labelIds: msg.labels ? msg.labels.split(',') : []
    }));
  }

  // 获取单个邮件
  getMessage(messageId) {
    const stmt = this.db.prepare('SELECT * FROM messages WHERE message_id = ?');
    const message = stmt.get(messageId);

    if (message) {
      message.labelIds = message.labels ? message.labels.split(',') : [];
    }

    return message;
  }

  // 标记邮件为已读
  markMessageAsRead(messageId) {
    const stmt = this.db.prepare('UPDATE messages SET is_read = 1 WHERE message_id = ?');
    return stmt.run(messageId);
  }

  // 删除邮件（软删除）
  deleteMessage(messageId) {
    const stmt = this.db.prepare('UPDATE messages SET is_deleted = 1 WHERE message_id = ?');
    return stmt.run(messageId);
  }

  // 获取邮件统计
  getMessageStats(accountId) {
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread
      FROM messages
      WHERE account_id = ? AND is_deleted = 0
    `);

    return stmt.get(accountId);
  }

  // ==================== 导入导出 ====================

  // 导出账号
  exportAccounts() {
    const accounts = this.getAllAccounts();

    return accounts.map(account => ({
      email: account.email,
      password: account.password,
      created_at: account.created_at
    }));
  }

  // 导入账号
  importAccounts(accounts) {
    const results = [];

    for (const account of accounts) {
      try {
        // 检查账号是否已存在
        const existing = this.getAccountByEmail(account.email);

        if (existing) {
          // 更新已存在的账号
          this.updateAccount(existing.id, {
            password: account.password
          });
          results.push({ email: account.email, status: 'updated' });
        } else {
          // 添加新账号
          this.addAccount(account.email, account.password);
          results.push({ email: account.email, status: 'added' });
        }
      } catch (error) {
        results.push({ email: account.email, status: 'error', error: error.message });
      }
    }

    return results;
  }

  // 关闭数据库
  close() {
    this.db.close();
  }
}

module.exports = DatabaseService;
