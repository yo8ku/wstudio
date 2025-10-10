/**
 * 工具函数库
 * 功能：提供常用工具函数，如 cn（用于合并 Tailwind CSS 类名）
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}




