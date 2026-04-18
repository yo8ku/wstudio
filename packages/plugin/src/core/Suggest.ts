/**
 * Suggestion modal and popover primitives aligned with plugin-facing completion APIs.
 */

import type { App } from '../types/app';
import type { CloseableComponent } from '../types/closeable';
import type { EditorSuggestContext, EditorSuggestTriggerInfo } from '../types/editor';
import type { EditorPosition, Editor } from '../types/editor';
import { Scope } from '../types/keymap';
import type { JsonObject, JsonValue } from '../types/json';
import type {
  Instruction,
  ISuggestOwner,
} from '../types/suggest';
import type { TFile } from '../types/vault';
import { getPluginHostUiBridge } from '../internal/host-ui-bridge';
import {
  EDITOR_SUGGEST_INTERNAL_HANDLE_KEY,
  EDITOR_SUGGEST_INTERNAL_REFRESH,
  type PluginRuntimeAnchorRect,
} from '../internal/runtime';
import { Modal } from './Modal';

function clearElement(target: HTMLElement): void {
  target.replaceChildren();
}

function appendInstruction(target: HTMLElement, instruction: Instruction): void {
  const rowEl = document.createElement('div');
  rowEl.className = 'ns-plugin-instruction';

  const commandEl = document.createElement('kbd');
  commandEl.className = 'ns-plugin-instruction__command';
  commandEl.textContent = instruction.command;

  const purposeEl = document.createElement('span');
  purposeEl.className = 'ns-plugin-instruction__purpose';
  purposeEl.textContent = instruction.purpose;

  rowEl.append(commandEl, purposeEl);
  target.append(rowEl);
}

function createSyntheticKeyboardEvent(key: string): KeyboardEvent {
  return {
    key,
    preventDefault(): void {
      return undefined;
    },
    stopPropagation(): void {
      return undefined;
    },
  } as KeyboardEvent;
}

