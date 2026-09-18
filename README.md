<!-- markdownlint-disable -->

**简体中文** | [繁體中文](README.zh-TW.md) | [English](README.en.md)

<div align="center">

<img src="extension/icons/icon128.png" width="120" alt="DeepSeek Text Picker">

# DeepSeek Text Picker

方便复制 DeepSeek 网页版回答中的部分文本：在回复旁查看与官方「复制」一致的 Markdown 原文，也可导出整段会话

[反馈问题](https://github.com/zhengqingquan/deepseek-text-picker/issues) · [Releases](https://github.com/zhengqingquan/deepseek-text-picker/releases) · [更新记录](CHANGELOG.md)

[![Version](https://img.shields.io/github/v/release/zhengqingquan/deepseek-text-picker)](https://github.com/zhengqingquan/deepseek-text-picker/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Stars](https://img.shields.io/github/stars/zhengqingquan/deepseek-text-picker?color=ffcb47&labelColor=black)<br>
![Chrome](https://img.shields.io/badge/Chrome-MV3-4285F4?logo=googlechrome&logoColor=white)
![Edge](https://img.shields.io/badge/Edge-MV3-0078D7?logo=microsoftedge&logoColor=white)
![i18n](https://img.shields.io/badge/i18n-zh%20%2F%20zh%E2%80%91TW%20%2F%20en-green)

<p>
  <img src="docs/demo.gif" width="480" alt="使用演示" />
</p>

<p>
  <img src="docs/screenshot.png" width="480" alt="显示原文弹层" />
</p>

</div>

## 简介

面向 [DeepSeek 网页版](https://chat.deepseek.com)（Chrome / Edge）。官方聊天页不便直接选中复制时，本扩展在回答旁提供「原文」视图，便于挑选并复制部分文本；也可按需导出整段会话。

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
docs/
  demo.gif        # README 使用演示（动图）
  screenshot.png  # README 截图：显示原文弹层
extension/
  _locales/       # chrome.i18n：zh_CN（默认）/ zh_TW / zh_HK / en
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
