# 全局模态窗口系统

基于 Zustand 的全局模态窗口管理系统。

## 特性

- ✅ 全局状态管理，任何地方都可调用
- ✅ 支持多种类型：info, warning, error, confirm
- ✅ 异步操作支持
- ✅ 简洁的 API
- ✅ TypeScript 类型安全
- ✅ 自动适配主题

## 快速开始

### 基本使用

```typescript
import { modal } from '@/stores/modalStore';

// 确认对话框
modal.confirm({
  title: '删除项目',
  description: '确定要删除这个项目吗？',
  confirmText: '删除',
  cancelText: '取消',
  onConfirm: () => {
    console.log('用户确认删除');
  },
  onCancel: () => {
    console.log('用户取消删除');
  },
});
```

### 异步操作

```typescript
modal.confirm({
  title: '保存文件',
  description: '是否保存更改？',
  onConfirm: async () => {
    try {
      await saveFile();
      console.log('保存成功');
    } catch (error) {
      console.error('保存失败:', error);
    }
  },
});
```

### 不同类型的对话框

```typescript
// 信息提示
modal.info({
  title: '提示',
  description: '操作已完成。',
  confirmText: '确定',
});

// 警告提示
modal.warning({
  title: '警告',
  description: '此操作可能有风险。',
  confirmText: '继续',
  cancelText: '取消',
});

// 错误提示
modal.error({
  title: '错误',
  description: '操作失败，请重试。',
  confirmText: '重试',
  cancelText: '取消',
});
```

## API 参考

### modal.confirm(config)

显示确认对话框。

```typescript
interface ModalConfig {
  title: string;              // 标题（必填）
  description?: string;       // 描述文本
  confirmText?: string;       // 确认按钮文本，默认 "确定"
  cancelText?: string;        // 取消按钮文本，默认 "取消"
  onConfirm?: () => void | Promise<void>;  // 确认回调
  onCancel?: () => void;      // 取消回调
}
```

### modal.info(config)

显示信息提示对话框。

### modal.warning(config)

显示警告提示对话框。

### modal.error(config)

显示错误提示对话框。

## 高级用法

### 使用 Store Hooks

如果需要在组件中访问模态窗口状态：

```typescript
import { useModalStore } from '@/stores/modalStore';

function MyComponent() {
  const { isOpen, config, openModal, closeModal } = useModalStore();
  
  // 手动打开对话框
  const handleOpen = () => {
    openModal({
      title: '自定义对话框',
      description: '这是一个自定义的对话框',
      onConfirm: () => {
        console.log('确认');
      },
    });
  };
  
  return <button onClick={handleOpen}>打开对话框</button>;
}
```

### 在组件外使用

```typescript
// 在任何地方调用，无需 React 上下文
import { modal } from '@/stores/modalStore';

export function deleteUser(userId: string) {
  modal.confirm({
    title: '删除用户',
    description: `确定要删除用户 ${userId} 吗？`,
    onConfirm: async () => {
      await api.deleteUser(userId);
    },
  });
}
```

## 集成说明

全局模态窗口已经在 `MainLayout` 组件中集成：

```tsx
// packages/renderer/src/components/Layout/MainLayout.tsx
import { GlobalModal } from '../GlobalModal';

export const MainLayout = () => {
  return (
    <IconThemeProvider>
      {/* ...其他组件 */}
      
      {/* 全局模态窗口 */}
      <GlobalModal />
    </IconThemeProvider>
  );
};
```

## 样式自定义

对话框样式通过 `alert-dialog.scss` 定义，使用 VSCode 主题变量：

```scss
.alert-dialog-content {
  background: var(--ws-editor-background, #1e1e1e);
  color: var(--ws-foreground, #cccccc);
  border: 1px solid var(--ws-widget-border, #3c3c3c);
  // ...
}
```

## 注意事项

1. 对话框一次只能显示一个
2. `onConfirm` 回调支持异步操作
3. 对话框会自动在操作完成后关闭
4. 按 ESC 键可关闭对话框（等同于取消）
5. 点击遮罩层可关闭对话框（等同于取消）
