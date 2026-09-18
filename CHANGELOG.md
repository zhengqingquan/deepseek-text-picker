# DeepSeek Text Picker 更新记录

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 变更

- 导出会话改为复用官方分享选对话 UI（`enterSelection`）；由导出入口进入时，确认按钮改为「导出所选」并打开 Markdown 预览，不创建公开链接
- 移除自建勾选框 / 底栏 / 藏输入框实现

### 新增

- 导出弹层可勾选「包含深度思考」（默认不导出）

## [0.2.0] - 2026-09-17

### 新增

- 扩展图标（16 / 48 / 128），在扩展管理页可见
- Release 提供可下载的扩展 `.zip` 包（`scripts/pack-extension.ps1` 打包）

### 变更

- 弹层正文改用与 DeepSeek 回复一致的字体栈（`--dsw-font-family` / Inter）

### 修复

- 打开原文弹层时不再先闪「加载中…」
- 在弹层内拖选文本、在遮罩上松手时不再误关弹层

## [0.1.0] - 2026-09-15

### 新增

- Chrome / Edge MV3 扩展：在 DeepSeek 聊天回答旁显示「原文」图标
- 从页面本地 zustand store 读取与官方「复制」一致的 Markdown（含可选深度思考）
- 弹层展示原文；有深度思考时可切换「原文 / 思考」
- 一键复制到剪贴板；成功时在顶栏显示「已复制」（约 3 秒）
