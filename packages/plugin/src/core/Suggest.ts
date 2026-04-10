/**
 * Suggestion modal and popover primitives aligned with plugin-facing completion APIs.
 */

import type { App } from '../types/app';
import type { CloseableComponent } from '../types/closeable';
import type { EditorSuggestContext, EditorSuggestTriggerInfo } from '../types/editor';
import type { EditorPosition, Editor } from '../types/editor';
import { Scope } from '../types/keymap';
import type {
  FuzzyMatch,
  Instruction,
  ISuggestOwner,
  SearchMatchPart,
  SearchResult,
} from '../types/suggest';
import type { TFile } from '../types/vault';
import { getPluginHostUiBridge } from '../internal/host-ui-bridge';
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

function renderSearchResult(target: HTMLElement, text: string, result: SearchResult | null): void {
  clearElement(target);

  if (result === null || result.matches.length === 0) {
    target.textContent = text;
    return;
  }

  let offset = 0;

  for (const match of result.matches) {
    const [start, end] = match;

    if (start > offset) {
      target.append(text.slice(offset, start));
    }

    const markEl = document.createElement('mark');
    markEl.textContent = text.slice(start, end);
    target.append(markEl);
    offset = end;
  }

  if (offset < text.length) {
    target.append(text.slice(offset));
  }
}

function buildSimpleSearchResult(query: string, text: string): SearchResult | null {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedText = text.toLowerCase();

  if (normalizedQuery.length === 0) {
    return {
      score: 0,
      matches: [],
    };
  }

  const start = normalizedText.indexOf(normalizedQuery);

  if (start === -1) {
    return null;
  }

  const matches: SearchMatchPart[] = [[start, start + normalizedQuery.length]];

  return {
    score: normalizedQuery.length / (start + 1),
    matches,
  };
}

function extractRenderedTextParts(target: HTMLElement): readonly string[] {
  const parts = Array.from(target.children)
    .map((child) => child.textContent?.trim() ?? '')
    .filter((part) => part.length > 0);

  if (parts.length > 0) {
    return parts;
  }

  const fallbackText = target.textContent?.trim() ?? '';
  return fallbackText.length === 0 ? [] : [fallbackText];
}

function createSyntheticSuggestSelectEvent(): KeyboardEvent {
  return {
    key: 'Enter',
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
    if (this.opened) {
      return;
    }

    this.opened = true;

    if (!this.containerEl.isConnected) {
      document.body.append(this.containerEl);
    }

    this.containerEl.hidden = false;
  }

  public close(): void {
    if (!this.opened) {
      return;
    }

    this.opened = false;
    this.containerEl.hidden = true;
    this.containerEl.remove();
  }

  protected setInstructions(instructions: readonly Instruction[]): void {
    clearElement(this.instructionsEl);

    for (const instruction of instructions) {
      appendInstruction(this.instructionsEl, instruction);
    }
  }

  protected setSuggestions(values: readonly TValue[]): void {
    clearElement(this.suggestionsEl);

    for (const value of values) {
      const rowEl = document.createElement('div');
      rowEl.className = 'ns-plugin-popover-suggest__item';
      rowEl.setAttribute('role', 'button');
      rowEl.tabIndex = 0;
      this.renderSuggestion(value, rowEl);

      rowEl.addEventListener('click', (event) => {
        this.selectSuggestion(value, event);
      });

      rowEl.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
          return;
        }

        event.preventDefault();
        this.selectSuggestion(value, event);
      });

      this.suggestionsEl.append(rowEl);
    }
  }

  public abstract renderSuggestion(value: TValue, el: HTMLElement): void;

  public abstract selectSuggestion(value: TValue, evt: MouseEvent | KeyboardEvent): void;
}

export abstract class SuggestModal<TValue> extends Modal implements ISuggestOwner<TValue> {
  public limit = 100;
  public emptyStateText = 'No suggestions';
  public readonly inputEl: HTMLInputElement;
  public readonly resultContainerEl: HTMLElement;
  private readonly instructionsEl: HTMLElement;
  private instructions: readonly Instruction[] = [];
  private suggestions: readonly TValue[] = [];
  private selectedIndex = -1;
  private hostModalId: string | null = null;
  private closingViaHostBridge = false;

