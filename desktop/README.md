# StudyBuddy Windows 桌面版

桌面版面向 Windows 10/11 64 位。它自带 Electron、Chromium、Node.js 和本机 SQLite 服务；日常使用不需要安装 Node.js、输入 npm 命令、开浏览器或保留黑色终端窗口。关闭软件会关闭自己的本机服务。

## 下载与打开

GitHub 源码页面的「Code → Download ZIP」仍是源码，不是可直接运行的桌面包。

1. 打开仓库的 [Windows 桌面版构建页面](https://github.com/LJY-05/my-learning-notes/actions/workflows/desktop-windows.yml)。
2. 进入最新一次成功（绿色勾）的构建，在页面底部 **Artifacts** 下载 **StudyBuddy-Windows-Desktop**。下载可能需要登录 GitHub。
3. 解压下载的附件；如果里面还有 `StudyBuddy-Desktop-1.1.0-win-x64.zip`，继续解压到普通文件夹。
4. 双击解压目录中的 **StudyBuddy.exe**。必须保留同目录的资源文件，不能只移动一个 exe。
5. 可以右键 StudyBuddy.exe 创建桌面快捷方式。以后双击快捷方式即可。

本地开发打包输出也位于 `desktop/release/StudyBuddy-Desktop-1.1.0-win-x64.zip`。当前包没有商业代码签名，Windows 可能显示未知发布者；请仅使用本仓库构建的包，不需要关闭杀毒软件。

## 从原来的网页版迁移

1. 先在原网页版保存尚未提交的计时，并导出完整 JSON 备份，然后关闭原来的黑色启动窗口。
2. 打开桌面版，在顶部菜单选择 **StudyBuddy → 导入旧项目…**。
3. 选择原项目中能看到 `package.json`、`.env`、`data` 的那一层文件夹。
4. 核对找到的任务数与完成数，点击「导入」。桌面版会迁移数据库以及旧 `.env` 中的 AI 配置；原项目不被修改。

不需要重新申请 DeepSeek 密钥或充值。导入前桌面版已有的数据和配置会自动备份；如果配置导入失败，数据库会回滚。数据库迁移使用 SQLite 原生一致性备份，包含仍在 WAL 日志中的已提交记录，不是简单复制主数据库文件。

只有 JSON 备份时，也可以在桌面版「设置与数据 → 恢复 JSON 备份」恢复学习记录，再通过下面的 AI 配置入口设置原密钥。网页浏览器中尚未保存的计时草稿不能自动迁移，请先保存。

## AI 配置

顶部菜单 **StudyBuddy → AI 配置…** 可以设置 DeepSeek 或 OpenAI 的密钥和模型，无需编辑文件。密钥输入留空表示保留已有密钥；要删除时勾选「清除此服务已有密钥」。保存后本机服务自动重启，回到主界面「设置与数据」选择对应助手模式即可。

配置只保存在当前电脑的应用数据目录，不会进入前端、JSON 学习备份或 GitHub。它是本机配置文件，没有声称经过操作系统密钥库加密；不要将整个应用数据目录或其中 `.env` 发给别人。真实 AI 的网络、账户余额和计费仍由相应服务商决定；Mock 不需要密钥。

## 数据位置与更新

Windows 默认数据位置为 `%APPDATA%\StudyBuddy`，也可通过 **StudyBuddy → 打开数据目录** 查看。数据库为 `studybuddy.sqlite`，AI 配置为 `.env`，自动迁移备份在 `backups` 下。

数据不放在解压的软件文件夹，因此以后解压新版不会自动覆盖学习记录。更新前仍建议导出 JSON；关闭旧桌面版，再打开新版本的 StudyBuddy.exe。已有用户的主题和助手模式保留，运行服务的随机端口变化不会改变软件内部地址，也不会使计时草稿因端口变化消失。

计时沿用原规则：休息前请暂停或保存；未暂停的草稿重新打开时仍按经过时间推算。关闭软件会停掉本机服务，但未保存草稿只在这台电脑的应用缓存中。

## 开发与验证

开发者需要 Node.js 24+。桌面开发依赖独立存放，普通网页版用户的 `npm ci` 不会安装 Electron。

```sh
npm ci
npm --prefix desktop ci
npm run desktop:prepare
npm --prefix desktop test
npm run desktop:dev
npm run desktop:win
```

`desktop:prepare` 构建前端，并把服务端和迁移辅助程序打成独立 CJS 包，复制正式工作簿与迁移 SQL。Windows ZIP 自带运行时，不从最终用户电脑查找 node.exe。

桌面运行检查：

```sh
# 源码开发运行（先准备 Electron 二进制）
node desktop/node_modules/electron/install.js
node desktop/smoke.mjs desktop/node_modules/electron/dist/electron --source
node --import tsx desktop/ui.test.mjs desktop/node_modules/electron/dist/electron --source
# Windows 构建后检查真正的桌面 exe
node desktop/smoke.mjs
node --import tsx desktop/ui.test.mjs desktop/release/win-unpacked/StudyBuddy.exe
```

在 Windows 源码检查时，第一个可执行文件应使用 `desktop/node_modules/electron/dist/electron.exe`。Linux 自动化使用无显示屏的 Ozone 后端并调整测试窗口视口；发布给 Windows 的应用没有使用 `--no-sandbox` 参数。

验证包括：启动内置服务、实际渲染页面、桌面请求权限检查、SQLite 读写、连续两次启动的数据库和 localStorage 持久化、退出停止服务、Mock 流式聊天、原生 AI 配置窗口与重启、旧项目导入与配置迁移。迁移单元测试还验证坏数据库拒绝、WAL 记录、自动备份及失败回滚。

服务仅监听本机回环地址并要求桌面随机令牌，渲染器不启用 Node 集成，启用上下文隔离与沙箱；AI 配置窗口只暴露受限 IPC。网页版本仍保留原来的启动方式。

## 验证边界

当前执行环境是 Linux，已验证实际 Electron 桌面运行及 Linux 打包运行。Windows ZIP 可在此生成，但不把跨平台打包成功说成 Windows 10 实机测试；GitHub Actions 的 Windows 构建会运行桌面 exe 自检和界面联测，通过后才上传下载附件。真实付费 AI 请求不在自动测试中执行。
