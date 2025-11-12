/**
 * 模型能力列表组件
 * 功能：显示模型支持的能力列表
 * 描述：展示多个能力徽章，支持限制显示数量
 */

import React from 'react';
import { ModelCapability } from '../../../types/modelCapabilities';
import { ModelCapabilityBadge } from '../ModelCapabilityBadge/ModelCapabilityBadge';
import './ModelCapabilityList.scss';

interface ModelCapabilityListProps {
  capabilities: ModelCapability[];
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
  maxVisible?: number;
}

export const ModelCapabilityList: React.FC<ModelCapabilityListProps> = ({
  capabilities,
  size = 'medium',
  showLabel = true,
  maxVisible
}) => {
  if (!capabilities || capabilities.length === 0) {
    return null;
  }

  // 过滤掉 STREAMING，因为它是默认支持的
  const filteredCapabilities = capabilities.filter(cap => cap !== ModelCapability.STREAMING);

  if (filteredCapabilities.length === 0) {
    return null;
  }

  const visibleCapabilities = maxVisible 
    ? filteredCapabilities.slice(0, maxVisible)
    : filteredCapabilities;
  const remainingCount = filteredCapabilities.length - visibleCapabilities.length;

  return (
    <div className="model-capability-list">
      {visibleCapabilities.map((capability) => (
        <ModelCapabilityBadge
          key={capability}
          capability={capability}
          size={size}
          showLabel={showLabel}
        />
      ))}
      {remainingCount > 0 && (
        <span className="model-capability-list__more" title={`还有 ${remainingCount} 个能力`}>
          +{remainingCount}
        </span>
      )}
    </div>
  );
};