export abstract class PopoverSuggest<TValue>
  implements ISuggestOwner<TValue>, CloseableComponent {
  public readonly app: App;
  public readonly scope: Scope;
  protected readonly containerEl: HTMLElement;
  protected readonly suggestionsEl: HTMLElement;
  protected readonly instructionsEl: HTMLElement;
  private opened = false;
  private hostPopoverId: string | null = null;
  private closingViaHostBridge = false;
  private hostPopoverAnchorRect: PluginRuntimeAnchorRect | null = null;
  private instructions: readonly Instruction[] = [];
  private suggestions: readonly TValue[] = [];
  private selectedIndex = -1;

  protected constructor(app: App, scope?: Scope) {
    this.app = app;
    this.scope = scope ?? new Scope(app.scope);

    this.containerEl = document.createElement('div');
    this.containerEl.className = 'ns-plugin-popover-suggest';
    this.containerEl.hidden = true;

    this.instructionsEl = document.createElement('div');
    this.instructionsEl.className = 'ns-plugin-popover-suggest__instructions';

    this.suggestionsEl = document.createElement('div');
    this.suggestionsEl.className = 'ns-plugin-popover-suggest__results';

    this.containerEl.append(this.instructionsEl, this.suggestionsEl);
  }

  public open(): void {
    const hostUiBridge = getPluginHostUiBridge();

    if (hostUiBridge === null) {
      throw new Error('Popover rich UI now requires the plugin host UI bridge and a runtime surface.');
    }

    if (this.opened) {
      this.syncHostPopover(hostUiBridge);
      return;
    }

    this.opened = true;
    this.containerEl.hidden = false;
    this.hostPopoverId = hostUiBridge.openPopover({
      title: 'Plugin suggestions',
      contentElement: this.containerEl,
      surfaceId: this.resolveHostRuntimeSurfaceId(),
      runtimeState: this.resolveHostRuntimeState(),
      onRuntimeAction: (action) => {
        this.handleHostRuntimeAction(action);
      },
      width: 420,
      height: 320,
      anchorRect: this.hostPopoverAnchorRect,
      interactionMode: this.resolveHostPopoverInteractionMode(),
      onClose: () => {
        this.handleHostPopoverClosed();
      },
    });
  }

  public close(): void {
    const hostUiBridge = getPluginHostUiBridge();

    if (hostUiBridge !== null && this.hostPopoverId !== null) {
      if (!this.opened) {
        return;
      }

      const popoverId = this.hostPopoverId;
      this.opened = false;
      this.containerEl.hidden = true;
      this.hostPopoverId = null;
      this.hostPopoverAnchorRect = null;
      this.closingViaHostBridge = true;
      hostUiBridge.closePopover(popoverId);
      return;
    }

    if (!this.opened) {
      return;
    }

    this.opened = false;
    this.containerEl.hidden = true;
    this.hostPopoverAnchorRect = null;
    this.selectedIndex = -1;
  }

  protected setHostPopoverAnchorRect(anchorRect: PluginRuntimeAnchorRect | null): void {
    this.hostPopoverAnchorRect = anchorRect;
  }

  protected setInstructions(instructions: readonly Instruction[]): void {
    this.instructions = instructions;
    clearElement(this.instructionsEl);

    for (const instruction of instructions) {
      appendInstruction(this.instructionsEl, instruction);
    }

    this.notifyHostPopoverUpdated();
  }

  protected setSuggestions(values: readonly TValue[]): void {
    this.suggestions = values;
    this.selectedIndex = values.length === 0
      ? -1
      : this.selectedIndex >= 0 && this.selectedIndex < values.length
        ? this.selectedIndex
        : 0;
    clearElement(this.suggestionsEl);

    values.forEach((value, index) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'ns-plugin-popover-suggest__item';
      rowEl.setAttribute('role', 'button');
      rowEl.setAttribute('aria-selected', index === this.selectedIndex ? 'true' : 'false');
      rowEl.tabIndex = 0;
      rowEl.dataset.selected = index === this.selectedIndex ? 'true' : 'false';
      this.renderSuggestion(value, rowEl);

      rowEl.addEventListener('click', (event) => {
        this.selectedIndex = index;
        this.syncSuggestionSelectionState();
        this.selectSuggestion(value, event);
      });

      rowEl.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
          return;
        }

        event.preventDefault();
        this.selectedIndex = index;
        this.syncSuggestionSelectionState();
        this.selectSuggestion(value, event);
      });

      this.suggestionsEl.append(rowEl);
    });

    this.notifyHostPopoverUpdated();
  }

  protected moveSelection(direction: -1 | 1): boolean {
    if (this.suggestions.length === 0) {
      return false;
    }

    const nextIndex = this.selectedIndex < 0
      ? 0
      : (this.selectedIndex + direction + this.suggestions.length) % this.suggestions.length;
    this.selectedIndex = nextIndex;
    this.syncSuggestionSelectionState();
    this.notifyHostPopoverUpdated();
    return true;
  }

  protected selectActiveSuggestion(evt: KeyboardEvent): boolean {
    const value = this.suggestions[this.selectedIndex] ?? this.suggestions[0];

    if (value === undefined) {
      return false;
    }

    this.selectSuggestion(value, evt);
    return true;
  }

  public abstract renderSuggestion(value: TValue, el: HTMLElement): void;

  public abstract selectSuggestion(value: TValue, evt: MouseEvent | KeyboardEvent): void;

  private handleHostPopoverClosed(): void {
    if (this.closingViaHostBridge) {
      this.closingViaHostBridge = false;
      return;
    }

    if (!this.opened) {
      return;
    }

    this.opened = false;
    this.hostPopoverId = null;
    this.hostPopoverAnchorRect = null;
    this.selectedIndex = -1;
    this.containerEl.hidden = true;
  }

  private syncHostPopover(hostUiBridge: NonNullable<ReturnType<typeof getPluginHostUiBridge>>): void {
    if (this.hostPopoverId === null) {
      return;
    }

    hostUiBridge.updatePopover(this.hostPopoverId, {
      title: 'Plugin suggestions',
      runtimeState: this.resolveHostRuntimeState(),
      width: 420,
      height: 320,
      anchorRect: this.hostPopoverAnchorRect,
      interactionMode: this.resolveHostPopoverInteractionMode(),
    });
  }

  private syncSuggestionSelectionState(): void {
    const suggestionChildren = Array.from(this.suggestionsEl.children);

    suggestionChildren.forEach((child, index) => {
      if (!(child instanceof HTMLElement)) {
        return;
      }

      const selected = index === this.selectedIndex;
      child.dataset.selected = selected ? 'true' : 'false';
      child.setAttribute('aria-selected', selected ? 'true' : 'false');

      if (selected) {
        child.scrollIntoView?.({
          block: 'nearest',
        });
      }
    });
  }

  protected resolveHostPopoverInteractionMode(): 'default' | 'editorSuggest' {
    return 'default';
  }

  protected resolveHostRuntimeState(): JsonValue | null {
    const renderedSuggestions = Array.from(this.suggestionsEl.children).flatMap((child) => {
      if (!(child instanceof HTMLElement)) {
        return [];
      }

      const text = child.textContent?.trim() ?? '';
      return text.length > 0 ? [text] : [];
    });

    return {
      title: 'Plugin suggestions',
      suggestions: renderedSuggestions,
      selectedIndex: this.selectedIndex,
      interactionMode: this.resolveHostPopoverInteractionMode(),
      instructions: this.instructions.map((instruction) => ({
        command: instruction.command,
        purpose: instruction.purpose,
      })),
    };
  }

  private resolveHostRuntimeSurfaceId(): string | null {
    const constructorRef = this.constructor as {
      readonly runtimeSurfaceId?: string;
      readonly name?: string;
    };
    const configuredSurfaceId = constructorRef.runtimeSurfaceId;

    if (typeof configuredSurfaceId === 'string' && configuredSurfaceId.trim().length > 0) {
      return configuredSurfaceId.trim();
    }

    const inferredSurfaceId = constructorRef.name?.trim() ?? '';
    return inferredSurfaceId.length > 0 ? inferredSurfaceId : null;
  }

  private notifyHostPopoverUpdated(): void {
    const hostUiBridge = getPluginHostUiBridge();

    if (hostUiBridge === null || this.hostPopoverId === null || !this.opened) {
      return;
    }

    this.syncHostPopover(hostUiBridge);
  }

  private handleHostRuntimeAction(action: JsonValue | null): void {
    if (action === null || Array.isArray(action) || typeof action !== 'object') {
      return;
    }

    const actionObject = action as JsonObject;
    const actionType = actionObject.type;

    if (actionType === 'close') {
      this.close();
      return;
    }

    if (actionType === 'move-selection') {
      const directionValue = actionObject.direction;

      if (directionValue === 1 || directionValue === -1) {
        this.moveSelection(directionValue);
      }

      return;
    }

    if (actionType === 'select-active') {
      this.selectActiveSuggestion(createSyntheticKeyboardEvent('Enter'));
      return;
    }

    if (actionType !== 'select-index') {
      return;
    }

    const indexValue = actionObject.index;

    if (typeof indexValue !== 'number' || !Number.isInteger(indexValue)) {
      return;
    }

    const targetValue = this.suggestions[indexValue];

    if (targetValue === undefined) {
      return;
    }

    this.selectedIndex = indexValue;
    this.syncSuggestionSelectionState();
    this.selectSuggestion(targetValue, createSyntheticKeyboardEvent('Enter'));
  }
}

