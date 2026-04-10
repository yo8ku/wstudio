/**
 * Settings row container and control composition helpers for plugin settings pages.
 */

import {
  BaseComponent,
  ButtonComponent,
  ColorComponent,
  type ControlContent,
  DropdownComponent,
  ExtraButtonComponent,
  MomentFormatComponent,
  ProgressBarComponent,
  SearchComponent,
  SliderComponent,
  TextAreaComponent,
  TextComponent,
  ToggleComponent,
} from './Control';
import type { TooltipOptions } from '../types/ui';

type ControlConfigurator<TControl extends BaseComponent> = (component: TControl) => void;

function setContent(target: HTMLElement, content: ControlContent): void {
  if (typeof content === 'string') {
    target.textContent = content;
    return;
  }

  target.replaceChildren(content);
}

export class Setting {
  public readonly settingEl: HTMLElement;
  public readonly infoEl: HTMLElement;
  public readonly nameEl: HTMLElement;
  public readonly descEl: HTMLElement;
  public readonly controlEl: HTMLElement;
  public readonly components: BaseComponent[] = [];

  public constructor(containerEl: HTMLElement) {
    this.settingEl = document.createElement('div');
    this.settingEl.className = 'ns-plugin-setting';

    this.infoEl = document.createElement('div');
    this.infoEl.className = 'ns-plugin-setting__info';

    this.nameEl = document.createElement('div');
    this.nameEl.className = 'ns-plugin-setting__name';

    this.descEl = document.createElement('div');
    this.descEl.className = 'ns-plugin-setting__desc';

    this.controlEl = document.createElement('div');
    this.controlEl.className = 'ns-plugin-setting__control';

    this.infoEl.append(this.nameEl, this.descEl);
    this.settingEl.append(this.infoEl, this.controlEl);
    containerEl.append(this.settingEl);
  }

  public setName(name: ControlContent): this {
    setContent(this.nameEl, name);
    return this;
  }

  public setDesc(description: ControlContent): this {
    setContent(this.descEl, description);
    return this;
  }

  public setClass(className: string): this {
    this.settingEl.classList.add(className);
    return this;
  }

  public setTooltip(tooltip: string, _options?: TooltipOptions): this {
    this.settingEl.title = tooltip;
    return this;
  }

  public setHeading(): this {
    this.settingEl.dataset.kind = 'heading';
    return this;
  }

  public setDisabled(disabled: boolean): this {
    this.settingEl.setAttribute('aria-disabled', disabled ? 'true' : 'false');

    for (const component of this.components) {
      component.setDisabled(disabled);
    }

    return this;
  }

  public addButton(configure: ControlConfigurator<ButtonComponent>): this {
    return this.addControl(
      (containerEl) => new ButtonComponent(containerEl),
      configure,
    );
  }

  public addExtraButton(configure: ControlConfigurator<ExtraButtonComponent>): this {
    return this.addControl(
      (containerEl) => new ExtraButtonComponent(containerEl),
      configure,
    );
  }

  public addToggle(configure: ControlConfigurator<ToggleComponent>): this {
    return this.addControl(
      (containerEl) => new ToggleComponent(containerEl),
      configure,
    );
  }

  public addText(configure: ControlConfigurator<TextComponent>): this {
    return this.addControl(
      (containerEl) => new TextComponent(containerEl),
      configure,
    );
  }

  public addSearch(configure: ControlConfigurator<SearchComponent>): this {
    return this.addControl(
      (containerEl) => new SearchComponent(containerEl),
      configure,
    );
  }

  public addTextArea(configure: ControlConfigurator<TextAreaComponent>): this {
    return this.addControl(
      (containerEl) => new TextAreaComponent(containerEl),
      configure,
    );
  }

  public addMomentFormat(configure: ControlConfigurator<MomentFormatComponent>): this {
    return this.addControl(
      (containerEl) => new MomentFormatComponent(containerEl),
      configure,
    );
  }

  public addDropdown(configure: ControlConfigurator<DropdownComponent>): this {
    return this.addControl(
      (containerEl) => new DropdownComponent(containerEl),
      configure,
    );
  }

  public addColorPicker(configure: ControlConfigurator<ColorComponent>): this {
    return this.addControl(
      (containerEl) => new ColorComponent(containerEl),
      configure,
    );
  }

  public addProgressBar(configure: ControlConfigurator<ProgressBarComponent>): this {
    return this.addControl(
      (containerEl) => new ProgressBarComponent(containerEl),
      configure,
    );
  }

  public addSlider(configure: ControlConfigurator<SliderComponent>): this {
    return this.addControl(
      (containerEl) => new SliderComponent(containerEl),
      configure,
    );
  }

  public then(callback: (setting: this) => void): this {
    callback(this);
    return this;
  }

  public clear(): this {
    this.controlEl.replaceChildren();
    this.components.length = 0;
    return this;
  }

  private addControl<TControl extends BaseComponent>(
    factory: (containerEl: HTMLElement) => TControl,
    configure: ControlConfigurator<TControl>,
  ): this {
    const containerEl = document.createElement('div');
    containerEl.className = 'ns-plugin-setting__control-item';
    this.controlEl.append(containerEl);

    const component = factory(containerEl);
    this.components.push(component);
    configure(component);
    return this;
  }
}
