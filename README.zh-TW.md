<!-- markdownlint-disable -->

[简体中文](README.md) | **繁體中文** | [English](README.en.md)

<div align="center">

<img src="extension/icons/icon128.png" width="120" alt="DeepSeek Text Picker">

# DeepSeek Text Picker

方便複製 DeepSeek 網頁版回覆中的部分文字：在回覆旁檢視與官方「複製」一致的 Markdown 原文，也可匯出整段會話

[回報問題](https://github.com/zhengqingquan/deepseek-text-picker/issues) · [Releases](https://github.com/zhengqingquan/deepseek-text-picker/releases) · [更新記錄](CHANGELOG.md)

[![Version](https://img.shields.io/github/v/release/zhengqingquan/deepseek-text-picker)](https://github.com/zhengqingquan/deepseek-text-picker/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Stars](https://img.shields.io/github/stars/zhengqingquan/deepseek-text-picker?color=ffcb47&labelColor=black)<br>
![Chrome](https://img.shields.io/badge/Chrome-MV3-4285F4?logo=googlechrome&logoColor=white)
![Edge](https://img.shields.io/badge/Edge-MV3-0078D7?logo=microsoftedge&logoColor=white)
![i18n](https://img.shields.io/badge/i18n-zh%20%2F%20zh%E2%80%91TW%20%2F%20en-green)

<p>
  <img src="docs/demo.gif" width="480" alt="使用示範" />
</p>

<p>
  <img src="docs/screenshot.png" width="480" alt="顯示原文彈層" />
</p>

</div>

## 簡介

面向 [DeepSeek 網頁版](https://chat.deepseek.com)（Chrome / Edge）。官方聊天頁不便直接選取複製時，本擴充功能在回覆旁提供「原文」檢視，便於挑選並複製部分文字；也可依需求匯出整段會話。

## 使用

在 DeepSeek 的回覆底部：

1. 點擊「顯示原文」圖示，檢視 Markdown 原文
2. 點擊「匯出會話」圖示，匯出目前會話為 Markdown

「複製」寫入剪貼簿；成功時在頂列顯示「已複製」。有深度思考時可切換「原文 / 思考」，並可選「包含深度思考」。匯出會話支援複製或下載 `.md`。

若提示讀不到原文 / 會話：請確認對話已顯示完整，或重新整理頁面後再試。

## 安裝

### 從 Release 下載（建議）

1. 開啟 [Releases](https://github.com/zhengqingquan/deepseek-text-picker/releases)，下載 `deepseek-text-picker-x.y.z.zip`
2. 解壓到任意目錄
3. 開啟 Chrome / Edge，進入 `chrome://extensions`（或 `edge://extensions`）
4. 開啟「開發人員模式」→「載入未封裝項目」→ 選擇解壓後的目錄（內含 `manifest.json`）
5. 開啟或重新整理 DeepSeek 聊天頁

### 從原始碼目錄

1. 開啟 Chrome / Edge 擴充功能管理頁，開啟開發人員模式
2. 「載入未封裝項目」，選擇本儲存庫的 `extension` 目錄
3. 開啟或重新整理 DeepSeek 聊天頁

修改程式碼後：在擴充功能頁點「重新載入」，再重新整理聊天頁即可。本機打包可用：

```powershell
.\scripts\pack-extension.ps1
```

產物在 `dist/deepseek-text-picker-<version>.zip`。

## 原理

點擊時從頁面**本機記憶體**讀取聊天 store（zustand `D.L` → `getMessage` / `sessionStore`），正文處理對齊官方「複製」；必要時再嘗試從 React fiber 讀取。**不攔截網路請求**。

## 目錄

```
docs/
  demo.gif        # README 使用示範（動圖）
  screenshot.png  # README 截圖：顯示原文彈層
extension/
  _locales/       # chrome.i18n：zh_CN（預設）/ zh_TW / zh_HK / en
  manifest.json
  inject.js       # MAIN world：讀取頁面本機 store
  content.js      # Isolated world：按鈕 UI、彈層、與 inject 通訊
  content.css
  popup.html      # 工具列彈層
  popup.css
  popup.js
  icons/          # 擴充功能圖示
scripts/
  pack-extension.ps1  # 打成 Release 用 zip
```
