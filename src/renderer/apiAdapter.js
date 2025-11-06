/**
 * API适配器
 * 自动检测运行模式（Electron或Web），并使用相应的通信方式
 */

class ApiAdapter {
  constructor() {
    // 检测运行模式
    this.isElectron = typeof window !== 'undefined' && window.gmailAPI !== undefined;
    this.mode = this.isElectron ? 'electron' : 'web';

    console.log(`🔧 API Adapter initialized in ${this.mode} mode`);
  }

  /**
   * Electron模式：调用IPC
   * Web模式：调用HTTP API
   */
  async callApi(method, ...args) {
    if (this.isElectron) {
      // Electron模式：使用IPC
      return await window.gmailAPI[method](...args);
    } else {
      // Web模式：使用HTTP API
      return await this._callHttpApi(method, args);
    }
  }

  /**
   * HTTP API调用（Web模式）
   */
  async _callHttpApi(method, args) {
    // 将IPC方法映射到HTTP端点
    const methodMap = {
      // Gmail操作
      'authorize': { method: 'POST', url: '/api/gmail/authorize' },
      'setAuthCode': { method: 'POST', url: '/api/gmail/setAuthCode', body: (args) => ({ code: args[0] }) },
      'checkAuth': { method: 'GET', url: '/api/gmail/checkAuth' },
      'syncMessages': { method: 'POST', url: '/api/gmail/syncMessages', body: (args) => ({ maxResults: args[0] }) },
      'listMessages': { method: 'GET', url: `/api/gmail/listMessages?maxResults=${args[0] || 50}` },
      'getMessage': { method: 'GET', url: `/api/gmail/getMessage/${args[0]}` },
      'sendMessage': { method: 'POST', url: '/api/gmail/sendMessage', body: (args) => args[0] },
      'deleteMessage': { method: 'DELETE', url: `/api/gmail/deleteMessage/${args[0]}` },
      'markAsRead': { method: 'POST', url: `/api/gmail/markAsRead/${args[0]}` },
      'getStats': { method: 'GET', url: '/api/gmail/getStats' },

      // 账号操作
      'getAllAccounts': { method: 'GET', url: '/api/account/getAll' },
      'getActiveAccount': { method: 'GET', url: '/api/account/getActive' },
      'switchAccount': { method: 'POST', url: '/api/account/switch', body: (args) => ({ accountId: args[0] }) },
      'deleteAccount': { method: 'DELETE', url: `/api/account/delete/${args[0]}` },
    };

    const apiConfig = methodMap[method];
    if (!apiConfig) {
      throw new Error(`Unknown API method: ${method}`);
    }

    const fetchOptions = {
      method: apiConfig.method,
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include' // 包含cookies（用于session）
    };

    // 构建URL
    let url = apiConfig.url;
    if (typeof url === 'function') {
      url = url(args);
    }

    // 添加请求体
    if (apiConfig.body && (apiConfig.method === 'POST' || apiConfig.method === 'PUT')) {
      fetchOptions.body = JSON.stringify(apiConfig.body(args));
    }

    try {
      const response = await fetch(url, fetchOptions);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`API call failed (${method}):`, error);
      throw error;
    }
  }

  /**
   * 打开外部链接
   */
  async openExternal(url) {
    if (this.isElectron) {
      return await window.gmailAPI.openExternal(url);
    } else {
      // Web模式：在新标签页打开
      window.open(url, '_blank');
      return { success: true };
    }
  }

  /**
   * 监听授权成功事件
   */
  onAuthSuccess(callback) {
    if (this.isElectron) {
      window.gmailAPI.onAuthSuccess(callback);
    } else {
      // Web模式：轮询检查授权状态
      this._authSuccessCallback = callback;
    }
  }

  /**
   * 监听授权失败事件
   */
  onAuthFailed(callback) {
    if (this.isElectron) {
      window.gmailAPI.onAuthFailed(callback);
    } else {
      // Web模式：通过HTTP响应处理
      this._authFailedCallback = callback;
    }
  }

  /**
   * 获取运行模式
   */
  getMode() {
    return this.mode;
  }

  /**
   * 是否为Electron模式
   */
  isElectronMode() {
    return this.isElectron;
  }

  /**
   * 是否为Web模式
   */
  isWebMode() {
    return !this.isElectron;
  }
}

// 创建全局实例
const apiAdapter = new ApiAdapter();

// 兼容性包装：模拟window.gmailAPI接口
if (!apiAdapter.isElectron) {
  window.gmailAPI = {
    authorize: () => apiAdapter.callApi('authorize'),
    setAuthCode: (code) => apiAdapter.callApi('setAuthCode', code),
    checkAuth: () => apiAdapter.callApi('checkAuth'),
    syncMessages: (maxResults) => apiAdapter.callApi('syncMessages', maxResults),
    listMessages: (maxResults) => apiAdapter.callApi('listMessages', maxResults),
    getMessage: (messageId) => apiAdapter.callApi('getMessage', messageId),
    sendMessage: (data) => apiAdapter.callApi('sendMessage', data),
    deleteMessage: (messageId) => apiAdapter.callApi('deleteMessage', messageId),
    markAsRead: (messageId) => apiAdapter.callApi('markAsRead', messageId),
    getStats: () => apiAdapter.callApi('getStats'),
    getAllAccounts: () => apiAdapter.callApi('getAllAccounts'),
    getActiveAccount: () => apiAdapter.callApi('getActiveAccount'),
    switchAccount: (accountId) => apiAdapter.callApi('switchAccount', accountId),
    deleteAccount: (accountId) => apiAdapter.callApi('deleteAccount', accountId),
    openExternal: (url) => apiAdapter.openExternal(url),
    onAuthSuccess: (callback) => apiAdapter.onAuthSuccess(callback),
    onAuthFailed: (callback) => apiAdapter.onAuthFailed(callback),
  };
}
