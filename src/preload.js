const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('gmailAPI', {
  // 授权相关
  authorize: () => ipcRenderer.invoke('gmail:authorize'),
  setAuthCode: (code) => ipcRenderer.invoke('gmail:setAuthCode', code),
  checkAuth: () => ipcRenderer.invoke('gmail:checkAuth'),

  // 邮件操作
  syncMessages: (maxResults) => ipcRenderer.invoke('gmail:syncMessages', maxResults),
  listMessages: (maxResults) => ipcRenderer.invoke('gmail:listMessages', maxResults),
  getMessage: (messageId) => ipcRenderer.invoke('gmail:getMessage', messageId),
  sendMessage: (messageData) => ipcRenderer.invoke('gmail:sendMessage', messageData),
  deleteMessage: (messageId) => ipcRenderer.invoke('gmail:deleteMessage', messageId),
  markAsRead: (messageId) => ipcRenderer.invoke('gmail:markAsRead', messageId),
  getStats: () => ipcRenderer.invoke('gmail:getStats'),

  // 账号管理
  account: {
    getAll: () => ipcRenderer.invoke('account:getAll'),
    getActive: () => ipcRenderer.invoke('account:getActive'),
    switch: (accountId) => ipcRenderer.invoke('account:switch', accountId),
    add: (data) => ipcRenderer.invoke('account:add', data),
    delete: (accountId) => ipcRenderer.invoke('account:delete', accountId),
    export: () => ipcRenderer.invoke('account:export'),
    import: () => ipcRenderer.invoke('account:import')
  },

  // 工具函数
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
});
