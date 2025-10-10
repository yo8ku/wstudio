/**
 * 扩展市场组件
 */

import React, { useState, useEffect } from 'react';
import { SearchBar } from './SearchBar';
import { MarketplaceExtensionCard } from './MarketplaceExtensionCard';
import { IExtensionInfo } from '../../types/electron';
import './ExtensionMarketplace.css';

export const ExtensionMarketplace: React.FC = () => {
  const [searchResults, setSearchResults] = useState<IExtensionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installingExtensions, setInstallingExtensions] = useState<Set<string>>(new Set());
  const [hasSearched, setHasSearched] = useState(false);

  // 监听扩展安装事件
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    const handleInstalled = (data: { extensionId: string; extension: any }) => {
      console.log('扩展安装成功:', data.extensionId);
      setInstallingExtensions(prev => {
        const newSet = new Set(prev);
        newSet.delete(data.extensionId);
        return newSet;
      });
    };

    api.extension.onExtensionInstalled(handleInstalled);
  }, []);

  // ⭐ 从 VSCode Marketplace 搜索
  const handleSearch = async (query: string) => {
    const api = window.electronAPI;
    if (!api) {
      setError('Electron API 不可用');
      return;
    }

    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      console.log('搜索扩展:', query);
      const response = await api.marketplace.search(query, 20);
      
      if (response.success && response.data) {
        setSearchResults(response.data);
        console.log('搜索结果:', response.data.length, '个扩展');
      } else {
        setError(response.error || '搜索失败');
        setSearchResults([]);
      }
    } catch (err) {
      console.error('搜索扩展失败:', err);
      setError(err instanceof Error ? err.message : '搜索失败');
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  // ⭐ 安装 VSCode 扩展
  const handleInstall = async (extensionId: string, version?: string) => {
    const api = window.electronAPI;
    if (!api) {
      alert('Electron API 不可用');
      return;
    }

    // 标记为正在安装
    setInstallingExtensions(prev => new Set(prev).add(extensionId));

    try {
      console.log('安装扩展:', extensionId, version || '最新版本');
      const result = await api.marketplace.install(extensionId, version);
      
      if (result.success) {
        console.log('安装成功:', result.extensionId);
        alert(`扩展 ${result.extensionId} 安装成功！`);
      } else {
        console.error('安装失败:', result.error);
        alert(`安装失败: ${result.error}`);
        // 移除安装中标记
        setInstallingExtensions(prev => {
          const newSet = new Set(prev);
          newSet.delete(extensionId);
          return newSet;
        });
      }
    } catch (err) {
      console.error('安装扩展失败:', err);
      alert(`安装失败: ${err instanceof Error ? err.message : '未知错误'}`);
      // 移除安装中标记
      setInstallingExtensions(prev => {
        const newSet = new Set(prev);
        newSet.delete(extensionId);
        return newSet;
      });
    }
  };

  return (
    <div className="extension-marketplace">
      <div className="marketplace-header">
        <h2>扩展市场</h2>
        <p className="marketplace-description">
          从 VSCode 官方市场搜索和安装扩展
        </p>
      </div>

      <SearchBar onSearch={handleSearch} loading={loading} />

      {error && (
        <div className="error-message">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" />
            <path d="M10 6v4M10 14h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="loading-container">
          <div className="spinner-large"></div>
          <p>搜索中...</p>
        </div>
      )}

      {!loading && hasSearched && searchResults.length === 0 && !error && (
        <div className="empty-state">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <circle cx="32" cy="32" r="30" stroke="currentColor" strokeWidth="2" />
            <path d="M24 28h16M24 36h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <p>未找到相关扩展</p>
          <p className="empty-hint">请尝试其他搜索关键词</p>
        </div>
      )}

      {!loading && !hasSearched && (
        <div className="empty-state">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <path 
              d="M28 44a16 16 0 1 0 0-32 16 16 0 0 0 0 32zM52 52l-8.7-8.7" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            />
          </svg>
          <p>搜索 VSCode 扩展</p>
          <p className="empty-hint">输入关键词开始搜索</p>
        </div>
      )}

      {!loading && searchResults.length > 0 && (
        <div className="marketplace-results">
          <div className="results-header">
            <p>找到 {searchResults.length} 个扩展</p>
          </div>
          <div className="extensions-grid">
            {searchResults.map((extension) => (
              <MarketplaceExtensionCard
                key={extension.extensionId}
                extension={extension}
                onInstall={handleInstall}
                installing={installingExtensions.has(extension.extensionId)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};



