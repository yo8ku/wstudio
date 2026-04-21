/**
 * Verifies singleton leaf selection rules for supervisor-hosted browser plugin views.
 */

import { describe, expect, it } from 'vitest';
import type { ViewState, WorkspaceLeaf } from '@note-studio/plugin';
import type { MainProcessAppFacade } from './MainProcessAppFacade';
import { resolveWorkspaceLeafForViewStateRequest } from './PluginSupervisorService';
import type {
  PluginSupervisorHostRequestPayload,
} from './pluginSupervisorProtocol';
import { URL_BROWSER_VIEW_TYPE } from '../UrlBrowserDownloadService';

interface TestLeafRecord {
  readonly leaf: WorkspaceLeaf;
}

type WorkspaceLeafSetViewStateRequest = Extract<
  PluginSupervisorHostRequestPayload,
  { readonly kind: 'workspace:leaf-set-view-state' }
>;

function createTestLeaf(id: string, viewType: string): TestLeafRecord {
  let currentViewState: ViewState = {
    type: viewType,
    pinned: false,
    state: {},
  };

  const leaf = {
    id,
    getViewState: (): ViewState => currentViewState,
  } as WorkspaceLeaf;

  return {
    leaf,
  };
}

describe('resolveWorkspaceLeafForViewStateRequest', () => {
  it('reuses the existing browser leaf when opening url-browser-view again', () => {
    const browserLeaf = createTestLeaf('browser-leaf', URL_BROWSER_VIEW_TYPE);
    const editorLeaf = createTestLeaf('editor-leaf', 'markdown');
    const fallbackLeaf = createTestLeaf('new-leaf', 'empty');
    const leaves: WorkspaceLeaf[] = [browserLeaf.leaf, editorLeaf.leaf];
    let getLeafCallCount = 0;

    const workspace = {
      activeLeaf: browserLeaf.leaf,
      getLeafById: (leafId: string): WorkspaceLeaf | null => {
        return leaves.find((leaf) => leaf.id === leafId) ?? null;
      },
      getLeavesOfType: (viewType: string): readonly WorkspaceLeaf[] => {
        return leaves.filter((leaf) => leaf.getViewState().type === viewType);
      },
      getLeaf: (): WorkspaceLeaf => {
        getLeafCallCount += 1;
        return fallbackLeaf.leaf;
      },
      iterateAllLeaves: (callback: (leaf: WorkspaceLeaf) => void): void => {
        leaves.forEach(callback);
      },
      getActiveFile: (): null => null,
      getLastOpenFiles: (): readonly string[] => [],
    } as MainProcessAppFacade['workspace'];

    const hostApp = {
      workspace,
    } as MainProcessAppFacade;

    const resolvedLeaf = resolveWorkspaceLeafForViewStateRequest(hostApp, {
      kind: 'workspace:leaf-set-view-state',
      leafId: null,
      newLeafMode: 'tab',
      viewType: URL_BROWSER_VIEW_TYPE,
      active: true,
      pinned: false,
      state: {
        url: 'https://example.com',
      },
      ephemeralState: null,
      pendingViewInstanceId: null,
    } satisfies WorkspaceLeafSetViewStateRequest, null);

    expect(resolvedLeaf.id).toBe('browser-leaf');
    expect(getLeafCallCount).toBe(0);
    expect(resolvedLeaf).toBe(browserLeaf.leaf);
    expect(fallbackLeaf.leaf).not.toBe(resolvedLeaf);
  });
});
