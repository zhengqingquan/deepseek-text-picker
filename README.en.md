<!-- markdownlint-disable -->

[简体中文](README.md) | [繁體中文](README.zh-TW.md) | **English**

<div align="center">

<img src="extension/icons/icon128.png" width="120" alt="DeepSeek Text Picker">

# DeepSeek Text Picker

Copy parts of a DeepSeek **web** reply with ease: view Markdown matching official Copy beside the answer, or export the full chat

[Issues](https://github.com/zhengqingquan/deepseek-text-picker/issues) · [Releases](https://github.com/zhengqingquan/deepseek-text-picker/releases) · [Changelog](CHANGELOG.md)

[![Version](https://img.shields.io/github/v/release/zhengqingquan/deepseek-text-picker)](https://github.com/zhengqingquan/deepseek-text-picker/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Stars](https://img.shields.io/github/stars/zhengqingquan/deepseek-text-picker?color=ffcb47&labelColor=black)<br>
![Chrome](https://img.shields.io/badge/Chrome-MV3-4285F4?logo=googlechrome&logoColor=white)
![Edge](https://img.shields.io/badge/Edge-MV3-0078D7?logo=microsoftedge&logoColor=white)
![i18n](https://img.shields.io/badge/i18n-zh%20%2F%20zh%E2%80%91TW%20%2F%20en-green)

<p>
  <img src="docs/demo.gif" width="480" alt="Usage demo" />
</p>

<p>
  <img src="docs/screenshot.png" width="480" alt="Show source dialog" />
</p>

</div>

## Overview

For the [DeepSeek web app](https://chat.deepseek.com) (Chrome / Edge). When the official chat page makes partial selection awkward, this extension opens a **Show source** view beside the reply so you can pick and copy what you need; you can also export the full chat.

## Usage

At the bottom of a DeepSeek reply:

1. Click **Show source** to view the Markdown source
2. Click **Export chat** to export the conversation as Markdown

**Copy** writes to the clipboard; on success the top bar shows **Copied**. When deep thinking is available, switch between **Source / Thinking**, and optionally **Include thinking**. Export supports copy or download as `.md`.

If source / chat cannot be read: make sure the reply is fully loaded, or refresh and try again.

## Install

### From a Release (recommended)

1. Open [Releases](https://github.com/zhengqingquan/deepseek-text-picker/releases) and download `deepseek-text-picker-x.y.z.zip`
2. Extract it anywhere
3. Open Chrome / Edge and go to `chrome://extensions` (or `edge://extensions`)
4. Enable **Developer mode** → **Load unpacked** → select the extracted folder (it must contain `manifest.json`)
5. Open or refresh the DeepSeek chat page

### From the source tree

1. Open the Chrome / Edge extensions page and enable Developer mode
2. **Load unpacked** and select this repo’s `extension` directory
3. Open or refresh the DeepSeek chat page

After code changes: click **Reload** on the extensions page, then refresh the chat page. To pack locally:

```powershell
.\scripts\pack-extension.ps1
```

Output: `dist/deepseek-text-picker-<version>.zip`.

## How it works

On click, the extension reads the chat store from **in-page memory** (zustand `D.L` → `getMessage` / `sessionStore`), aligning body handling with official Copy; if needed it falls back to React fiber. **It does not intercept network requests.**

## Layout

```
docs/
  demo.gif        # README usage demo (GIF)
  screenshot.png  # README screenshot: Show source dialog
extension/
  _locales/       # chrome.i18n: zh_CN (default) / zh_TW / zh_HK / en
  manifest.json
  inject.js       # MAIN world: read in-page store
  content.js      # Isolated world: buttons, dialogs, talk to inject
  content.css
  popup.html      # toolbar popup
  popup.css
  popup.js
  icons/          # extension icons
scripts/
  pack-extension.ps1  # pack Release zip
```
