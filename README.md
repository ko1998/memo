# 桌面备忘录

一个桌面悬浮备忘录：**一个窗口**里既显示未完成内容，也能按需展开编辑。数据存本机，完全离线，支持 Windows 与 macOS。

## 安装使用（最终用户）

- **Windows**：双击 `dist/MemoSetup-1.0.0.exe` 安装，装完在桌面/开始菜单有「备忘录」图标，点开即用。
- **macOS**：把源码放到 mac 上，装好 Node 后执行 `npm run dist:mac` 生成 `.dmg`（mac 安装包只能在 mac 上编译）。

> 安装包未做代码签名，Windows 首次运行若弹出 SmartScreen 提示，点「更多信息 → 仍要运行」即可。

## 开发者运行

```bash
npm install
npm start
```

## 一个悬浮窗

默认只显示「未完成」的内容（置顶），点右上角 `＋` 展开编辑面板：

| 操作 | 方式 |
| --- | --- |
| 标记完成 | 点条目左侧圆圈 |
| 展开 / 收起编辑 | 点顶部 `＋`（展开后变 `✕`） |
| 添加 | 编辑面板下方输入框回车，或点「添加」 |
| 编辑文字 | 编辑模式下双击某条，回车保存、Esc 取消 |
| 删除 | 编辑模式下鼠标悬停条目，右侧出现「删除」 |
| 查看已完成 | 编辑面板右下角「显示已完成」 |
| 拖动位置 | 按住顶部标题栏拖动 |
| 调整大小 | 拖拽窗口右下角（或窗口边缘） |
| 置顶开关 | 顶部 `📌`（默认开启） |
| 对角移动 | 顶部 `🎈`，碰到屏幕边缘反弹，再点一次停止 |
| 隐藏到托盘 | 顶部 `—`；托盘/菜单栏图标可再显示 / 退出 |

## 数据存储

所有内容存本机，纯 JSON，可随时备份或迁移：

- **Windows**：`C:\Users\<用户名>\AppData\Roaming\memo\memos.json`
- **macOS**：`~/Library/Application Support/memo/memos.json`

程序完全不联网，离线可用。

## 打包

```bash
npm run dist:win   # Windows 安装包 → dist/MemoSetup-1.0.0.exe
npm run dist:mac   # macOS 安装包（需在 mac 上执行）
```

> 国内网络打包时建议走镜像（避免 GitHub 下载超时）：
> `ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ npm run dist:win`
