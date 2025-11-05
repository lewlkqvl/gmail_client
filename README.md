# Gmail Electron 客户端

一个使用 Node.js 和 Electron 构建的 Gmail 桌面客户端应用，支持邮件的接收、发送和删除功能。

## 功能特性

- ✅ Gmail 账号授权登录
- ✅ 接收和查看邮件
- ✅ 发送新邮件
- ✅ 回复邮件
- ✅ 删除邮件
- ✅ 标记邮件为已读
- ✅ 美观的用户界面

## 技术栈

- **Electron** - 跨平台桌面应用框架
- **Node.js** - JavaScript 运行时
- **Google APIs** - Gmail API 集成
- **electron-store** - 本地数据存储

## 安装步骤

### 1. 克隆项目

```bash
git clone <repository-url>
cd gmail_client
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置 Gmail API

#### 3.1 创建 Google Cloud 项目

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建新项目或选择现有项目
3. 启用 Gmail API：
   - 在左侧菜单中选择 "API 和服务" > "库"
   - 搜索 "Gmail API"
   - 点击 "启用"

#### 3.2 创建 OAuth 2.0 凭据

1. 在左侧菜单中选择 "API 和服务" > "凭据"
2. 点击 "创建凭据" > "OAuth 客户端 ID"
3. 如果是首次创建，需要先配置 OAuth 同意屏幕：
   - 选择 "外部" 用户类型
   - 填写应用名称、用户支持电子邮件等必填信息
   - 在作用域部分，添加 `https://www.googleapis.com/auth/gmail.modify`
   - 添加测试用户（你的 Gmail 地址）
4. 返回创建 OAuth 客户端 ID：
   - 应用类型选择 "桌面应用"
   - 输入名称
   - 点击 "创建"
5. 下载 JSON 文件

#### 3.3 配置凭据文件

1. 将下载的 JSON 文件重命名为 `credentials.json`
2. 将文件放置在 `config/` 目录下
3. 文件结构应类似于 `config/credentials.example.json`

## 运行应用

```bash
npm start
```

## 使用说明

### 首次使用

1. 启动应用后，点击 "授权 Gmail 访问" 按钮
2. 浏览器会打开 Google 授权页面
3. 登录你的 Google 账号并授予权限
4. 复制授权码（浏览器地址栏中的 `code=` 后面的内容）
5. 将授权码粘贴到应用中并提交

### 查看邮件

- 左侧显示邮件列表（最近 50 封）
- 点击任意邮件查看详情
- 未读邮件会以粗体显示

### 发送邮件

1. 点击顶部 "写邮件" 按钮
2. 填写收件人、主题和内容
3. 点击 "发送"

### 回复邮件

1. 在邮件详情页面点击 "回复" 按钮
2. 系统会自动填充收件人和主题
3. 编写回复内容后发送

### 删除邮件

1. 在邮件详情页面点击 "删除" 按钮
2. 确认删除操作

### 刷新邮件

点击顶部 "刷新" 按钮重新加载邮件列表

## 项目结构

```
gmail_client/
├── config/                        # 配置文件目录
│   ├── credentials.json          # Gmail API 凭据（需要自行配置）
│   └── credentials.example.json  # 凭据示例文件
├── src/
│   ├── main.js                   # Electron 主进程
│   ├── preload.js                # Preload 脚本（IPC 通信）
│   ├── services/
│   │   └── gmailService.js       # Gmail API 服务层
│   └── renderer/
│       ├── index.html            # 主界面 HTML
│       ├── styles.css            # 样式文件
│       └── renderer.js           # 渲染进程 JavaScript
├── package.json                  # 项目配置
└── README.md                     # 项目文档
```

## 安全说明

- 应用使用 OAuth 2.0 进行安全认证
- 不会存储你的 Gmail 密码
- 授权令牌加密存储在本地
- 使用 Electron 的上下文隔离和预加载脚本确保安全性

## 常见问题

### 1. 授权失败

- 确保 `credentials.json` 文件配置正确
- 检查 Google Cloud Console 中是否正确启用了 Gmail API
- 确认你的 Gmail 地址已添加到测试用户列表

### 2. 无法接收邮件

- 检查网络连接
- 确认授权令牌未过期（过期后需要重新授权）
- 查看控制台错误信息

### 3. 发送邮件失败

- 检查收件人邮箱格式是否正确
- 确认 Gmail API 权限是否包含发送邮件权限

## 开发模式

要启用开发者工具，取消 `src/main.js` 中以下代码的注释：

```javascript
mainWindow.webContents.openDevTools();
```

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
