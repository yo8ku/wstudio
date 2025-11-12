/**
 * Toast 通知组件
 * 基于 sonner 库的 shadcn/ui 封装
 */
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  // 使用 dark 主题，因为应用使用的是深色主题
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      style={{ right: '1px' } as React.CSSProperties}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-[var(--ws-notifications-background)] group-[.toaster]:text-[var(--ws-notifications-foreground)] group-[.toaster]:border-[var(--ws-notifications-border)] group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-[var(--ws-description-foreground)]",
          actionButton:
            "group-[.toast]:bg-[var(--ws-button-background)] group-[.toast]:text-[var(--ws-button-foreground)]",
          cancelButton:
            "group-[.toast]:bg-[var(--ws-button-secondary-background)] group-[.toast]:text-[var(--ws-button-secondary-foreground)]",
          error: "group-[.toaster]:bg-[var(--ws-input-validation-error-background)] group-[.toaster]:border-[var(--ws-input-validation-error-border)]",
          success: "group-[.toaster]:bg-[var(--ws-notifications-background)] group-[.toaster]:border-[var(--ws-notification-link-foreground)]",
          warning: "group-[.toaster]:bg-[var(--ws-input-validation-warning-background)] group-[.toaster]:border-[var(--ws-input-validation-warning-border)]",
          info: "group-[.toaster]:bg-[var(--ws-notifications-background)] group-[.toaster]:border-[var(--ws-notifications-border)]",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }

