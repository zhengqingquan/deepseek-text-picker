# DeepSeek Text Picker

Chrome / Edge 扩展（v0.2.0）：在 [chat.deepseek.com](https://chat.deepseek.com) 的回答旁显示「原文」图标，展示与官方「复制」一致的 Markdown；并可导出当前会话整段对话。

## 使用

在 DeepSeek 的回答底部：

1. 点击「显示原文」图标，查看 Markdown 原文
2. 点击「导出会话」图标，导出当前会话为 Markdown

「复制」写入剪贴板；成功时在顶栏显示「已复制」。有深度思考时可切换「原文 / 思考」，并可选「包含深度思考」。导出会话支持复制或下载 `.md`。

若提示读不到原文 / 会话：确认对话已显示完整，或刷新页面后重试。

## 安装

### 从 Release 下载（推荐）

1. 打开 [Releases](https://github.com/zhengqingquan/deepseek-text-picker/releases)，下载 `deepseek-text-picker-x.y.z.zip`
2. 解压到任意目录
3. 打开 Chrome / Edge，进入 `chrome://extensions`（或 `edge://extensions`）
4. 开启「开发者模式」→「加载已解压的扩展程序」→ 选择解压后的目录（内含 `manifest.json`）
5. 打开或刷新 DeepSeek 聊天页

### 从源码目录

1. 打开 Chrome / Edge 扩展管理页，开启开发者模式
2. 「加载已解压的扩展程序」，选择本仓库的 `extension` 目录
3. 打开或刷新 DeepSeek 聊天页

修改代码后：在扩展页点「重新加载」，再刷新聊天页即可。本地打包可用：

```powershell
.\scripts\pack-extension.ps1
```

产物在 `dist/deepseek-text-picker-<version>.zip`。

## 原理

点击时从页面**本地内存**读取聊天 store（zustand `D.L` → `getMessage` / `sessionStore`），正文处理对齐官方「复制」；必要时再尝试从 React fiber 读取。**不拦截网络请求**。

## 目录

```
extension/
  manifest.json
  inject.js       # MAIN world：读取页面本地 store
  content.js      # Isolated world：按钮 UI、弹层、与 inject 通信
  content.css
  popup.html      # 工具栏弹层
  popup.css
  popup.js
  icons/          # 扩展图标
scripts/
  pack-extension.ps1  # 打成 Release 用 zip
```
