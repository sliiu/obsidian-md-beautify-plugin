# MD Beautify for Obsidian

**MD Beautify** 是一款为 Obsidian 打造的优雅 Markdown 排版插件。它是 [MD Beautify](https://github.com/sliiu/md-beautify) 的 Obsidian 集成版本。它可以帮助你将笔记完美地转化为适用于微信公众号等平台的富文本格式。

[English](README.md) | [简体中文](README_zh.md)

---

### ✨ 核心功能

- **🚀 一键排版**：使用专业的主题模板，将 Markdown 瞬间变得美观。
- **📱 微信适配**：专门针对微信公众号的 CSS 限制进行了优化（如自动转换伪元素）。
- **🎨 多款主题**：内置多种专业主题，涵盖学术、极简、赛博朋克等风格。
- **👁️ 实时预览**：支持同步滚动和主题模式切换（浅色/深色），预览效果所见即所得。
- **📦 导出功能**：支持导出为 HTML 或 PDF，方便分享和存档。
- **📊 Mermaid 图表**：完整支持 Mermaid 流程图、时序图等，自动适配主题配色。
- **☁️ 图片上传**：批量上传本地图片到云端，支持多种图床服务（七牛、阿里、腾讯、S3 等）。
- **⚙️ 深度定制**：支持自定义 CSS 编辑器，对引用、标题、颜色等细节进行个性化微调。

### 📸 插件截图

![MD Beautify for Obsidian](https://github.com/sliiu/md-beautify/blob/vue/.github/assets/obsidian/screenshot.jpg)

### 🖼️ 效果预览

| 浅色模式                                                                                     | 深色模式                                                                                    |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| ![浅色模式](https://github.com/sliiu/md-beautify/blob/vue/.github/assets/obsidian/light.jpg) | ![深色模式](https://github.com/sliiu/md-beautify/blob/vue/.github/assets/obsidian/dark.jpg) |

### 🚀 使用方法

1. **打开**：在 Obsidian 中打开任意 Markdown 文件。
2. **启动**：点击侧边栏的 "MD Beautify" 图标，或使用命令面板 (`Ctrl/Cmd + P` -> `MD Beautify`)。
3. **调整**：在面板中选择主题并调整样式。
4. **预览**：使用实时预览面板查看渲染效果，支持同步滚动。
5. **操作**：
   - **复制**：点击“一键复制”直接粘贴到微信公众号后台。
   - **导出**：导出为独立的 HTML 或 PDF 文件。
   - **上传**：批量上传本地图片到云端图床。

### 🛠️ 高级功能

#### 主题与界面

- 自定义 CSS 编辑器，支持实时预览。
- 浅色/深色模式切换，支持跟随系统自动切换。
- 固定宽度预览模式（模拟移动设备显示效果）。

#### 图片管理

- 粘贴/拖拽时自动上传图片。
- 支持多种云存储服务（官方图床、七牛云、阿里云、腾讯云、S3 兼容）。
- 批量上传当前文件中的所有本地图片。

#### 导出与分享

- **HTML 导出**：生成带样式的独立文件。
- **PDF 导出**：支持矢量格式（可选中文字）和图片格式。
- **Mermaid 支持**：自动渲染流程图，适配主题配色。

### 📥 安装方式

#### 手动安装

1. 从 [Latest Release](https://github.com/sliiu/obsidian-md-beautify-plugin/releases) 下载 `main.js`、`manifest.json`、`styles.css`。
2. 在仓库中创建 `.obsidian/plugins/md-beautify/` 目录（若不存在）。
3. 将三个文件复制到该目录。
4. 打开 **设置 → 社区插件**，必要时重新加载插件，然后启用 **MD Beautify**。

#### 使用 BRAT 安装

若已安装 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 插件，添加 beta 仓库 `sliiu/obsidian-md-beautify-plugin`，然后在 BRAT 插件列表中安装并启用 **MD Beautify**。

#### 从社区插件市场安装

1. 打开 **设置 → 社区插件**，如已开启 **安全模式** 请先关闭。
2. 点击 **浏览**，搜索 **MD Beautify**，然后点击 **安装** 并 **启用**。

### 剪贴板访问说明

Obsidian 会显示 **Clipboard Access（剪贴板访问）** 提示，因为本插件使用了 Clipboard API。

- **仅写入、由用户触发。** 仅在你执行 **复制美化内容**（或相关复制操作）时写入剪贴板，不会读取剪贴板已有内容。
- **数据范围。** 复制内容由你当前选中的 Markdown 笔记生成，包含 `text/html` 与 `text/plain` 两种格式。
- **可选粘贴处理。** 开启 **自动上传图片** 后，粘贴/拖放处理器会检查剪贴板*事件数据*中的图片或 Mermaid 块以上传或规范化，并非读取系统剪贴板中的任意内容。

Release 资源（`main.js`、`manifest.json`、`styles.css`）由 GitHub Actions 构建，并附带 [artifact attestations](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-to-establish-provenance-for-builds)，便于验证构建来源。

---

### 💬 支持与反馈

如果你喜欢这个插件，请在 [GitHub](https://github.com/sliiu/obsidian-md-beautify-plugin) 上给它一个 ⭐！

如果你觉得这个插件对你有帮助，想要支持后续的开发，欢迎请作者喝杯咖啡！

### ☕️ 国际赞助

[![Buy Me A Coffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://www.buymeacoffee.com/pax_z)

### 🧧 国内赞助

| 微信支付                                                                                    | 支付宝                                                                                 |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| ![微信支付](https://github.com/sliiu/md-beautify/blob/vue/.github/assets/pay/wechatpay.jpg) | ![支付宝](https://github.com/sliiu/md-beautify/blob/vue/.github/assets/pay/alipay.jpg) |

如果有 Bug 或功能建议，请 [提交 Issue](https://github.com/sliiu/obsidian-md-beautify-plugin/issues)。

---

许可证: [MIT](LICENSE)