  protected constructor(app: App) {
    super(app);

    this.inputEl = document.createElement('input');
    this.inputEl.className = 'ns-plugin-suggest-modal__input';
    this.inputEl.type = 'text';

    this.instructionsEl = document.createElement('div');
    this.instructionsEl.className = 'ns-plugin-suggest-modal__instructions';

    this.resultContainerEl = document.createElement('div');
    this.resultContainerEl.className = 'ns-plugin-suggest-modal__results';

    this.contentEl.append(this.inputEl, this.instructionsEl, this.resultContainerEl);

    this.inputEl.addEventListener('input', () => {
      void this.refreshSuggestions();
    });

    this.inputEl.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.moveSelection(1);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.moveSelection(-1);
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        this.selectActiveSuggestion(event);
      }
    });
  }

  public override onOpen(): void {
    if (getPluginHostUiBridge() === null) {
      this.inputEl.focus();
    }

    void this.refreshSuggestions();
  }

  public override open(): void {
    const hostUiBridge = getPluginHostUiBridge();

    if (hostUiBridge === null) {
      super.open();
      return;
    }

    if (this.opened) {
      return;
    }

    this.opened = true;
    this.hostModalId = hostUiBridge.openSuggestModal({
      title: this.titleEl.textContent?.trim() ?? '',
      placeholder: this.inputEl.placeholder,
      query: this.inputEl.value,
      emptyStateText: this.emptyStateText,
      instructions: this.instructions.map((instruction) => ({
        command: instruction.command,
        purpose: instruction.purpose,
      })),
      items: [],
      onQueryChange: async (query) => {
        await this.handleHostQueryChange(query);
      },
      onSelect: (itemId) => {
        this.handleHostSelect(itemId);
      },
      onClose: () => {
        this.handleHostClosed();
      },
    });

    void Promise.resolve(this.onOpen());
  }

  public override close(): void {
    const hostUiBridge = getPluginHostUiBridge();

    if (hostUiBridge === null || this.hostModalId === null) {
      super.close();
      return;
    }

    if (!this.opened) {
      return;
    }

    const modalId = this.hostModalId;
    this.opened = false;
    this.hostModalId = null;
    this.closingViaHostBridge = true;
    hostUiBridge.closeSuggestModal(modalId);
    void Promise.resolve(this.onClose());
  }

  public setPlaceholder(placeholder: string): void {
    this.inputEl.placeholder = placeholder;
  }

  public setInstructions(instructions: readonly Instruction[]): void {
    this.instructions = instructions;
    clearElement(this.instructionsEl);

    for (const instruction of instructions) {
      appendInstruction(this.instructionsEl, instruction);
    }
  }

  public onNoSuggestion(): void {
    clearElement(this.resultContainerEl);
    const emptyEl = document.createElement('div');
    emptyEl.className = 'ns-plugin-suggest-modal__empty';
    emptyEl.textContent = this.emptyStateText;
    this.resultContainerEl.append(emptyEl);
  }

  public selectSuggestion(value: TValue, evt: MouseEvent | KeyboardEvent): void {
    this.onChooseSuggestion(value, evt);
    this.close();
  }

  public selectActiveSuggestion(evt: MouseEvent | KeyboardEvent): void {
    const value = this.suggestions[this.selectedIndex] ?? this.suggestions[0];

    if (value === undefined) {
      return;
    }

    this.selectSuggestion(value, evt);
  }

  private async refreshSuggestions(): Promise<void> {
    const suggestions = await this.getSuggestions(this.inputEl.value);
    this.suggestions = suggestions.slice(0, this.limit);
    this.selectedIndex = this.suggestions.length > 0 ? 0 : -1;
    const hostUiBridge = getPluginHostUiBridge();

    if (hostUiBridge !== null && this.hostModalId !== null) {
      hostUiBridge.updateSuggestModal({
        modalId: this.hostModalId,
        title: this.titleEl.textContent?.trim() ?? '',
        placeholder: this.inputEl.placeholder,
        query: this.inputEl.value,
        emptyStateText: this.emptyStateText,
        instructions: this.instructions.map((instruction) => ({
          command: instruction.command,
          purpose: instruction.purpose,
        })),
        items: this.suggestions.map((suggestion, index) => {
          return this.serializeSuggestionItem(suggestion, index);
        }),
      });
      return;
    }

    this.renderSuggestions();
  }

  private renderSuggestions(): void {
    clearElement(this.resultContainerEl);

    if (this.suggestions.length === 0) {
      this.onNoSuggestion();
      return;
    }

    this.suggestions.forEach((suggestion, index) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'ns-plugin-suggest-modal__item';
      itemEl.setAttribute('role', 'button');
      itemEl.tabIndex = 0;
      itemEl.dataset.selected = index === this.selectedIndex ? 'true' : 'false';

      this.renderSuggestion(suggestion, itemEl);

      itemEl.addEventListener('click', (event) => {
        this.selectedIndex = index;
        this.selectSuggestion(suggestion, event);
      });

      itemEl.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
          return;
        }

        event.preventDefault();
        this.selectedIndex = index;
        this.selectSuggestion(suggestion, event);
      });

      this.resultContainerEl.append(itemEl);
    });
  }

  private moveSelection(direction: -1 | 1): void {
    if (this.suggestions.length === 0) {
      return;
    }

    const nextIndex = (this.selectedIndex + direction + this.suggestions.length) % this.suggestions.length;
    this.selectedIndex = nextIndex;

    Array.from(this.resultContainerEl.children).forEach((child, index) => {
      if (child instanceof HTMLElement) {
        child.dataset.selected = index === this.selectedIndex ? 'true' : 'false';
      }
    });
  }

  private serializeSuggestionItem(value: TValue, index: number): {
    readonly id: string;
    readonly title: string;
    readonly description: string | null;
  } {
    const previewEl = document.createElement('div');
    this.renderSuggestion(value, previewEl);
    const textParts = extractRenderedTextParts(previewEl);
    const title = textParts[0] ?? `Suggestion ${index + 1}`;
    const description = textParts.length > 1 ? textParts.slice(1).join(' ') : null;

    return {
      id: `suggestion-${index}`,
      title,
      description,
    };
  }

  private async handleHostQueryChange(query: string): Promise<void> {
    this.inputEl.value = query;
    await this.refreshSuggestions();
  }

  private handleHostSelect(itemId: string): void {
    const itemIndex = Number(itemId.replace('suggestion-', ''));
    const value = this.suggestions[itemIndex];

    if (value === undefined) {
      return;
    }

    this.selectedIndex = itemIndex;
    this.selectSuggestion(value, createSyntheticSuggestSelectEvent());
  }

  private handleHostClosed(): void {
    if (this.closingViaHostBridge) {
      this.closingViaHostBridge = false;
      return;
    }

    if (!this.opened) {
      return;
    }

    this.opened = false;
    this.hostModalId = null;
    void Promise.resolve(this.onClose());
  }

  public abstract getSuggestions(query: string): readonly TValue[] | Promise<readonly TValue[]>;

  public abstract renderSuggestion(value: TValue, el: HTMLElement): void;

  public abstract onChooseSuggestion(item: TValue, evt: MouseEvent | KeyboardEvent): void;
}

