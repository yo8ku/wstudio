# 设置系统使用指南

## 概述

本应用实现了一套完整的 VS Code 风格的设置系统，支持 UI 界面和 JSON 两种编辑模式，提供了丰富的配置选项和持久化存储功能。

## 功能特性

### 1. 双模式编辑

#### UI 模式
-  **图形化配置界面**：直观的设置项，易于理解和操作
-  **搜索功能**：快速查找特定设置
- 📂 **分类组织**：按功能模块分组显示
-  **实时保存**：修改后自动保存
- 🔄 **重置选项**：单个设置可快速恢复默认值

#### JSON 模式
- 📄 **Monaco 编辑器**：完整的代码编辑体验
- 💡 **语法高亮**：JSON 语法着色
- 🔧 **手动保存**：批量修改后统一保存
- 📋 **导入导出**：方便配置迁移

### 2. 配置分类

#### 编辑器设置
- `editor.fontSize` - 字体大小（8-100px）
- `editor.fontFamily` - 字体系列
- `editor.lineHeight` - 行高（1-3）
- `editor.tabSize` - 制表符大小（1-8个空格）
- `editor.insertSpaces` - Tab键插入空格
- `editor.wordWrap` - 换行模式（off/on/wordWrapColumn/bounded）
- `editor.minimap.enabled` - 显示小地图
- `editor.lineNumbers` - 行号显示（on/off/relative）
- `editor.renderWhitespace` - 空白字符显示（none/boundary/selection/all）
- `editor.cursorBlinking` - 光标动画（blink/smooth/phase/expand/solid）
- `editor.cursorStyle` - 光标样式（line/block/underline等）

#### 文件设置
- `files.autoSave` - 自动保存模式（off/afterDelay/onFocusChange/onWindowChange）
- `files.autoSaveDelay` - 自动保存延迟（100-10000ms）
- `files.encoding` - 文件编码（默认 utf8）
- `files.eol` - 换行符（\n/\r\n/auto）

#### 工作区设置
- `workbench.colorTheme` - 颜色主题
- `workbench.iconTheme` - 图标主题
- `workbench.sideBar.location` - 侧边栏位置（left/right）
- `workbench.activityBar.visible` - 活动栏可见性
- `workbench.statusBar.visible` - 状态栏可见性

#### 窗口设置
- `window.zoomLevel` - 缩放级别（-5到5）
- `window.title` - 窗口标题模板
- `window.menuBarVisibility` - 菜单栏可见性

#### 终端设置
- `terminal.integrated.fontSize` - 终端字体大小
- `terminal.integrated.fontFamily` - 终端字体系列
- `terminal.integrated.shell.*` - 各平台默认Shell

#### 搜索设置
- `search.useIgnoreFiles` - 使用 .gitignore 过滤
- `search.followSymlinks` - 跟随符号链接

### 3. 打开设置的方式

#### 快捷键
- `Ctrl + ,` - 打开设置

#### 菜单
- 文件 → 首选项 → 设置

#### 代码调用
```typescript
// 触发打开设置事件
window.dispatchEvent(new CustomEvent('open-settings'));
```

## 技术架构

### 主进程（Main Process）

#### SettingsManager
位置：`packages/main/src/config/SettingsManager.ts`

**核心功能**：
- 管理 `settings.json` 文件的读写
- 支持用户级和工作区级配置
- 提供默认值和重置功能
- 发送配置变更事件

**API 方法**：
```typescript
// 初始化
await settingsManager.initialize();

// 获取所有设置
const settings = settingsManager.getAllWithDefaults();

// 获取单个设置
const fontSize = settingsManager.get('editor.fontSize');

// 更新设置
await settingsManager.update('editor.fontSize', 16, 'user');

// 批量更新
await settingsManager.updateMany({
  'editor.fontSize': 16,
  'editor.tabSize': 2
}, 'user');

// 重置设置
await settingsManager.reset('editor.fontSize'); // 重置单个
await settingsManager.reset(); // 重置所有
```

### IPC 通信

**主进程处理器**（`electron.js`）：
- `settings:get-all` - 获取所有设置
- `settings:get` - 获取单个设置值
- `settings:update` - 更新单个设置
- `settings:update-many` - 批量更新设置
- `settings:reset` - 重置设置
- `settings:get-path` - 获取配置文件路径
- `settings:import` - 导入设置
- `settings:export` - 导出设置
- `settings:get-defaults` - 获取默认设置

**事件广播**：
- `settings:changed` - 设置变更通知（发送到所有渲染进程）

### 渲染进程（Renderer Process）

#### SettingsEditor 组件
位置：`packages/renderer/src/components/Editor/SettingsEditor.tsx`

**功能**：
- UI/JSON 双模式切换
- 设置搜索和过滤
- 实时更新和保存
- 显示修改标记

