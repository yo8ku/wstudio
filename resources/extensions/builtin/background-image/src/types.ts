/**
 * 背景图片插件类型定义
 * 定义了背景图片配置和相关接口
 */

/**
 * 背景图片配置接口
 */
export interface BackgroundImageConfig {
  /** 背景图片路径（可以是本地路径或URL） */
  imagePath: string;
  /** 透明度 (0-1) */
  opacity: number;
  /** 模糊度 (0-20px) */
  blur: number;
  /** 缩放模式 */
  fit: 'cover' | 'contain' | 'fill' | 'none';
  /** 是否启用 */
  enabled: boolean;
}

/**
 * 背景图片样式接口
 */
export interface BackgroundImageStyle {
  backgroundImage: string;
  backgroundSize: string;
  backgroundPosition: string;
  backgroundRepeat: string;
  opacity: string;
  filter: string;
}

/**
 * 默认配置
 */
export const DEFAULT_CONFIG: BackgroundImageConfig = {
  imagePath: '',
  opacity: 0.3,
  blur: 0,
  fit: 'cover',
  enabled: false
};

