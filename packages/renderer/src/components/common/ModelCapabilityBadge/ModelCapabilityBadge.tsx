/**
 * 模型能力徽章组件
 * 功能：显示单个模型能力的徽章
 * 描述：使用图标和文本展示模型支持的能力
 */

import React from 'react';
import { ModelCapability } from '../../../types/modelCapabilities';
import './ModelCapabilityBadge.scss';

interface ModelCapabilityBadgeProps {
  capability: ModelCapability;
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
}

const CAPABILITY_INFO: Record<ModelCapability, { icon: string; label: string; title: string }> = {
  [ModelCapability.WEB_SEARCH]: {
    icon: '🌐',
    label: '联网',
    title: '联网搜索能力'
  },
  [ModelCapability.TOOLS]: {
    icon: '🔧',
    label: '工具',
    title: '工具调用/函数调用'
  },
  [ModelCapability.VISION]: {
    icon: '👁️',
    label: '视觉',
    title: '图像理解能力'
  },
  [ModelCapability.REASONING]: {
    icon: '🧠',
    label: '推理',
    title: '深度推理能力'
  },
  [ModelCapability.CODE_EXECUTION]: {
    icon: '💻',
    label: '代码',
    title: '代码执行能力'
  },
  [ModelCapability.FILE_UPLOAD]: {
    icon: '📁',
    label: '文件',
    title: '文件上传能力'
  },
  [ModelCapability.STREAMING]: {
    icon: '📊',
    label: '流式',
    title: '流式输出'
  }
};

export const ModelCapabilityBadge: React.FC<ModelCapabilityBadgeProps> = ({
  capability,
  size = 'medium',
  showLabel = true
}) => {
  const info = CAPABILITY_INFO[capability];

  if (!info) {
    return null;
  }

  return (
    <span
      className={`model-capability-badge model-capability-badge--${size}`}
      title={info.title}
    >
      <span className="model-capability-badge__icon">{info.icon}</span>
      {showLabel && <span className="model-capability-badge__label">{info.label}</span>}
    </span>
  );
};

