/**
 * 模态对话框组件
 * 使用 shadcn alert-dialog 组件
 */

import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../ui/alert-dialog';

export interface ModelToastProps {
  trigger?: React.ReactNode;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const ModelToast: React.FC<ModelToastProps> = ({
  trigger,
  title,
  description,
  confirmText = '确定',
  cancelText = '取消',
  onConfirm,
  onCancel,
  open,
  onOpenChange,
}) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent 
        onClick={(e: React.MouseEvent) => {
          // 阻止点击事件冒泡到外部
          e.stopPropagation();
          console.log('[ModelToast] 模态窗口被点击');
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel 
            onClick={(e) => {
              e.stopPropagation();
              console.log('[ModelToast] 取消按钮被点击');
              onCancel?.();
            }}
          >
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction 
            onClick={(e) => {
              e.stopPropagation();
              console.log('[ModelToast] 确认按钮被点击');
              onConfirm?.();
            }}
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
