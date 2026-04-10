/**
 * DOM-backed setting control primitives aligned to plugin-facing settings capabilities.
 */

import type { HexString, HSL, IconName, RGB, TooltipOptions } from '../types/ui';

export type ControlContent = string | DocumentFragment;

type ControlEffect = Promise<void> | void;

export type ValueChangeHandler<TValue> = (value: TValue) => ControlEffect;

export type ButtonClickHandler = (event: MouseEvent | KeyboardEvent) => ControlEffect;

export type ExtraButtonClickHandler = () => ControlEffect;

function runSideEffect(effect: ControlEffect): void {
  void Promise.resolve(effect).catch(() => undefined);
}

function applyTooltip(target: HTMLElement, tooltip: string, _options?: TooltipOptions): void {
  target.title = tooltip;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}

function componentToHex(value: number): string {
  return clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0');
}

function rgbToHex(rgb: RGB): HexString {
  return `#${componentToHex(rgb.r)}${componentToHex(rgb.g)}${componentToHex(rgb.b)}`;
}

function hexToRgb(hex: string): RGB {
  const normalized = hex.replace('#', '').padEnd(6, '0').slice(0, 6);

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHsl(rgb: RGB): HSL {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;

  if (delta === 0) {
    return { h: 0, s: 0, l: Math.round(lightness * 100) };
  }

  const saturation = lightness > 0.5
    ? delta / (2 - max - min)
    : delta / (max + min);

  let hue = 0;

  if (max === r) {
    hue = ((g - b) / delta) % 6;
  } else if (max === g) {
    hue = (b - r) / delta + 2;
  } else {
    hue = (r - g) / delta + 4;
  }

  return {
    h: Math.round(hue * 60 < 0 ? hue * 60 + 360 : hue * 60),
    s: Math.round(saturation * 100),
    l: Math.round(lightness * 100),
  };
}

function hslToRgb(hsl: HSL): RGB {
  const saturation = clamp(hsl.s, 0, 100) / 100;
  const lightness = clamp(hsl.l, 0, 100) / 100;
  const hue = ((hsl.h % 360) + 360) % 360;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const match = lightness - chroma / 2;

  let red = 0;
  let green = 0;
  let blue = 0;

  if (hue < 60) {
    red = chroma;
    green = x;
  } else if (hue < 120) {
    red = x;
    green = chroma;
  } else if (hue < 180) {
    green = chroma;
    blue = x;
  } else if (hue < 240) {
    green = x;
    blue = chroma;
  } else if (hue < 300) {
    red = x;
    blue = chroma;
  } else {
    red = chroma;
    blue = x;
  }

  return {
    r: Math.round((red + match) * 255),
    g: Math.round((green + match) * 255),
    b: Math.round((blue + match) * 255),
  };
}

function updateInteractiveState(target: HTMLElement, disabled: boolean): void {
  target.setAttribute('aria-disabled', disabled ? 'true' : 'false');
  target.tabIndex = disabled ? -1 : 0;
}

function bindActionHandler(
  target: HTMLElement,
  getDisabled: () => boolean,
  callback: ButtonClickHandler,
): void {
  target.addEventListener('click', (event) => {
    if (getDisabled()) {
      event.preventDefault();
      return;
    }

    runSideEffect(callback(event));
  });

  target.addEventListener('keydown', (event) => {
    if (getDisabled()) {
      return;
    }

    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    runSideEffect(callback(event));
  });
}

export abstract class BaseComponent {
  public disabled = false;
  public readonly containerEl: HTMLElement;

  protected constructor(containerEl: HTMLElement) {
    this.containerEl = containerEl;
  }

  public then(callback: (component: this) => ControlEffect): this {
    runSideEffect(callback(this));
    return this;
  }

  public setDisabled(disabled: boolean): this {
    this.disabled = disabled;
    return this;
  }
}

export abstract class ValueComponent<TValue> extends BaseComponent {
  private readonly changeHandlers: ValueChangeHandler<TValue>[] = [];

  public registerOptionListener(
    listeners: Record<string, (value?: TValue) => TValue>,
    key: string,
  ): this {
    const listener = listeners[key];

    if (listener !== undefined) {
      this.onChange((value) => {
        this.setValue(listener(value));
      });
    }

    return this;
  }

  public abstract getValue(): TValue;

  public abstract setValue(value: TValue): this;

  public onChange(callback: ValueChangeHandler<TValue>): this {
    this.changeHandlers.push(callback);
    return this;
  }

  protected emitChange(value: TValue): void {
    for (const handler of this.changeHandlers) {
      runSideEffect(handler(value));
    }
  }
}

export abstract class AbstractTextComponent<TInput extends HTMLInputElement | HTMLTextAreaElement>
  extends ValueComponent<string> {
  public readonly inputEl: TInput;

  protected constructor(inputEl: TInput) {
    super(inputEl.parentElement ?? inputEl);
    this.inputEl = inputEl;

    this.inputEl.addEventListener('input', () => {
      this.onChanged();
      this.emitChange(this.getValue());
    });
  }

  public override setDisabled(disabled: boolean): this {
    super.setDisabled(disabled);
    this.inputEl.disabled = disabled;
    return this;
  }

  public getValue(): string {
    return this.inputEl.value;
  }

  public setValue(value: string): this {
    this.inputEl.value = value;
    this.onChanged();
    return this;
  }

  public setPlaceholder(placeholder: string): this {
    this.inputEl.placeholder = placeholder;
    return this;
  }

  public onChanged(): void {
    return undefined;
  }
}

export class TextComponent extends AbstractTextComponent<HTMLInputElement> {
  public constructor(containerEl: HTMLElement) {
    const inputEl = document.createElement('input');
    inputEl.className = 'ns-plugin-text';
    inputEl.type = 'text';
    containerEl.append(inputEl);
    super(inputEl);
  }
}

export class TextAreaComponent extends AbstractTextComponent<HTMLTextAreaElement> {
  public constructor(containerEl: HTMLElement) {
    const inputEl = document.createElement('textarea');
    inputEl.className = 'ns-plugin-textarea';
    containerEl.append(inputEl);
    super(inputEl);
  }
}

export class SearchComponent extends AbstractTextComponent<HTMLInputElement> {
  public readonly clearButtonEl: HTMLElement;

  public constructor(containerEl: HTMLElement) {
    const inputEl = document.createElement('input');
    inputEl.className = 'ns-plugin-search';
    inputEl.type = 'search';
    containerEl.append(inputEl);
    super(inputEl);

    this.clearButtonEl = document.createElement('div');
    this.clearButtonEl.className = 'ns-plugin-search__clear';
    this.clearButtonEl.setAttribute('role', 'button');
    this.clearButtonEl.tabIndex = 0;
    this.clearButtonEl.textContent = 'x';
    containerEl.append(this.clearButtonEl);

    bindActionHandler(this.clearButtonEl, () => this.disabled, () => {
      this.setValue('');
      this.emitChange(this.getValue());
    });

    this.onChanged();
  }

  public override onChanged(): void {
    this.clearButtonEl.hidden = this.getValue().length === 0;
  }
}

export class MomentFormatComponent extends TextComponent {
  public readonly sampleEl: HTMLElement;
  private defaultFormat = '';

  public constructor(containerEl: HTMLElement) {
    super(containerEl);
    this.sampleEl = document.createElement('div');
    this.sampleEl.className = 'ns-plugin-moment-format__sample';
    containerEl.append(this.sampleEl);
  }

  public setDefaultFormat(defaultFormat: string): this {
    this.defaultFormat = defaultFormat;
    this.setPlaceholder(defaultFormat);
    this.updateSample();
    return this;
  }

  public setSampleEl(sampleEl: HTMLElement): this {
    this.sampleEl.replaceWith(sampleEl);
    return this;
  }

  public override setValue(value: string): this {
    super.setValue(value);
    this.updateSample();
    return this;
  }

  public override onChanged(): void {
    this.updateSample();
  }

  public updateSample(): void {
    const value = this.getValue().trim();
    this.sampleEl.textContent = value.length > 0 ? value : this.defaultFormat;
  }
}

export class DropdownComponent extends ValueComponent<string> {
  public readonly selectEl: HTMLSelectElement;

  public constructor(containerEl: HTMLElement) {
    super(containerEl);
    this.selectEl = document.createElement('select');
    this.selectEl.className = 'ns-plugin-dropdown';
    this.selectEl.addEventListener('change', () => {
      this.emitChange(this.getValue());
    });
    containerEl.append(this.selectEl);
  }

  public override setDisabled(disabled: boolean): this {
    super.setDisabled(disabled);
    this.selectEl.disabled = disabled;
    return this;
  }

  public addOption(value: string, display: string): this {
    const optionEl = document.createElement('option');
    optionEl.value = value;
    optionEl.textContent = display;
    this.selectEl.append(optionEl);
    return this;
  }

  public addOptions(options: Record<string, string>): this {
    for (const [value, display] of Object.entries(options)) {
      this.addOption(value, display);
    }

    return this;
  }

  public getValue(): string {
    return this.selectEl.value;
  }

  public setValue(value: string): this {
    this.selectEl.value = value;
    return this;
  }
}

export class ToggleComponent extends ValueComponent<boolean> {
  public readonly toggleEl: HTMLElement;
  private readonly inputEl: HTMLInputElement;

  public constructor(containerEl: HTMLElement) {
    super(containerEl);
    this.inputEl = document.createElement('input');
    this.inputEl.className = 'ns-plugin-toggle';
    this.inputEl.type = 'checkbox';
    this.inputEl.addEventListener('change', () => {
      this.emitChange(this.getValue());
    });
    containerEl.append(this.inputEl);
    this.toggleEl = this.inputEl;
  }

  public override setDisabled(disabled: boolean): this {
    super.setDisabled(disabled);
    this.inputEl.disabled = disabled;
    return this;
  }

  public getValue(): boolean {
    return this.inputEl.checked;
  }

  public setValue(value: boolean): this {
    this.inputEl.checked = value;
    this.toggleEl.setAttribute('aria-checked', value ? 'true' : 'false');
    return this;
  }

  public setTooltip(tooltip: string, options?: TooltipOptions): this {
    applyTooltip(this.toggleEl, tooltip, options);
    return this;
  }

  public onClick(): void {
    if (this.disabled) {
      return;
    }

    this.setValue(!this.getValue());
    this.emitChange(this.getValue());
  }
}

export class SliderComponent extends ValueComponent<number> {
  public readonly sliderEl: HTMLInputElement;
  private instant = false;
  private dynamicTooltip = false;

  public constructor(containerEl: HTMLElement) {
    super(containerEl);
    this.sliderEl = document.createElement('input');
    this.sliderEl.className = 'ns-plugin-slider';
    this.sliderEl.type = 'range';
    this.sliderEl.addEventListener('input', () => {
      if (!this.instant) {
        return;
      }

      this.showTooltip();
      this.emitChange(this.getValue());
    });
    this.sliderEl.addEventListener('change', () => {
      this.showTooltip();
      this.emitChange(this.getValue());
    });
    containerEl.append(this.sliderEl);
  }

  public override setDisabled(disabled: boolean): this {
    super.setDisabled(disabled);
    this.sliderEl.disabled = disabled;
    return this;
  }

  public setInstant(instant: boolean): this {
    this.instant = instant;
    return this;
  }

  public setLimits(min: number | null, max: number | null, step: number | 'any'): this {
    if (min !== null) {
      this.sliderEl.min = String(min);
    }

    if (max !== null) {
      this.sliderEl.max = String(max);
    }

    this.sliderEl.step = String(step);
    return this;
  }

  public getValue(): number {
    return Number.parseFloat(this.sliderEl.value);
  }

  public setValue(value: number): this {
    this.sliderEl.value = String(value);
    return this;
  }

  public getValuePretty(): string {
    return this.sliderEl.value;
  }

  public setDynamicTooltip(): this {
    this.dynamicTooltip = true;
    this.showTooltip();
    return this;
  }

  public showTooltip(): void {
    if (!this.dynamicTooltip) {
      return;
    }

    this.sliderEl.title = this.getValuePretty();
  }
}

export class ProgressBarComponent extends ValueComponent<number> {
  public readonly progressEl: HTMLProgressElement;

  public constructor(containerEl: HTMLElement) {
    super(containerEl);
    this.progressEl = document.createElement('progress');
    this.progressEl.className = 'ns-plugin-progress';
    this.progressEl.max = 100;
    containerEl.append(this.progressEl);
  }

  public getValue(): number {
    return this.progressEl.value;
  }

  public setValue(value: number): this {
    this.progressEl.value = clamp(value, 0, 100);
    return this;
  }
}

export class ColorComponent extends ValueComponent<string> {
  public readonly colorEl: HTMLInputElement;

  public constructor(containerEl: HTMLElement) {
    super(containerEl);
    this.colorEl = document.createElement('input');
    this.colorEl.className = 'ns-plugin-color';
    this.colorEl.type = 'color';
    this.colorEl.addEventListener('input', () => {
      this.emitChange(this.getValue());
    });
    containerEl.append(this.colorEl);
  }

  public override setDisabled(disabled: boolean): this {
    super.setDisabled(disabled);
    this.colorEl.disabled = disabled;
    return this;
  }

  public getValue(): HexString {
    return this.colorEl.value as HexString;
  }

  public getValueRgb(): RGB {
    return hexToRgb(this.getValue());
  }

  public getValueHsl(): HSL {
    return rgbToHsl(this.getValueRgb());
  }

  public setValue(value: HexString): this {
    this.colorEl.value = value;
    return this;
  }

  public setValueRgb(rgb: RGB): this {
    return this.setValue(rgbToHex(rgb));
  }

  public setValueHsl(hsl: HSL): this {
    return this.setValueRgb(hslToRgb(hsl));
  }
}

export class ButtonComponent extends BaseComponent {
  public readonly buttonEl: HTMLElement;

  public constructor(containerEl: HTMLElement) {
    super(containerEl);
    this.buttonEl = document.createElement('div');
    this.buttonEl.className = 'ns-plugin-button';
    this.buttonEl.setAttribute('role', 'button');
    updateInteractiveState(this.buttonEl, false);
    containerEl.append(this.buttonEl);
  }

  public override setDisabled(disabled: boolean): this {
    super.setDisabled(disabled);
    updateInteractiveState(this.buttonEl, disabled);
    return this;
  }

  public setCta(): this {
    this.buttonEl.dataset.style = 'cta';
    return this;
  }

  public removeCta(): this {
    if (this.buttonEl.dataset.style === 'cta') {
      delete this.buttonEl.dataset.style;
    }

    return this;
  }

  public setWarning(): this {
    this.buttonEl.dataset.style = 'warning';
    return this;
  }

  public setTooltip(tooltip: string, options?: TooltipOptions): this {
    applyTooltip(this.buttonEl, tooltip, options);
    return this;
  }

  public setButtonText(name: string): this {
    this.buttonEl.textContent = name;
    return this;
  }

  public setIcon(icon: IconName): this {
    this.buttonEl.dataset.icon = icon;
    return this;
  }

  public setClass(className: string): this {
    this.buttonEl.classList.add(className);
    return this;
  }

  public onClick(callback: ButtonClickHandler): this {
    bindActionHandler(this.buttonEl, () => this.disabled, callback);
    return this;
  }
}

export class ExtraButtonComponent extends BaseComponent {
  public readonly extraSettingsEl: HTMLElement;

  public constructor(containerEl: HTMLElement) {
    super(containerEl);
    this.extraSettingsEl = document.createElement('div');
    this.extraSettingsEl.className = 'ns-plugin-extra-button';
    this.extraSettingsEl.setAttribute('role', 'button');
    updateInteractiveState(this.extraSettingsEl, false);
    containerEl.append(this.extraSettingsEl);
  }

  public override setDisabled(disabled: boolean): this {
    super.setDisabled(disabled);
    updateInteractiveState(this.extraSettingsEl, disabled);
    return this;
  }

  public setTooltip(tooltip: string, options?: TooltipOptions): this {
    applyTooltip(this.extraSettingsEl, tooltip, options);
    return this;
  }

  public setIcon(icon: IconName): this {
    this.extraSettingsEl.dataset.icon = icon;
    return this;
  }

  public onClick(callback: ExtraButtonClickHandler): this {
    bindActionHandler(this.extraSettingsEl, () => this.disabled, () => callback());
    return this;
  }
}
