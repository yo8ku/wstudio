# 快捷键系统使用指南

## 功能概述

Note Studio 提供了完整的快捷键系统，支持文件操作、编辑器控制和应用程序功能。

## 已实现的快捷键

### 文件操作

| 快捷键 | 功能 | 说明 |
|--------|------|------|
| `Ctrl+S` | 保存文件 | 保存当前激活的编辑器文件 |
| `Ctrl+Shift+S` | 另存为 | 将当前文件保存到新位置（待实现） |

### 编辑器控制

| 快捷键 | 功能 | 说明 |
|--------|------|------|
| `F1` | 打开命令面板 | 显示所有可用命令 |
| `Ctrl+Shift+P` | 打开命令面板 | F1 的备用快捷键 |
| `Ctrl+K Ctrl+T` | 配色主题选择 | 打开主题选择命令 |

### 设置和配置

| 快捷键 | 功能 | 说明 |
|--------|------|------|
| `Ctrl+,` | 打开设置 | 打开应用程序设置面板 |

## 快捷键管理器 API

### 导入快捷键管理器

```typescript
import { shortcutManager, ShortcutHandler } from '@/utils/KeyboardShortcutManager';
```

### 注册快捷键

```typescript
// 注册单个快捷键
shortcutManager.register({
  id: 'save-file',
  key: 's',
  ctrl: true,
  description: '保存文件',
  handler: (event) => {
    console.log('保存文件');
    // 执行保存操作
  }
});
```

### 启动和停止监听

```typescript
// 启动监听
shortcutManager.start();

// 停止监听
shortcutManager.stop();

// 销毁管理器
shortcutManager.dispose();
```

### 注销快捷键

```typescript
// 通过 ID 注销快捷键
shortcutManager.unregister('save-file');
```

### 获取所有快捷键

```typescript
const shortcuts = shortcutManager.getShortcuts();
console.log(shortcuts);
```

## 快捷键配置选项

### ShortcutHandler 接口

```typescript
interface ShortcutHandler {
  id: string;           // 快捷键唯一标识
  key: string;          // 按键（如 's', 'p', 'F1'）
  ctrl?: boolean;       // 是否需要按 Ctrl 键
  shift?: boolean;      // 是否需要按 Shift 键
  alt?: boolean;        // 是否需要按 Alt 键
  meta?: boolean;       // 是否需要按 Meta 键（macOS Command）
  handler: (event: KeyboardEvent) => void;  // 处理函数
  description?: string; // 快捷键描述
}
```

## 实现原理

### 1. 编辑器保存流程

```
用户按下 Ctrl+S
    ↓
MonacoEditor 拦截快捷键
    ↓
调用 window.__editorSaveFile()
    ↓
EditorArea.saveFile()
    ↓
通过 IPC 调用 Electron file:save
    ↓
保存成功，清除脏标记（isDirty）
```

### 2. 快捷键注册流程

```
组件挂载
    ↓
注册快捷键到 shortcutManager
    ↓
shortcutManager.start() 开始监听
    ↓
用户按下快捷键
    ↓
shortcutManager 匹配并执行 handler
    ↓
组件卸载时 unregister 和 dispose
```

## 添加自定义快捷键

### 示例：添加 Ctrl+N 新建文件快捷键

```typescript
import { shortcutManager } from '@/utils/KeyboardShortcutManager';

// 在组件中注册
useEffect(() => {
  shortcutManager.register({
    id: 'new-file',
    key: 'n',
    ctrl: true,
    description: '新建文件',
    handler: () => {
      // 执行新建文件操作
      window.dispatchEvent(new CustomEvent('create-new-file'));
    }
  });

  // 启动监听（如果还未启动）
  shortcutManager.start();

  // 清理
  return () => {
    shortcutManager.unregister('new-file');
  };
}, []);
```

## Monaco Editor 快捷键

Monaco Editor 内部使用自己的快捷键系统。在 `MonacoEditor.tsx` 中通过 `editor.addCommand()` 注册：

```typescript
editor.addCommand(
  monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
  () => {
    // 保存文件处理
  }
);
```

### Monaco 修饰键

- `monaco.KeyMod.CtrlCmd` - Ctrl（Windows/Linux）或 Cmd（macOS）
- `monaco.KeyMod.Shift` - Shift 键
- `monaco.KeyMod.Alt` - Alt 键
- `monaco.KeyMod.WinCtrl` - Windows 键

### Monaco 组合键

使用 `monaco.KeyMod.chord()` 创建组合键：

```typescript
monaco.KeyMod.chord(
  monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK,
  monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyT
)
```

## 平台兼容性

快捷键系统自动处理跨平台差异：

- **Windows/Linux**: 使用 `Ctrl` 键
- **macOS**: 使用 `Cmd` 键（通过 `metaKey` 检测）

## 注意事项

1. **避免冲突**: 注册快捷键前检查是否与现有快捷键冲突
2. **清理资源**: 组件卸载时务必注销快捷键
3. **事件优先级**: Monaco 编辑器内的快捷键优先级高于全局快捷键
4. **阻止默认**: 快捷键处理器会自动阻止默认行为和事件冒泡

## 调试

启用快捷键调试日志：

```typescript
// 查看所有已注册的快捷键
console.log(shortcutManager.getShortcuts());

// 快捷键触发时会自动输出日志
// [KeyboardShortcutManager] 触发快捷键: save-file
```

## 未来计划

- [ ] 可配置的快捷键映射
- [ ] 快捷键冲突检测
- [ ] 快捷键面板 UI（显示所有可用快捷键）
- [ ] 用户自定义快捷键
- [ ] 快捷键导入/导出配置











































