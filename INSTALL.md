# 安装说明

## 遇到 NODE_MODULE_VERSION 错误？

如果你在启动应用时看到类似这样的错误：

```
Error: The module 'better_sqlite3.node' was compiled against a different Node.js version
```

这是因为 `better-sqlite3` 是一个原生 Node.js 模块，需要针对你的 Electron 版本重新编译。

## 解决方法

### 方法 1：自动重新编译（推荐）

删除 `node_modules` 目录并重新安装：

```bash
# Windows
rmdir /s /q node_modules
npm install

# Linux/macOS
rm -rf node_modules
npm install
```

安装过程中会自动运行 `postinstall` 脚本来重新编译原生模块。

### 方法 2：手动重新编译

如果方法 1 不起作用，手动运行重新编译：

```bash
npm install
npm run rebuild
```

### 方法 3：使用 Python 环境（如果上述方法失败）

`better-sqlite3` 需要构建工具。确保你已安装：

**Windows:**
```bash
npm install --global windows-build-tools
npm install
```

**Linux:**
```bash
sudo apt-get install build-essential python3
npm install
```

**macOS:**
```bash
xcode-select --install
npm install
```

## 完整安装步骤

1. **安装 Node.js** (推荐 LTS 版本)
   - 下载：https://nodejs.org/

2. **克隆项目**
   ```bash
   git clone <repository-url>
   cd gmail_client
   ```

3. **安装依赖**
   ```bash
   npm install
   ```

   如果安装过程中出现错误，请参考上面的解决方法。

4. **配置 Gmail API**
   - 参考 README.md 中的配置说明
   - 创建 `config/credentials.json`

5. **启动应用**
   ```bash
   npm start
   ```

## 常见问题

### Q: 为什么会出现这个问题？

A: `better-sqlite3` 是一个原生模块（使用 C++ 编写），需要针对特定的 Node.js/Electron 版本编译。当你的 Electron 版本更新时，可能需要重新编译这个模块。

### Q: 我可以使用其他数据库吗？

A: 可以，但需要修改代码。SQLite 是轻量级的嵌入式数据库，非常适合桌面应用。

### Q: electron-rebuild 是什么？

A: `electron-rebuild` 是一个工具，可以自动重新编译原生 Node.js 模块以匹配你的 Electron 版本。

## 验证安装

运行以下命令验证安装是否成功：

```bash
npm start
```

如果应用成功启动并显示授权界面，说明安装成功！

## 获取帮助

如果仍然遇到问题，请：

1. 检查 Node.js 版本：`node --version`（推荐使用 16.x 或 18.x LTS）
2. 检查 npm 版本：`npm --version`
3. 查看完整错误日志
4. 在 GitHub Issues 中报告问题
