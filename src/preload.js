const { contextBridge, ipcRenderer, clipboard } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('gmailAPI', {
  // 授权相关
  authorize: () => ipcRenderer.invoke('gmail:authorize'),
  setAuthCode: (code) => ipcRenderer.invoke('gmail:setAuthCode', code),
  checkAuth: () => ipcRenderer.invoke('gmail:checkAuth'),

  // 邮件操作
  syncMessages: (maxResults, expectedAccountId) => ipcRenderer.invoke('gmail:syncMessages', maxResults, expectedAccountId),
  listMessages: (maxResults, expectedAccountId) => ipcRenderer.invoke('gmail:listMessages', maxResults, expectedAccountId),
  getMessage: (messageId) => ipcRenderer.invoke('gmail:getMessage', messageId),
  sendMessage: (messageData, expectedAccountId) => ipcRenderer.invoke('gmail:sendMessage', messageData, expectedAccountId),
  deleteMessage: (messageId, expectedAccountId) => ipcRenderer.invoke('gmail:deleteMessage', messageId, expectedAccountId),
  markAsRead: (messageId, expectedAccountId) => ipcRenderer.invoke('gmail:markAsRead', messageId, expectedAccountId),
  getStats: () => ipcRenderer.invoke('gmail:getStats'),

  // 账号管理
  account: {
    getAll: () => ipcRenderer.invoke('account:getAll'),
    getActive: () => ipcRenderer.invoke('account:getActive'),
    switch: (accountId) => ipcRenderer.invoke('account:switch', accountId),
    add: (data) => ipcRenderer.invoke('account:add', data),
    delete: (accountId) => ipcRenderer.invoke('account:delete', accountId),
    deleteAll: () => ipcRenderer.invoke('account:deleteAll'),
    export: () => ipcRenderer.invoke('account:export'),
    import: () => ipcRenderer.invoke('account:import')
  },

  // 工具函数
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  copyToClipboard: (text) => {
    try {
      clipboard.writeText(text);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // 事件监听
  onAuthSuccess: (callback) => {
    ipcRenderer.on('auth:success', (event, data) => callback(data));
  },
  onAuthFailed: (callback) => {
    ipcRenderer.on('auth:failed', (event, error) => callback(error));
  }
});
