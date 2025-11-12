# Terminal Panel - 真实终端集成

## 功能特性

✅ **真实终端执行**：基于 node-pty 和 xterm.js，支持真实的命令执行
✅ **多终端标签页**：支持同时打开多个终端会话
✅ **多 Shell 支持**：PowerShell、CMD、Bash、Git Bash
✅ **完整 ANSI 颜色**：支持所有终端颜色和样式
✅ **智能调整大小**：自动适配窗口大小
✅ **快捷操作**：新建终端、清除输出、关闭终端

## 技术栈

- **xterm.js** - 终端 UI 渲染
- **xterm-addon-fit** - 自适应大小
- **xterm-addon-web-links** - 链接识别
- **node-pty** - 真实 Shell 进程执行

## 架构设计

```
TerminalPanel (React 组件)
    ↓
TerminalSession (核心类)
    ├── xterm.js (UI 层)
    └── node-pty (执行层)
        └── PowerShell/CMD/Bash 进程
```

## 使用方式

### 1. 打开终端面板
在底部面板中选择"终端"标签

### 2. 新建终端
点击工具栏的"+"按钮

### 3. 切换 Shell
在下拉菜单中选择不同的 Shell 类型

### 4. 清除终端
点击工具栏的"×"按钮（清除按钮）

### 5. 关闭终端
点击标签页上的关闭按钮

## 快捷键（规划中）

- `Ctrl+Shift+\`` - 打开/关闭终端
- `Ctrl+Shift+5` - 分屏终端
- `Ctrl+C` - 终止当前命令
- `Ctrl+L` - 清除终端

## 注意事项

1. **Windows 用户**：推荐使用 PowerShell
2. **Git Bash 用户**：需要正确安装 Git for Windows
3. **路径问题**：终端默认启动在用户主目录

## 测试命令

```bash
# PowerShell
Get-ChildItem
Get-Host

# CMD
dir
ver

# Bash
ls -la
echo $SHELL
```

## 已知问题

- electron-rebuild 可能失败（通常不影响使用）
- 某些 Shell 路径可能需要手动配置

## 未来功能

- [ ] 分屏终端
- [ ] 搜索功能
- [ ] 历史记录持久化
- [ ] 自定义主题
- [ ] 快捷键支持