export abstract class EditorSuggest<TValue> extends PopoverSuggest<TValue> {
  public context: EditorSuggestContext | null = null;
  public limit = 100;
  private refreshSequence = 0;

  protected constructor(app: App) {
    super(app);
  }

  public setInstructions(instructions: readonly Instruction[]): void {
    super.setInstructions(instructions);
  }

  public abstract onTrigger(
    cursor: EditorPosition,
    editor: Editor,
    file: TFile | null,
  ): EditorSuggestTriggerInfo | null;

  public abstract getSuggestions(
    context: EditorSuggestContext,
  ): readonly TValue[] | Promise<readonly TValue[]>;

  protected override resolveHostPopoverInteractionMode(): 'default' | 'editorSuggest' {
    return 'editorSuggest';
  }

  public override close(): void {
    this.context = null;
    this.refreshSequence += 1;
    this.setHostPopoverAnchorRect(null);
    super.close();
  }

  public async [EDITOR_SUGGEST_INTERNAL_REFRESH](options: {
    readonly context: EditorSuggestContext;
    readonly anchorRect: PluginRuntimeAnchorRect | null;
  }): Promise<boolean> {
    const refreshSequence = ++this.refreshSequence;
    this.context = options.context;
    this.setHostPopoverAnchorRect(options.anchorRect);
    const suggestions = (await this.getSuggestions(options.context)).slice(0, this.limit);

    if (refreshSequence !== this.refreshSequence) {
      return false;
    }

    if (suggestions.length === 0) {
      this.close();
      return false;
    }

    this.setSuggestions(suggestions);
    this.open();
    return true;
  }

  public [EDITOR_SUGGEST_INTERNAL_HANDLE_KEY](key: string): boolean {
    if (key === 'ArrowDown') {
      return this.moveSelection(1);
    }

    if (key === 'ArrowUp') {
      return this.moveSelection(-1);
    }

    if (key === 'Enter') {
      return this.selectActiveSuggestion(createSyntheticKeyboardEvent('Enter'));
    }

    if (key === 'Escape') {
      this.close();
      return true;
    }

    return false;
  }
}

export abstract class AbstractInputSuggest<TValue> extends PopoverSuggest<TValue> {
  public limit = 100;
  private readonly selectCallbacks: Array<
    (value: TValue, evt: MouseEvent | KeyboardEvent) => void
  > = [];

  protected constructor(
    app: App,
    protected readonly textInputEl: HTMLInputElement | HTMLDivElement,
  ) {
    super(app);

    this.textInputEl.addEventListener('input', () => {
      void this.refreshSuggestions();
    });
  }

  public setValue(value: string): void {
    if (this.textInputEl instanceof HTMLInputElement) {
      this.textInputEl.value = value;
      return;
    }

    this.textInputEl.textContent = value;
  }

  public getValue(): string {
    if (this.textInputEl instanceof HTMLInputElement) {
      return this.textInputEl.value;
    }

    return this.textInputEl.textContent ?? '';
  }

  public override selectSuggestion(value: TValue, evt: MouseEvent | KeyboardEvent): void {
    for (const callback of this.selectCallbacks) {
      callback(value, evt);
    }

    this.close();
  }

  public onSelect(callback: (value: TValue, evt: MouseEvent | KeyboardEvent) => void): this {
    this.selectCallbacks.push(callback);
    return this;
  }

  private async refreshSuggestions(): Promise<void> {
    const suggestions = await this.getSuggestions(this.getValue());
    this.setSuggestions(suggestions.slice(0, this.limit));

    if (suggestions.length === 0) {
      this.close();
      return;
    }

    this.open();
  }

  protected abstract getSuggestions(
    query: string,
  ): readonly TValue[] | Promise<readonly TValue[]>;
}
