/**
 * 模态对话框组件
 * 使用自定义 AlertDialog 组件
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
} from '../common/AlertDialog';

export interface ModelToastProps {
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
  title,
  description,
  confirmText = '确定',
  cancelText = '取消',
  onConfirm,
  onCancel,
  open,
  onOpenChange,
}) => {
  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange?.(isOpen);
  };

  return (
    <AlertDialog open={open ?? false} onOpenChange={handleOpenChange}>
      <AlertDialogContent 
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
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
              onCancel?.();
            }}
          >
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction 
            onClick={(e) => {
              e.stopPropagation();
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