#### useSettings Hook
位置：`packages/renderer/src/hooks/useSettings.ts`

**用法**：
```typescript
const {
  settings,        // 所有设置
  loading,         // 加载状态
  error,           // 错误信息
  getSetting,      // 获取单个设置
  updateSetting,   // 更新设置
  updateMany,      // 批量更新
  resetSetting,    // 重置设置
  reload           // 重新加载
} = useSettings();

// 获取设置
const fontSize = getSetting('editor.fontSize', 14);

// 更新设置
await updateSetting('editor.fontSize', 16);

// 批量更新
await updateMany({
  'editor.fontSize': 16,
  'editor.tabSize': 2
});
```

#### SettingsModal 组件
位置：`packages/renderer/src/components/Settings/SettingsModal.tsx`

**功能**：
- 模态框形式显示设置
- 支持 ESC 键关闭
- 点击遮罩层关闭

### 配置文件位置

#### 用户设置
```
Windows: %APPDATA%\note-studio\User\settings.json
macOS: ~/Library/Application Support/note-studio/User/settings.json
Linux: ~/.config/note-studio/User/settings.json
```

#### 工作区设置
```
<workspace>/.vscode/settings.json
```

## 使用示例

### 1. 在组件中使用设置

```typescript
import { useSettings } from '../../hooks/useSettings';

function MyComponent() {
  const { getSetting, updateSetting } = useSettings();
  
  // 获取设置
  const fontSize = getSetting('editor.fontSize', 14);
  
  // 更新设置
  const handleFontSizeChange = async (newSize: number) => {
    await updateSetting('editor.fontSize', newSize);
  };
  
  return (
    <div>
      <input 
        type="number" 
        value={fontSize} 
        onChange={(e) => handleFontSizeChange(parseInt(e.target.value))}
      />
    </div>
  );
}
```

### 2. 监听设置变化

```typescript
useEffect(() => {
  const unsubscribe = window.electron?.ipcRenderer?.on('settings:changed', (event, data) => {
    console.log('设置已更新:', data);
    // 处理设置变化
  });
  
  return () => {
    if (unsubscribe) {
      unsubscribe();
    }
  };
}, []);
```

### 3. 导入/导出设置

```typescript
// 导出设置
const result = await window.electronAPI?.settings?.export();
if (result?.success) {
  const json = result.data;
  // 保存或分享 JSON
}

// 导入设置
const json = '{ "editor.fontSize": 16 }';
await window.electronAPI?.settings?.import(json);
```

## 扩展配置项

要添加新的配置项，需要：

### 1. 更新 SettingsSchema

在 `packages/main/src/config/SettingsManager.ts` 中：

```typescript
export interface SettingsSchema {
  // 现有配置...
  
  // 新增配置
  'myFeature.enabled': boolean;
  'myFeature.timeout': number;
}

// 添加默认值
const DEFAULT_SETTINGS: SettingsSchema = {
  // 现有默认值...
  
  // 新增默认值
  'myFeature.enabled': true,
  'myFeature.timeout': 5000,
};
```

### 2. 添加UI定义

在 `SettingsEditor.tsx` 的 `settingDefinitions` 中添加：

```typescript
{
  key: 'myFeature.enabled',
  title: 'Enable My Feature',
  description: '启用我的功能',
  type: 'boolean',
  category: '我的功能',
  default: true,
}
```

## 最佳实践

1. **使用 TypeScript 类型**：利用 `SettingsSchema` 接口获得类型提示
2. **提供默认值**：在 `getSetting()` 时始终提供默认值
3. **避免频繁更新**：批量修改时使用 `updateMany()`
4. **错误处理**：始终检查 API 调用的返回值
5. **监听变化**：在需要响应设置变化的组件中监听 `settings:changed` 事件

## 故障排除

### 设置未保存
- 检查是否有写入权限
- 查看控制台错误日志
- 确认 `settings.json` 文件格式正确

### 设置不生效
- 重启应用
- 清除缓存：删除 `settings.json` 后重启
- 检查是否被工作区设置覆盖

### JSON 编辑错误
- 确保 JSON 格式正确（使用编辑器的语法检查）
- 使用"保存 JSON"按钮而不是关闭模态框
- 查看错误提示信息

## 相关文件

- `packages/main/src/config/SettingsManager.ts` - 设置管理器
- `packages/renderer/src/components/Editor/SettingsEditor.tsx` - 设置编辑器
- `packages/renderer/src/components/Settings/SettingsModal.tsx` - 设置模态框
- `packages/renderer/src/hooks/useSettings.ts` - 设置 Hook
- `packages/renderer/src/types/electron.d.ts` - TypeScript 类型定义
- `electron.js` - IPC 处理器
