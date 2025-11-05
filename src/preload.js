const { contextBridge, ipcRenderer, shell } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('gmailAPI', {
  // 授权相关
  authorize: () => ipcRenderer.invoke('gmail:authorize'),
  setAuthCode: (code) => ipcRenderer.invoke('gmail:setAuthCode', code),
  checkAuth: () => ipcRenderer.invoke('gmail:checkAuth'),

  // 邮件操作
  listMessages: (maxResults) => ipcRenderer.invoke('gmail:listMessages', maxResults),
  getMessage: (messageId) => ipcRenderer.invoke('gmail:getMessage', messageId),
  sendMessage: (messageData) => ipcRenderer.invoke('gmail:sendMessage', messageData),
  deleteMessage: (messageId) => ipcRenderer.invoke('gmail:deleteMessage', messageId),
  markAsRead: (messageId) => ipcRenderer.invoke('gmail:markAsRead', messageId),

  // 工具函数
  openExternal: (url) => shell.openExternal(url)
});
