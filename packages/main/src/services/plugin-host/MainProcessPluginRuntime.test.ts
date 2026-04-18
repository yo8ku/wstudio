import { beforeAll, describe, expect, it } from 'vitest';
import { ItemView, addIcon, removeIcon } from '@note-studio/plugin';
import type { App, JsonValue, OpenViewState, TFile, View, ViewState, WorkspaceTabs } from '@note-studio/plugin';
import { WorkspaceLeaf } from '@note-studio/plugin';
import { installMainProcessDomShim, serializeHostElementToHtml } from './MainProcessDomShim';
import { MainProcessCommandRegistry, MainProcessUIRegistry } from './MainProcessPluginRuntime';

const TEST_ICON_ID = 'main-process-plugin-runtime-test-icon';
const TEST_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" /></svg>';

class TestItemView extends ItemView {
  public constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  public getViewType(): string {
    return 'test-item-view';
  }

  public getDisplayText(): string {
    return 'Test Item View';
  }
}

class TestWorkspaceLeaf extends WorkspaceLeaf {
  public readonly app: App;
  public readonly containerEl: HTMLElement;
  public readonly id = 'test-leaf';
  public override parent: WorkspaceTabs;
  public hoverPopover = null;
  public readonly isDeferred = false;
  public view: View;

  public constructor(containerEl: HTMLElement) {
    super();
    this.app = Object.create(null) as App;
    this.containerEl = containerEl;
    this.parent = Object.create(null) as WorkspaceTabs;
    this.view = Object.create(null) as View;
  }

  public async openFile(_file: TFile, _openState?: OpenViewState): Promise<void> {
    return undefined;
  }

  public async open(view: View): Promise<View> {
    return view;
  }

  public getViewState(): ViewState {
    return {
      type: 'test-item-view',
      state: {},
    };
  }

  public async setViewState(_viewState: ViewState, _ephemeralState?: JsonValue | null): Promise<void> {
    return undefined;
  }

  public async loadIfDeferred(): Promise<void> {
    return undefined;
  }

  public getEphemeralState(): JsonValue | null {
    return null;
  }

  public setEphemeralState(_state: JsonValue | null): void {
    return undefined;
  }

  public togglePinned(): void {
    return undefined;
  }

  public setPinned(_pinned: boolean): void {
    return undefined;
  }

  public setGroupMember(_other: WorkspaceLeaf): void {
    return undefined;
  }

  public setGroup(_group: string): void {
    return undefined;
  }

  public detach(): void {
    return undefined;
  }

  public getIcon(): string {
    return '';
  }

  public getDisplayText(): string {
    return 'Test Leaf';
  }

  public onResize(): void {
    return undefined;
  }
}

