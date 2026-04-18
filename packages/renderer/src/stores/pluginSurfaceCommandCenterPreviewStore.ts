export interface PluginSurfaceCommandCenterPreviewSnapshot {
  readonly visible: boolean;
  readonly previews: Readonly<Record<string, string>>;
}

type PluginSurfaceCommandCenterPreviewListener = (
  snapshot: PluginSurfaceCommandCenterPreviewSnapshot,
) => void;

const listeners = new Set<PluginSurfaceCommandCenterPreviewListener>();

let snapshot: PluginSurfaceCommandCenterPreviewSnapshot = {
  visible: false,
  previews: {},
};

export function getPluginSurfaceCommandCenterPreviewSnapshot(): PluginSurfaceCommandCenterPreviewSnapshot {
  return snapshot;
}

export function subscribeToPluginSurfaceCommandCenterPreview(
  listener: PluginSurfaceCommandCenterPreviewListener,
): () => void {
  listeners.add(listener);

  return (): void => {
    listeners.delete(listener);
  };
}

export function setPluginSurfaceCommandCenterPreviewSnapshot(
  nextSnapshot: PluginSurfaceCommandCenterPreviewSnapshot,
): void {
  snapshot = nextSnapshot;

  for (const listener of listeners) {
    listener(snapshot);
  }
}
