/**
 * Input 组件
 * 基于 shadcn/ui 的输入框组件，使主题变量
 */

import * as React from "react"
import { cn } from "../../lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded border border-[var(--ws-input-border)] bg-[var(--ws-input-background)] px-3 py-1 text-sm text-[var(--ws-input-foreground)] shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[var(--ws-foreground)] placeholder:text-[var(--ws-input-placeholder-foreground)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ws-focus-border)] disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }

