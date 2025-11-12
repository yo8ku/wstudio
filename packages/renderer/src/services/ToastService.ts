/**
 * Toast 通知服务
 * 使用 sonner 库提供统一的消息提示
 */

import { toast } from 'sonner';

export type ToastType = 'success' | 'error' | 'info' | 'warning' | 'loading';

interface ToastOptions {
  description?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

class ToastService {
  /**
   * 显示成功消息
   */
  success(message: string, options?: ToastOptions) {
    return toast.success(message, {
      description: options?.description,
      duration: options?.duration || 3000,
      action: options?.action
    });
  }

  /**
   * 显示错误消息
   */
  error(message: string, options?: ToastOptions) {
    return toast.error(message, {
      description: options?.description,
      duration: options?.duration || 4000,
      action: options?.action
    });
  }

  /**
   * 显示信息消息
   */
  info(message: string, options?: ToastOptions) {
    return toast.info(message, {
      description: options?.description,
      duration: options?.duration || 3000,
      action: options?.action
    });
  }

  /**
   * 显示警告消息
   */
  warning(message: string, options?: ToastOptions) {
    return toast.warning(message, {
      description: options?.description,
      duration: options?.duration || 3000,
      action: options?.action
    });
  }

  /**
   * 显示加载中消息
   */
  loading(message: string, options?: Omit<ToastOptions, 'duration'>) {
    return toast.loading(message, {
      description: options?.description,
      action: options?.action
    });
  }

  /**
   * 关闭指定的 toast
   */
  dismiss(toastId?: string | number) {
    toast.dismiss(toastId);
  }

  /**
   * Promise toast - 根据 Promise 状态自动显示不同消息
   */
  promise<T>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: any) => string);
    }
  ) {
    return toast.promise(promise, messages);
  }
}

export const toastService = new ToastService();