describe('MainProcessUIRegistry', () => {
  beforeAll(() => {
    installMainProcessDomShim();
  });

  it('provides style-capable host documents for plugin views', () => {
    const styleElement = document.createElement('style');
    styleElement.id = 'main-process-plugin-runtime-style-test';
    document.head.append(styleElement);

    try {
      expect(document.documentElement.tagName).toBe('HTML');
      expect(document.getElementById(styleElement.id)).toBe(styleElement);
      expect(document.head.ownerDocument).toBe(document);
    } finally {
      styleElement.remove();
    }
  });

  it('binds item view contentEl to the workspace leaf container', () => {
    const containerEl = document.createElement('div');
    const view = new TestItemView(new TestWorkspaceLeaf(containerEl));

    expect(view.containerEl).toBe(containerEl);
    expect(view.contentEl).toBe(containerEl);
    expect(view.contentEl.ownerDocument).toBe(document);
  });

  it('executes ribbon icon entries with a synthetic click event in the main process', async () => {
    const registry = new MainProcessUIRegistry();
    const eventState: { receivedEvent: MouseEvent | null } = {
      receivedEvent: null,
    };

    registry.addRibbonIcon('plugin.test', {
      icon: 'beaker',
      title: 'Synthetic Click Entry',
      onClick: (event): void => {
        event.preventDefault();
        eventState.receivedEvent = event;
      },
    });

    const entries = registry.getEntries();
    const entryId = entries[0]?.id;

    expect(entryId).toBeDefined();

    await expect(registry.executeEntry(entryId ?? '')).resolves.toBe(true);
    expect(eventState.receivedEvent).not.toBeNull();
    expect(eventState.receivedEvent instanceof MouseEvent).toBe(true);
    expect(eventState.receivedEvent?.type).toBe('click');
    expect(eventState.receivedEvent?.defaultPrevented).toBe(true);
  });

  it('includes svg content for plugin-registered custom icons in entry snapshots', () => {
    const registry = new MainProcessUIRegistry();
    addIcon(TEST_ICON_ID, TEST_ICON_SVG);

    try {
      registry.addRibbonIcon('plugin.test', {
        icon: TEST_ICON_ID,
        title: 'Custom Icon Entry',
        onClick: () => undefined,
      });

      const entries = registry.getEntries();

      expect(entries).toHaveLength(1);
      expect(entries[0]?.icon).toBe(TEST_ICON_ID);
      expect(entries[0]?.iconSvg).toContain('<svg');
      expect(entries[0]?.iconSvg).toContain('viewBox="0 0 10 10"');
    } finally {
      removeIcon(TEST_ICON_ID);
    }
  });

  it('serializes nested svg elements with their original tag names', () => {
    const containerEl = document.createElement('div');
    const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const groupEl = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const rectEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    svgEl.setAttribute('viewBox', '0 0 24 24');
    groupEl.setAttribute('fill', 'none');
    pathEl.setAttribute('d', 'M1 2L3 4');
    rectEl.setAttribute('width', '6');
    rectEl.setAttribute('height', '8');
    groupEl.append(pathEl, rectEl);
    svgEl.append(groupEl);
    containerEl.append(svgEl);
    const html = serializeHostElementToHtml(containerEl);
    expect(html).toContain('<svg');
    expect(html).toContain('<g');
    expect(html).toContain('<path');
    expect(html).toContain('<rect');
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).toContain('d="M1 2L3 4"');
    expect(html).toContain('width="6"');
    expect(html).toContain('height="8"');
  });
  it('keeps iconSvg empty for unregistered host icon ids', () => {
    const registry = new MainProcessUIRegistry();

    registry.addRibbonIcon('plugin.test', {
      icon: 'beaker',
      title: 'Built-in Icon Entry',
      onClick: () => undefined,
    });

    const entries = registry.getEntries();

    expect(entries).toHaveLength(1);
    expect(entries[0]?.icon).toBe('beaker');
    expect(entries[0]?.iconSvg).toBeNull();
  });
});

describe('MainProcessCommandRegistry', () => {
  it('notifies listeners when commands change', () => {
    const registry = new MainProcessCommandRegistry(() => {
      throw new Error('MainProcessAppFacade should not be requested in this test.');
    });
    let notificationCount = 0;
    const unsubscribe = registry.subscribe(() => {
      notificationCount += 1;
    });

    const disposable = registry.registerCommand('plugin.test', {
      id: 'demo-command',
      name: 'Demo Command',
      callback: () => undefined,
    });

    disposable.dispose();
    unsubscribe();

    expect(notificationCount).toBe(2);
  });

  it('exports supervisor command snapshots with plugin metadata', () => {
    const registry = new MainProcessCommandRegistry(() => {
      throw new Error('MainProcessAppFacade should not be requested in this test.');
    });

    registry.registerCommand('plugin.test', {
      id: 'demo-command',
      name: 'Demo Command',
      category: 'Testing',
      icon: 'beaker',
      callback: () => undefined,
    });

    expect(registry.getSupervisorCommandSnapshots()).toEqual([{
      pluginId: 'plugin.test',
      commandId: 'demo-command',
      title: 'Demo Command',
      category: 'Testing',
      icon: 'beaker',
    }]);
  });

  it('prefers supervisor execution only for non-editor commands', () => {
    const registry = new MainProcessCommandRegistry(() => {
      throw new Error('MainProcessAppFacade should not be requested in this test.');
    });

    registry.registerCommand('plugin.test', {
      id: 'simple-command',
      name: 'Simple Command',
      callback: () => undefined,
    });
    registry.registerCommand('plugin.test', {
      id: 'editor-command',
      name: 'Editor Command',
      editorCallback: () => undefined,
    });

    expect(registry.shouldPreferSupervisorExecution('simple-command')).toBe(true);
    expect(registry.shouldPreferSupervisorExecution('editor-command')).toBe(false);
    expect(registry.shouldPreferSupervisorExecution('missing-command')).toBe(false);
  });
});

