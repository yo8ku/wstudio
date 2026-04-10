import { create } from 'zustand';

export interface PluginRuntimeSuggestInstructionRendererPayload {
  readonly command: string;
  readonly purpose: string;
}

export interface PluginRuntimeSuggestItemRendererPayload {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
}

export interface PluginRuntimeSuggestModalRendererPayload {
  readonly modalId: string;
  readonly title: string;
  readonly placeholder: string;
  readonly query: string;
  readonly emptyStateText: string;
  readonly instructions: readonly PluginRuntimeSuggestInstructionRendererPayload[];
  readonly items: readonly PluginRuntimeSuggestItemRendererPayload[];
}

interface PluginSuggestModalStore {
  readonly isOpen: boolean;
  readonly modalId: string | null;
  readonly title: string;
  readonly placeholder: string;
  readonly query: string;
  readonly emptyStateText: string;
  readonly instructions: readonly PluginRuntimeSuggestInstructionRendererPayload[];
  readonly items: readonly PluginRuntimeSuggestItemRendererPayload[];
  openModal: (payload: PluginRuntimeSuggestModalRendererPayload) => void;
  updateModal: (payload: PluginRuntimeSuggestModalRendererPayload) => void;
  closeModal: () => void;
  closeModalById: (modalId: string) => void;
}

export const usePluginSuggestModalStore = create<PluginSuggestModalStore>((set, get) => ({
  isOpen: false,
  modalId: null,
  title: '',
  placeholder: '',
  query: '',
  emptyStateText: '',
  instructions: [],
  items: [],
  openModal: (payload): void => {
    set({
      isOpen: true,
      modalId: payload.modalId,
      title: payload.title,
      placeholder: payload.placeholder,
      query: payload.query,
      emptyStateText: payload.emptyStateText,
      instructions: payload.instructions,
      items: payload.items,
    });
  },
  updateModal: (payload): void => {
    if (get().modalId !== payload.modalId) {
      return;
    }

    set({
      title: payload.title,
      placeholder: payload.placeholder,
      query: payload.query,
      emptyStateText: payload.emptyStateText,
      instructions: payload.instructions,
      items: payload.items,
    });
  },
  closeModal: (): void => {
    set({
      isOpen: false,
      modalId: null,
      title: '',
      placeholder: '',
      query: '',
      emptyStateText: '',
      instructions: [],
      items: [],
    });
  },
  closeModalById: (modalId): void => {
    if (get().modalId !== modalId) {
      return;
    }

    get().closeModal();
  },
}));
