/**
 * 全局模态窗口使用示例
 */

import { modal } from './modalStore';

// 示例1: 确认对话框
export const deleteItemExample = (itemId: string) => {
  modal.confirm({
    title: '删除项目',
    description: '确定要删除这个项目吗？此操作无法撤销。',
    confirmText: '删除',
    cancelText: '取消',
    onConfirm: async () => {
      // 执行删除操作
      console.log('删除项目:', itemId);
      await deleteItem(itemId);
    },
    onCancel: () => {
      console.log('取消删除');
    },
  });
};

// 示例2: 信息提示
export const showInfoExample = () => {
  modal.info({
    title: '操作成功',
    description: '您的更改已保存。',
    confirmText: '好的',
  });
};

// 示例3: 警告提示
export const showWarningExample = () => {
  modal.warning({
    title: '注意',
    description: '此操作可能会影响其他用户，请谨慎操作。',
    confirmText: '我知道了',
    cancelText: '取消',
    onConfirm: () => {
      // 继续操作
    },
  });
};

// 示例4: 错误提示
export const showErrorExample = () => {
  modal.error({
    title: '操作失败',
    description: '网络连接失败，请检查您的网络设置。',
    confirmText: '重试',
    cancelText: '取消',
    onConfirm: async () => {
      // 重试操作
      await retryOperation();
    },
  });
};

// 示例5: 异步确认
export const asyncConfirmExample = async () => {
  modal.confirm({
    title: '保存更改',
    description: '是否保存对文件的更改？',
    confirmText: '保存',
    cancelText: '不保存',
    onConfirm: async () => {
      try {
        await saveChanges();
        console.log('保存成功');
      } catch (error) {
        console.error('保存失败:', error);
        // 可以再次显示错误提示
        modal.error({
          title: '保存失败',
          description: String(error),
          confirmText: '确定',
        });
      }
    },
  });
};

// 模拟的异步函数
async function deleteItem(id: string): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 1000));
}

async function retryOperation(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 1000));
}

async function saveChanges(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 1000));
}










