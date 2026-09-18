# DeepSeek Text Picker

[简体中文](README.md) | [繁體中文](README.zh-TW.md) | [English](README.en.md)

<img src="extension/icons/icon128.png" width="64" alt="DeepSeek Text Picker">

Chrome / Edge 擴充功能（v0.2.0）：在 [chat.deepseek.com](https://chat.deepseek.com) 的回覆旁顯示「原文」圖示，展示與官方「複製」一致的 Markdown；並可匯出目前會話整段對話。

## 使用

![使用示範](docs/demo.gif)

![顯示原文彈層](docs/screenshot.png)

在 DeepSeek 的回覆底部：

1. 點擊「顯示原文」圖示，檢視 Markdown 原文
2. 點擊「匯出會話」圖示，匯出目前會話為 Markdown

「複製」寫入剪貼簿；成功時在頂列顯示「已複製」。有深度思考時可切換「原文 / 思考」，並可選「包含深度思考」。匯出會話支援複製或下載 `.md`。

介面語言跟隨瀏覽器 UI 語言（內建簡體中文 / 繁體中文 / English；其它語言回退到簡體中文）。

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
