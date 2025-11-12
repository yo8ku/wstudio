/**
 * 工具函数集
 * 功能：提供常用工具函数，如 cn（用于合并类名）
 */

import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
