/**
 * AlertDialog 组件
 * 功能：自定义确认对话框，替代 Radix UI 的 alert-dialog
 * 描述：支持标题、描述、确认/取消按钮，点击遮罩层不关闭
 */

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './AlertDialog.scss';

export interface AlertDialogProps {
  /** 是否打开 */
  open: boolean;
  /** 打开状态变化回调 */
  onOpenChange: (open: boolean) => void;
  /** 子元素 */
  children: React.ReactNode;
}

export interface AlertDialogContentProps {
  /** 子元素 */
  children: React.ReactNode;
  /** 自定义类名 */
  className?: string;
  /** 点击事件 */
  onClick?: (e: React.MouseEvent) => void;
}

export interface AlertDialogHeaderProps {
  /** 子元素 */
  children: React.ReactNode;
  /** 自定义类名 */
  className?: string;
}

export interface AlertDialogFooterProps {
  /** 子元素 */
  children: React.ReactNode;
  /** 自定义类名 */
  className?: string;
}

export interface AlertDialogTitleProps {
  /** 子元素 */
  children: React.ReactNode;
  /** 自定义类名 */
  className?: string;
}

export interface AlertDialogDescriptionProps {
  /** 子元素 */
  children: React.ReactNode;
  /** 自定义类名 */
  className?: string;
}

export interface AlertDialogActionProps {
  /** 子元素 */
  children: React.ReactNode;
  /** 点击回调 */
  onClick?: (e: React.MouseEvent) => void;
  /** 自定义类名 */
  className?: string;
}

export interface AlertDialogCancelProps {
  /** 子元素 */
  children: React.ReactNode;
  /** 点击回调 */
  onClick?: (e: React.MouseEvent) => void;
  /** 自定义类名 */
  className?: string;
}

// Context 用于传递 onOpenChange
const AlertDialogContext = React.createContext<{
  onOpenChange: (open: boolean) => void;
} | null>(null);

/**
 * AlertDialog 根组件
 */
export const AlertDialog: React.FC<AlertDialogProps> = ({
  open,
  onOpenChange,
  children,
}) => {
  // ESC 键关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onOpenChange(false);
      }
    };

    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <AlertDialogContext.Provider value={{ onOpenChange }}>
      {children}
    </AlertDialogContext.Provider>
  );
};

/**
 * AlertDialog 内容区域
 */
export const AlertDialogContent: React.FC<AlertDialogContentProps> = ({
  children,
  className = '',
  onClick,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);

  // 阻止点击内容区域时关闭
  const handleContentClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.(e);
  };

  return createPortal(
    <div className="alert-dialog-overlay">
      <div
        ref={contentRef}
        className={`alert-dialog-content ${className}`}
        onClick={handleContentClick}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};

/**
 * AlertDialog 头部
 */
export const AlertDialogHeader: React.FC<AlertDialogHeaderProps> = ({
  children,
  className = '',
}) => (
  <div className={`alert-dialog-header ${className}`}>
    {children}
  </div>
);

/**
 * AlertDialog 底部
 */
export const AlertDialogFooter: React.FC<AlertDialogFooterProps> = ({
  children,
  className = '',
}) => (
  <div className={`alert-dialog-footer ${className}`}>
    {children}
  </div>
);

/**
 * AlertDialog 标题
 */
export const AlertDialogTitle: React.FC<AlertDialogTitleProps> = ({
  children,
  className = '',
}) => (
  <h2 className={`alert-dialog-title ${className}`}>
    {children}
  </h2>
);

/**
 * AlertDialog 描述
 */
export const AlertDialogDescription: React.FC<AlertDialogDescriptionProps> = ({
  children,
  className = '',
}) => (
  <p className={`alert-dialog-description ${className}`}>
    {children}
  </p>
);

/**
 * AlertDialog 确认按钮
 */
export const AlertDialogAction: React.FC<AlertDialogActionProps> = ({
  children,
  onClick,
  className = '',
}) => {
  const context = React.useContext(AlertDialogContext);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.(e);
    context?.onOpenChange(false);
  };

  return (
    <span
      className={`alert-dialog-action ${className}`}
      onClick={handleClick}
    >
      {children}
    </span>
  );
};

/**
 * AlertDialog 取消按钮
 */
export const AlertDialogCancel: React.FC<AlertDialogCancelProps> = ({
  children,
  onClick,
  className = '',
}) => {
  const context = React.useContext(AlertDialogContext);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick?.(e);
    context?.onOpenChange(false);
  };

  return (
    <span
      className={`alert-dialog-cancel ${className}`}
      onClick={handleClick}
    >
      {children}
    </span>
  );
};
