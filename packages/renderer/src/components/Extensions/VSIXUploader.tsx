/**
 * VSIX 上传安装组件
 */

import React, { useRef } from 'react';

export const VSIXUploader: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    console.log('安装 VSIX:', file.name);
    // 调用主进程安装 VSIX
  };

  return (
    <div className="vsix-uploader">
      <input
        ref={fileInputRef}
        type="file"
        accept=".vsix"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />
      <button onClick={() => fileInputRef.current?.click()}>
        从 VSIX 安装
      </button>
    </div>
  );
};



