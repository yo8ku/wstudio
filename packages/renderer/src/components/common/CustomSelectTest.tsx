/**
 * CustomSelect 组件测试页面
 * 功能：测试 CustomSelect 组件的渲染和功能
 */

import React, { useState } from 'react';
import { CustomSelect, ItemDataType } from './CustomSelect';

export const CustomSelectTest: React.FC = () => {
  const [selectedValue, setSelectedValue] = useState('gemini:gemini-2.5-pro-preview-05-06');

  // 将测试数据转换为新的 items 格式
  const testItems: ItemDataType[] = [
    { 
      value: 'gemini:gemini-2.5-pro-preview-05-06', 
      label: 'gemini-2.5-pro-preview-05-06',
      configName: 'gemini'
    },
    { 
      value: 'gemini:gemini-2.0-flash-exp', 
      label: 'gemini-2.0-flash-exp',
      configName: 'gemini'
    },
    { 
      value: 'gemini:gemini-exp-1206', 
      label: 'gemini-exp-1206',
      configName: 'gemini'
    },
    { 
      value: 'openai:gpt-4', 
      label: 'gpt-4',
      configName: 'openai'
    },
    { 
      value: 'openai:gpt-3.5-turbo', 
      label: 'gpt-3.5-turbo',
      configName: 'openai'
    },
  ];

  return (
    <div style={{ padding: '50px', backgroundColor: 'var(--app-bg)' }}>
      <h2 style={{ color: 'var(--app-fg)', marginBottom: '20px' }}>
        CustomSelect 测试页面 (基于 Radix UI)
      </h2>
      
      <div style={{ marginBottom: '20px' }}>
        <p style={{ color: 'var(--app-fg)', marginBottom: '10px' }}>
          当前选中值: {selectedValue}
        </p>
        
        <div style={{ width: '300px' }}>
          <CustomSelect
            value={selectedValue}
            onChange={(value) => {
              console.log('[测试页面] 选中值变化:', value);
              setSelectedValue(value);
            }}
            items={testItems}
            placeholder="选择模型"
            renderLabel={(label, item) => (
              <span>
                {item.configName && (
                  <>
                    <span style={{ 
                      color: 'var(--list-deemphasizedForeground)', 
                      fontSize: '0.9em' 
                    }}>
                      {item.configName}
                    </span>
                    <span style={{ margin: '0 8px', opacity: 0.5 }}>|</span>
                  </>
                )}
                <span>{label}</span>
              </span>
            )}
            renderValue={(value, item) => item.label}
          />
        </div>
      </div>

      <div style={{ 
        marginTop: '30px', 
        padding: '20px', 
        backgroundColor: 'var(--editor-bg)', 
        borderRadius: '4px',
        border: '1px solid var(--panel-border)'
      }}>
        <h3 style={{ color: 'var(--app-fg)', marginBottom: '10px' }}>
          期望效果：
        </h3>
        <ul style={{ color: 'var(--app-fg)', lineHeight: '1.8' }}>
          <li>下拉列表中每个选项应显示为 "配置名 | 模型名" 格式</li>
          <li>配置名应该是灰色小字</li>
          <li>中间有竖线分隔符</li>
          <li>模型名是正常大小的主题颜色文字</li>
          <li>选中后，输入框只显示模型名</li>
          <li>使用 Radix UI 实现</li>
        </ul>
      </div>
    </div>
  );
};
