# 终端面板组件

VSCode 风格的底部面板系统，包含常用片段、时间线和终端三个功能模块。

## 功能特性

### 1. Panel 容器组件
-  可调整高度（拖拽上边缘调整）
-  多标签页切换（常用片段、时间线、终端）
-  支持关闭按钮
-  VSCode 主题配色自适应

### 2. 常用片段（Snippets）
-  代码片段展示和管理
-  搜索功能
-  复制和插入操作
-  按语言分类显示
-  网格布局展示

### 3. 时间线（Timeline）
-  文件历史记录展示
-  Git 提交、保存、编辑记录
-  按时间分组（今天、昨天、更早）
-  过滤功能（全部、Git、保存、编辑）
-  显示变更统计

### 4. 终端（Terminal）
-  集成终端界面
-  多 Shell 支持（PowerShell、CMD、Bash、Git Bash）
-  命令历史记录（上下箭头导航）
-  模拟命令执行
-  清除和新建终端功能

## 快捷键

- `Ctrl + \`（反引号）` - 切换面板显示/隐藏

## 使用方式

面板默认显示在编辑器下方，可以通过以下方式操作：

1. **调整高度**：鼠标悬停在面板顶部边缘，拖拽调整高度
2. **切换视图**：点击顶部标签切换不同功能
3. **显示/隐藏**：
   - 点击右上角关闭按钮
   - 使用快捷键 `Ctrl + \``

## 集成说明

面板已集成到 `MainLayout` 组件中，位于编辑器下方。布局结构如下：

```
MainLayout
├── TitleBar（标题栏）
├── MainContent（主内容区）
│   ├── ActivityBar（活动栏）
│   ├── Sidebar（侧边栏）
│   └── EditorAndPanel（编辑器和面板容器）
│       ├── EditorArea（编辑器区域）
│       └── Panel（底部面板）✨ 新增
└── StatusBar（状态栏）
```

## 主题配色

面板完全继承 VSCode 主题配色，使用的 CSS 变量包括：

- `--ws-panel-background` - 面板背景色
- `--ws-panel-border` - 面板边框色
- `--ws-panel-title-active-foreground` - 激活标签文字色
- `--ws-panel-title-inactive-foreground` - 非激活标签文字色
- `--ws-panel-title-active-border` - 激活标签下划线颜色
- `--ws-terminal-*` - 终端相关颜色
- 等等...

## 待开发功能

### 常用片段
- [ ] 添加/编辑片段对话框
- [ ] 片段持久化存储
- [ ] 实际插入到 Monaco 编辑器

### 时间线
- [ ] 集成真实的文件历史记录
- [ ] Git 提交记录集成
- [ ] 点击查看历史版本

### 终端
- [ ] 集成 node-pty 实现真实终端
- [ ] IPC 通信执行命令
- [ ] 多终端会话管理
- [ ] 终端分屏功能

## 文件结构

```
Panel/
├── Panel.tsx              # 主容器组件
├── Panel.scss             # 主容器样式
├── SnippetsPanel.tsx      # 常用片段组件
├── SnippetsPanel.scss     # 常用片段样式
├── TimelinePanel.tsx      # 时间线组件
├── TimelinePanel.scss     # 时间线样式
├── TerminalPanel.tsx      # 终端组件
├── TerminalPanel.scss     # 终端样式
├── index.ts               # 导出文件
└── README.md              # 说明文档
```

## 开发注意事项

1. 严格遵循 VSCode 主题配色规范
2. 不使用硬编码颜色
3. 不使用 CSS 动画
4. 组件高度模块化
5. 使用语义化的 CSS 变量命名