export abstract class FuzzySuggestModal<TValue> extends SuggestModal<FuzzyMatch<TValue>> {
  public override getSuggestions(query: string): readonly FuzzyMatch<TValue>[] {
    return this.getItems()
      .map((item) => {
        const match = buildSimpleSearchResult(query, this.getItemText(item));

        if (match === null) {
          return null;
        }

        return {
          item,
          match,
        } satisfies FuzzyMatch<TValue>;
      })
      .filter((match): match is FuzzyMatch<TValue> => match !== null)
      .sort((left, right) => right.match.score - left.match.score);
  }

  public override renderSuggestion(value: FuzzyMatch<TValue>, el: HTMLElement): void {
    renderSearchResult(el, this.getItemText(value.item), value.match);
  }

  public override onChooseSuggestion(
    item: FuzzyMatch<TValue>,
    evt: MouseEvent | KeyboardEvent,
  ): void {
    this.onChooseItem(item.item, evt);
  }

  public abstract getItems(): readonly TValue[];

  public abstract getItemText(item: TValue): string;

  public abstract onChooseItem(item: TValue, evt: MouseEvent | KeyboardEvent): void;
}

export abstract class EditorSuggest<TValue> extends PopoverSuggest<TValue> {
  public context: EditorSuggestContext | null = null;
  public limit = 100;

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
