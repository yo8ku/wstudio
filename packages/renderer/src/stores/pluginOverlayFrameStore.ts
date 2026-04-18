import { create } from 'zustand';

import type { PluginUiRuntimeSurfaceDescriptor } from '@note-studio/shared';

export interface PluginRuntimeOverlayAnchorRectRendererPayload {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

export interface PluginRuntimeOverlayFrameRendererPayloadInput {
  readonly overlayId: string;
  readonly title: string;
  readonly runtimeSurface: PluginUiRuntimeSurfaceDescriptor | null;
  readonly width?: number;
  readonly height?: number;
  readonly closeOnBackdrop?: boolean;
  readonly chrome?: 'dialog' | 'popover';
  readonly interactionMode?: 'default' | 'editorSuggest';
  readonly anchorRect?: PluginRuntimeOverlayAnchorRectRendererPayload | null;
}

export interface PluginRuntimeOverlayFrameRendererPayload {
  readonly overlayId: string;
  readonly title: string;
  readonly runtimeSurface: PluginUiRuntimeSurfaceDescriptor | null;
  readonly width?: number;
  readonly height?: number;
  readonly closeOnBackdrop?: boolean;
  readonly chrome: 'dialog' | 'popover';
  readonly interactionMode: 'default' | 'editorSuggest';
  readonly anchorRect: PluginRuntimeOverlayAnchorRectRendererPayload | null;
}

interface PluginOverlayFrameStore {
  readonly overlays: readonly PluginRuntimeOverlayFrameRendererPayload[];
  openOverlay: (payload: PluginRuntimeOverlayFrameRendererPayloadInput) => void;
  updateOverlay: (payload: PluginRuntimeOverlayFrameRendererPayloadInput) => void;
  closeOverlayById: (overlayId: string) => void;
  closeAllOverlays: () => void;
}

function normalizeOverlayPayload(
  payload: PluginRuntimeOverlayFrameRendererPayloadInput,
): PluginRuntimeOverlayFrameRendererPayload {
  return {
    ...payload,
    chrome: payload.chrome ?? 'dialog',
    interactionMode: payload.interactionMode ?? 'default',
    anchorRect: payload.anchorRect ?? null,
  };
}

function upsertOverlay(
  overlays: readonly PluginRuntimeOverlayFrameRendererPayload[],
  payload: PluginRuntimeOverlayFrameRendererPayloadInput,
): readonly PluginRuntimeOverlayFrameRendererPayload[] {
  const normalizedPayload = normalizeOverlayPayload(payload);
  const existingIndex = overlays.findIndex((overlay) => overlay.overlayId === payload.overlayId);

  if (existingIndex === -1) {
    return [...overlays, normalizedPayload];
  }

  return overlays.map((overlay, index) => index === existingIndex ? normalizedPayload : overlay);
}

export const usePluginOverlayFrameStore = create<PluginOverlayFrameStore>((set) => ({
  overlays: [],
  openOverlay: (payload): void => {
    set((state) => ({
      overlays: upsertOverlay(state.overlays, payload),
    }));
  },
  updateOverlay: (payload): void => {
    set((state) => ({
      overlays: upsertOverlay(state.overlays, payload),
    }));
  },
  closeOverlayById: (overlayId): void => {
    set((state) => ({
      overlays: state.overlays.filter((overlay) => overlay.overlayId !== overlayId),
    }));
  },
  closeAllOverlays: (): void => {
    set({
      overlays: [],
    });
  },
}));
