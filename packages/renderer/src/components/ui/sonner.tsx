/**
 * Toast 通知组件
 * 基于 sonner 库的 shadcn/ui 封装
 */
import { Toaster as Sonner } from "sonner"
import "./sonner.scss"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  // 使用 dark 主题，因为应用使用的是深色主题
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      className="toaster group"
      style={{ 
        zIndex: 99999,
        '--toast-close-button-start': 'unset',
        '--toast-close-button-end': '0',
        '--toast-close-button-transform': 'translate(35%, -35%)',
      } as React.CSSProperties}
      toastOptions={{
        style: {
          background: 'var(--ws-notifications-background)',
          color: 'var(--ws-notifications-foreground)',
          border: '1px solid var(--ws-notifications-border)',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
          maxWidth: '400px',
          wordBreak: 'break-word',
          whiteSpace: 'normal',
          padding: '12px 16px',
        },
        classNames: {
          toast:
            "group toast group-[.toaster]:flex group-[.toaster]:items-start group-[.toaster]:gap-2",
          description: "group-[.toast]:text-[var(--ws-description-foreground)]",
          actionButton:
            "group-[.toast]:bg-[var(--ws-button-background)] group-[.toast]:text-[var(--ws-button-foreground)]",
          cancelButton:
            "group-[.toast]:bg-[var(--ws-button-secondary-background)] group-[.toast]:text-[var(--ws-button-secondary-foreground)]",
          error: "group-[.toaster]:!bg-[var(--ws-input-validation-error-background)] group-[.toaster]:!border-[var(--ws-input-validation-error-border)]",
          success: "group-[.toaster]:!border-[var(--ws-notification-link-foreground)]",
          warning: "group-[.toaster]:!bg-[var(--ws-input-validation-warning-background)] group-[.toaster]:!border-[var(--ws-input-validation-warning-border)]",
          info: "group-[.toaster]:!border-[var(--ws-notifications-border)]",
          closeButton: "group-[.toast]:right-2 group-[.toast]:left-auto group-[.toast]:top-1/2 group-[.toast]:-translate-y-1/2 group-[.toast]:translate-x-0",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }

