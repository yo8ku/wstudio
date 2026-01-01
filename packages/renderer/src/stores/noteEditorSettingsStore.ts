/**
 * 笔记编辑器设置状态管理
 * 使用 Zustand 管理编辑器设置的全局状态
 */

import { create } from 'zustand';
import { electronStore } from '../services/ElectronStoreService';

export type EditorType = 'monaco' | 'codemirror';

interface NoteEditorSettings {
  defaultEditor: EditorType;
  showEditorSwitch: boolean;
  autoSave: boolean;
  autoSaveInterval: number;
}

interface NoteEditorSettingsStore extends NoteEditorSettings {
  isLoading: boolean;
  loadSettings: () => Promise<void>;
  setDefaultEditor: (editor: EditorType) => Promise<void>;
  setShowEditorSwitch: (show: boolean) => Promise<void>;
  setAutoSave: (enabled: boolean) => Promise<void>;
  setAutoSaveInterval: (interval: number) => Promise<void>;
  saveSettings: () => Promise<void>;
}

const DEFAULT_SETTINGS: NoteEditorSettings = {
  defaultEditor: 'codemirror',
  showEditorSwitch: true,
  autoSave: true,
  autoSaveInterval: 3000,
};

export const useNoteEditorSettingsStore = create<NoteEditorSettingsStore>((set, get) => ({
  ...DEFAULT_SETTINGS,
  isLoading: false,

  loadSettings: async () => {
    set({ isLoading: true });
    try {
      const settings = await electronStore.get('note-editor-settings');
      if (settings) {
        set({
          defaultEditor: settings.defaultEditor || DEFAULT_SETTINGS.defaultEditor,
          showEditorSwitch: settings.showEditorSwitch ?? DEFAULT_SETTINGS.showEditorSwitch,
          autoSave: settings.autoSave ?? DEFAULT_SETTINGS.autoSave,
          autoSaveInterval: settings.autoSaveInterval || DEFAULT_SETTINGS.autoSaveInterval,
        });
      }
    } catch (error) {
      console.error('[NoteEditorSettings] 加载设置失败:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  setDefaultEditor: async (editor: EditorType) => {
    set({ defaultEditor: editor });
    await get().saveSettings();
  },

  setShowEditorSwitch: async (show: boolean) => {
    set({ showEditorSwitch: show });
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

  saveSettings: async () => {
    const { defaultEditor, showEditorSwitch, autoSave, autoSaveInterval } = get();
    try {
      await electronStore.set('note-editor-settings', {
        defaultEditor,
        showEditorSwitch,
        autoSave,
        autoSaveInterval,
      });
    } catch (error) {
      console.error('[NoteEditorSettings] 保存设置失败:', error);
    }
  },
}));
