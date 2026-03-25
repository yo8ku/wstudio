/**
 * 笔记编辑器设置状态管理
 * 使用 Zustand 管理编辑器设置的全局状态
 */

import { create } from 'zustand';
import { electronStore } from '../services/ElectronStoreService';

export type EditorType = 'codemirror';

interface NoteEditorSettings {
  defaultEditor: EditorType;
  showEditorSwitch: boolean;
  autoSave: boolean;
  autoSaveInterval: number;
  showLineNumbers: boolean;
}

interface NoteEditorSettingsStore extends NoteEditorSettings {
  isLoading: boolean;
  loadSettings: () => Promise<void>;
  setDefaultEditor: (editor: EditorType) => Promise<void>;
  setShowEditorSwitch: (show: boolean) => Promise<void>;
  setAutoSave: (enabled: boolean) => Promise<void>;
  setAutoSaveInterval: (interval: number) => Promise<void>;
  setShowLineNumbers: (show: boolean) => Promise<void>;
  saveSettings: () => Promise<void>;
}

const DEFAULT_SETTINGS: NoteEditorSettings = {
  defaultEditor: 'codemirror',
  showEditorSwitch: false,
  autoSave: true,
  autoSaveInterval: 3000,
  showLineNumbers: true,
};

export const useNoteEditorSettingsStore = create<NoteEditorSettingsStore>((set, get) => ({
  ...DEFAULT_SETTINGS,
  isLoading: false,

  loadSettings: async () => {
    if (get().isLoading) {
      return;
    }

    set({ isLoading: true });
    try {
      const settings = await electronStore.get('note-editor-settings');
      if (settings) {
        set({
          defaultEditor: DEFAULT_SETTINGS.defaultEditor,
          showEditorSwitch: DEFAULT_SETTINGS.showEditorSwitch,
          autoSave: settings.autoSave ?? DEFAULT_SETTINGS.autoSave,
          autoSaveInterval: settings.autoSaveInterval || DEFAULT_SETTINGS.autoSaveInterval,
          showLineNumbers: settings.showLineNumbers ?? DEFAULT_SETTINGS.showLineNumbers,
        });
      }
    } catch (error) {
      console.error('[NoteEditorSettings] 加载设置失败:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  setDefaultEditor: async (_editor: EditorType) => {
    void _editor;
    set({ defaultEditor: DEFAULT_SETTINGS.defaultEditor });
    await get().saveSettings();
  },

  setShowEditorSwitch: async (_show: boolean) => {
    void _show;
    set({ showEditorSwitch: DEFAULT_SETTINGS.showEditorSwitch });
    await get().saveSettings();
  },

  setAutoSave: async (enabled: boolean) => {
    set({ autoSave: enabled });
    await get().saveSettings();
  },

  setAutoSaveInterval: async (interval: number) => {
    set({ autoSaveInterval: interval });
    await get().saveSettings();
  },

  setShowLineNumbers: async (show: boolean) => {
    set({ showLineNumbers: show });
    await get().saveSettings();
  },

  saveSettings: async () => {
    const { defaultEditor, showEditorSwitch, autoSave, autoSaveInterval, showLineNumbers } = get();
    try {
      await electronStore.set('note-editor-settings', {
        defaultEditor,
        showEditorSwitch,
        autoSave,
        autoSaveInterval,
        showLineNumbers,
      });
    } catch (error) {
      console.error('[NoteEditorSettings] 保存设置失败:', error);
    }
  },
}));
