/**
 * Background Cover 控制组件
 * 文件功能：提供背景图片和粒子效果的 UI 控制界面
 * 
 * ⚠️ 当前已禁用 - 避免遮挡编辑器
 */

import React from 'react';
import './BackgroundCoverControl.css';

interface BackgroundCoverControlProps {
  /** 是否在状态栏显示 */
  showInStatusBar?: boolean;
}

/**
 * Background Cover 控制组件
 * ⚠️ 当前已禁用 - 返回 null
 */
export const BackgroundCoverControl: React.FC<BackgroundCoverControlProps> = () => {
  // 功能已禁用，直接返回 null
  console.log('[BackgroundCoverControl] 功能已禁用');
  return null;
};
