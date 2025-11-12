/**
 * 设置 Hook
 * 用于React 组件中访问和修改设置
 */

import { useState, useEffect, useCallback } from 'react';

export function useSettings() {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 加载设置
  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const result = await window.electronAPI?.settings?.getAll();
      if (result?.success && result.data) {
        setSettings(result.data);
      } else {
        setError(result?.error || '加载设置失败');
      }
    } catch (err) {
      console.error('[useSettings] 加载设置失败:', err);
      setError(err instanceof Error ? err.message : '加载设置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 获取单个设置
  const getSetting = useCallback(<T = any>(key: string, defaultValue?: T): T => {
    return settings[key] ?? defaultValue;
  }, [settings]);

  // 更新单个设置
  const updateSetting = useCallback(async (
    key: string,
    value: any,
    target: 'user' | 'workspace' = 'user'
  ) => {
    try {
      const result = await window.electronAPI?.settings?.update(key, value, target);
      if (result?.success) {
        setSettings(prev => ({ ...prev, [key]: value }));
        return true;
      } else {
        setError(result?.error || '更新设置失败');
        return false;
      }
    } catch (err) {
      console.error('[useSettings] 更新设置失败:', err);
      setError(err instanceof Error ? err.message : '更新设置失败');
      return false;
    }
  }, []);

  // 批量更新设置
  const updateMany = useCallback(async (
    updates: Record<string, any>,
    target: 'user' | 'workspace' = 'user'
  ) => {
    try {
      const result = await window.electronAPI?.settings?.updateMany(updates, target);
      if (result?.success) {
        setSettings(prev => ({ ...prev, ...updates }));
        return true;
      } else {
        setError(result?.error || '批量更新设置失败');
        return false;
      }
    } catch (err) {
      console.error('[useSettings] 批量更新设置失败:', err);
      setError(err instanceof Error ? err.message : '批量更新设置失败');
      return false;
    }
  }, []);

  // 重置设置
  const resetSetting = useCallback(async (key?: string) => {
    try {
      const result = await window.electronAPI?.settings?.reset(key);
      if (result?.success) {
        await loadSettings(); // 重新加载设置
        return true;
      } else {
        setError(result?.error || '重置设置失败');
        return false;
      }
    } catch (err) {
      console.error('[useSettings] 重置设置失败:', err);
      setError(err instanceof Error ? err.message : '重置设置失败');
      return false;
    }
  }, [loadSettings]);

  // 监听设置变化
  useEffect(() => {
    loadSettings();

    // 监听设置变化事件
    const unsubscribe = window.electron?.ipcRenderer?.on('settings:changed', (event, data) => {
      if (data.key && data.value !== undefined) {
        setSettings(prev => ({ ...prev, [data.key]: data.value }));
      } else if (data.updates) {
        setSettings(prev => ({ ...prev, ...data.updates }));
      }
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [loadSettings]);

  return {
    settings,
    loading,
    error,
    getSetting,
    updateSetting,
    updateMany,
    resetSetting,
    reload: loadSettings,
  };
}
