# DeepSeek Text Picker

Chrome / Edge 扩展（v0.1.0）：在 [chat.deepseek.com](https://chat.deepseek.com) 的回答旁显示「原文」图标，展示与官方「复制」一致的 Markdown。

## 原理

点击时从页面**本地内存**读取聊天 store（zustand `D.L` → `getMessage` / `sessionStore`），正文处理对齐官方「复制」；必要时再尝试从 React fiber 读取。**不拦截网络请求**。

## 安装（开发者模式）

1. 打开 Chrome / Edge，进入 `chrome://extensions`（或 `edge://extensions`）
2. 开启「开发者模式」
3. 「加载已解压的扩展程序」，选择本仓库的 `extension` 目录
4. 打开或刷新 DeepSeek 聊天页

修改代码后：在扩展页点「重新加载」，再刷新聊天页即可。

## 使用

- 仅在 DeepSeek **回答**旁出现图标（复用官方操作栏样式，悬停显示）
- 点击后弹层展示 Markdown；有深度思考时可切换「原文 / 思考」
- 「复制」写入剪贴板；成功时在顶栏显示「已复制」

若提示读不到原文：确认该条回答已显示完整，或刷新页面后重试。

## 目录

```
extension/
  manifest.json
  inject.js      # MAIN world：读取页面本地 store
  content.js     # UI 与通信
  content.css
```
