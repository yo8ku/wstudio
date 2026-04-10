/**
 * Bases query, value, and custom view contracts aligned with data-oriented plugin APIs.
 */

import { Component } from '../core/Component';
import type { App } from './app';
import type { MutableJsonObject, MutableJsonValue } from './json';
import type { RenderContext } from './render';
import type { IconName } from './ui';
import type { TFile, TFolder } from './vault';

type PrimitiveLike = string | number | boolean;

type ValueInput =
  | PrimitiveLike
  | Date
  | RegExp
  | TFile
  | Value
  | MutableJsonValue
  | null;

type ValueRecord = Readonly<Record<string, ValueInput | undefined>>;

function isValueRecord(value: ValueInput): boolean {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && !(value instanceof Date)
    && !(value instanceof RegExp)
    && !(value instanceof Value);
}

function isTFileLike(value: ValueInput): value is TFile {
  return typeof value === 'object'
    && value !== null
    && 'path' in value
    && 'basename' in value
    && 'extension' in value;
}

function normalizeString(value: string): string {
  return value.trim();
}

function wrapValue(value: ValueInput): Value {
  if (value instanceof Value) {
    return value;
  }

  if (value === null) {
    return NullValue.value;
  }

  if (typeof value === 'string') {
    return new StringValue(value);
  }

  if (typeof value === 'number') {
    return new NumberValue(value);
  }

  if (typeof value === 'boolean') {
    return new BooleanValue(value);
  }

  if (value instanceof Date) {
    return new DateValue(value);
  }

  if (value instanceof RegExp) {
    return new RegExpValue(value);
  }

  if (Array.isArray(value)) {
    return new ListValue(value);
  }

  if (isTFileLike(value)) {
    return new FileValue(value);
  }

  if (isValueRecord(value)) {
    return new ObjectValue(value as ValueRecord);
  }

  return new StringValue(String(value));
}

function valueToJson(value: MutableJsonValue | null | undefined): string {
  if (value === null) {
    return 'null';
  }

  if (value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
}

function isSortDirection(value: MutableJsonValue | undefined): value is 'ASC' | 'DESC' {
  return value === 'ASC' || value === 'DESC';
}

function isPropertyId(value: MutableJsonValue | undefined): value is BasesPropertyId {
  return typeof value === 'string' && parsePropertyId(value) !== null;
}

export type BasesPropertyType = 'note' | 'formula' | 'file';

export interface BasesProperty {
  readonly type: BasesPropertyType;
  readonly name: string;
}

export type BasesPropertyId = `${BasesPropertyType}.${string}`;

export function parsePropertyId(propertyId: string): BasesProperty | null {
  const splitIndex = propertyId.indexOf('.');

  if (splitIndex <= 0 || splitIndex === propertyId.length - 1) {
    return null;
  }

  const type = propertyId.slice(0, splitIndex);
  const name = propertyId.slice(splitIndex + 1);

  if (type !== 'note' && type !== 'formula' && type !== 'file') {
    return null;
  }

  return {
    type,
    name,
  };
}

export type BasesConfigFileFilter = string | MutableJsonObject;

export interface BasesConfigFileView {
  readonly type: string;
  readonly name: string;
  readonly filters?: BasesConfigFileFilter;
  readonly groupBy?: MutableJsonObject;
  readonly order?: readonly string[];
  readonly summaries?: Readonly<Record<string, string>>;
}

export interface BasesConfigFile {
  readonly filters?: BasesConfigFileFilter;
  readonly properties?: Readonly<Record<string, Readonly<Record<string, MutableJsonValue | undefined>>>>;
  readonly formulas?: Readonly<Record<string, string>>;
  readonly summaries?: Readonly<Record<string, string>>;
  readonly views?: readonly BasesConfigFileView[];
}

export interface FormulaContext {}

export interface BaseOption {
  readonly key: string;
  readonly type: string;
  readonly displayName: string;
  readonly shouldHide?: (config: BasesViewConfig) => boolean;
}

export interface DropdownOption extends BaseOption {
  readonly type: 'dropdown';
  readonly default?: string;
  readonly options: Readonly<Record<string, string>>;
}

export interface FileOption extends BaseOption {
  readonly type: 'file';
  readonly default?: string;
  readonly placeholder?: string;
  readonly filter?: (file: TFile) => boolean;
}

export interface FolderOption extends BaseOption {
  readonly type: 'folder';
  readonly default?: string;
  readonly placeholder?: string;
  readonly filter?: (folder: TFolder) => boolean;
}

export interface FormulaOption extends BaseOption {
  readonly type: 'formula';
  readonly default?: string;
  readonly placeholder?: string;
}

export interface GroupOption {
  readonly type: 'group';
  readonly displayName: string;
  readonly items: readonly GroupViewOption[];
  readonly shouldHide?: (config: BasesViewConfig) => boolean;
}

export interface MultitextOption extends BaseOption {
  readonly type: 'multitext';
  readonly default?: readonly string[];
}

export interface PropertyOption extends BaseOption {
  readonly type: 'property';
  readonly default?: string;
  readonly placeholder?: string;
  readonly filter?: (prop: BasesPropertyId) => boolean;
}

export interface SliderOption extends BaseOption {
  readonly type: 'slider';
  readonly default?: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly instant?: boolean;
}

export interface TextOption extends BaseOption {
  readonly type: 'text';
  readonly default?: string;
  readonly placeholder?: string;
}

export interface ToggleOption extends BaseOption {
  readonly type: 'toggle';
  readonly default?: boolean;
}

export type GroupViewOption =
  | DropdownOption
  | FileOption
  | FolderOption
  | FormulaOption
  | MultitextOption
  | PropertyOption
  | SliderOption
  | TextOption
  | ToggleOption;

export type ViewOption = GroupViewOption | GroupOption;

export abstract class Value {
  public static type = 'value';

  public static equals(left: Value | null, right: Value | null): boolean {
    if (left === right) {
      return true;
    }

    if (left === null || right === null) {
      return false;
    }

    return left.toString() === right.toString();
  }

  public static looseEquals(left: Value | null, right: Value | null): boolean {
    if (left === right) {
      return true;
    }

    if (left === null || right === null) {
      return false;
    }

    return normalizeString(left.toString()).toLowerCase() === normalizeString(right.toString()).toLowerCase();
  }

  public abstract toString(): string;

  public abstract isTruthy(): boolean;

  public equals(other: this): boolean {
    return Value.equals(this, other);
  }

  public looseEquals(other: Value): boolean {
    return Value.looseEquals(this, other);
  }

  public renderTo(el: HTMLElement, _ctx: RenderContext): void {
    el.textContent = this.toString();
  }
}

export abstract class NotNullValue extends Value {}

export abstract class PrimitiveValue<TValue extends PrimitiveLike> extends NotNullValue {
  public readonly value: TValue;

  public constructor(value: TValue) {
    super();
    this.value = value;
  }

  public override toString(): string {
    return String(this.value);
  }

  public override isTruthy(): boolean {
    return Boolean(this.value);
  }
}

export class BooleanValue extends PrimitiveValue<boolean> {
  public static override type = 'boolean';
}

export class StringValue extends PrimitiveValue<string> {
  public static override type = 'string';
}

export class NumberValue extends PrimitiveValue<number> {
  public static override type = 'number';
}

export class DateValue extends NotNullValue {
  public readonly value: Date;

  public constructor(value: string | number | Date) {
    super();
    this.value = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  }

  public override toString(): string {
    return Number.isNaN(this.value.getTime()) ? '' : this.value.toISOString();
  }

  public dateOnly(): DateValue {
    return new DateValue(new Date(
      this.value.getFullYear(),
      this.value.getMonth(),
      this.value.getDate(),
    ));
  }

  public relative(): string {
    const delta = this.value.getTime() - Date.now();

    if (Math.abs(delta) < 60_000) {
      return 'just now';
    }

    const minutes = Math.round(delta / 60_000);

    if (Math.abs(minutes) < 60) {
      return minutes > 0 ? `in ${minutes} minutes` : `${Math.abs(minutes)} minutes ago`;
    }

    const hours = Math.round(minutes / 60);

    if (Math.abs(hours) < 24) {
      return hours > 0 ? `in ${hours} hours` : `${Math.abs(hours)} hours ago`;
    }

    const days = Math.round(hours / 24);

    return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`;
  }

  public override isTruthy(): boolean {
    return !Number.isNaN(this.value.getTime());
  }

  public toDate(): Date {
    return new Date(this.value.getTime());
  }

  public static parseFromString(input: string): DateValue | null {
    const date = new Date(input);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return new DateValue(date);
  }
}

export class DurationValue extends NotNullValue {
  private readonly milliseconds: number;

  public constructor(milliseconds: number) {
    super();
    this.milliseconds = milliseconds;
  }

  public override toString(): string {
    return `${this.milliseconds}ms`;
  }

  public override isTruthy(): boolean {
    return this.milliseconds !== 0;
  }

  public addToDate(value: DateValue, subtract = false): DateValue {
    const modifier = subtract ? -1 : 1;
    return new DateValue(value.toDate().getTime() + (this.milliseconds * modifier));
  }

  public getMilliseconds(): number {
    return this.milliseconds;
  }

  public static parseFromString(input: string): DurationValue | null {
    const pattern = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i;
    const match = pattern.exec(input.trim());

    if (match === null) {
      return null;
    }

    const days = Number.parseInt(match[1] ?? '0', 10);
    const hours = Number.parseInt(match[2] ?? '0', 10);
    const minutes = Number.parseInt(match[3] ?? '0', 10);
    const seconds = Number.parseInt(match[4] ?? '0', 10);
    const milliseconds =
      (((days * 24) + hours) * 60 * 60 * 1000)
      + (minutes * 60 * 1000)
      + (seconds * 1000);

    return new DurationValue(milliseconds);
  }

  public static fromMilliseconds(milliseconds: number): DurationValue {
    return new DurationValue(milliseconds);
  }
}

export class FileValue extends NotNullValue {
  public readonly value: TFile | string;

  public constructor(value: TFile | string) {
    super();
    this.value = value;
  }

  public override toString(): string {
    return typeof this.value === 'string' ? this.value : this.value.path;
  }

  public override isTruthy(): boolean {
    return this.toString().length > 0;
  }
}

export class HTMLValue extends StringValue {}

export class IconValue extends StringValue {}

export class ImageValue extends StringValue {}

export class LinkValue extends StringValue {
  public static parseFromString(app: App, input: string, sourcePath: string): LinkValue | null {
    void app;
    void sourcePath;
    const wikilinkPattern = /^\[\[(.+?)\]\]$/;
    const markdownLinkPattern = /^\[(.+?)\]\((.+?)\)$/;

    if (wikilinkPattern.test(input)) {
      return new LinkValue(input.slice(2, -2));
    }

    const markdownMatch = markdownLinkPattern.exec(input);

    if (markdownMatch !== null) {
      return new LinkValue(markdownMatch[2]);
    }

    return null;
  }
}

export class ListValue extends NotNullValue {
  public static override type = 'list';

  public readonly value: readonly Value[];

  public constructor(value: readonly ValueInput[]) {
    super();
    this.value = value.map((item) => wrapValue(item));
  }

  public override toString(): string {
    return `[${this.value.map((item) => item.toString()).join(', ')}]`;
  }

  public override isTruthy(): boolean {
    return this.value.length > 0;
  }

  public includes(value: Value): boolean {
    return this.value.some((item) => item.looseEquals(value));
  }

  public concat(value: ListValue | readonly ValueInput[]): ListValue {
    const nextValues = value instanceof ListValue ? value.value : value.map((item) => wrapValue(item));
    return new ListValue([...this.value, ...nextValues]);
  }

  public length(): number {
    return this.value.length;
  }

  public get(index: number): Value | null {
    return this.value[index] ?? NullValue.value;
  }
}

export class NullValue extends Value {
  public static readonly value = new NullValue();

  private constructor() {
    super();
  }

  public override toString(): string {
    return 'null';
  }

  public override isTruthy(): boolean {
    return false;
  }
}

export class ObjectValue extends NotNullValue {
  public static override type = 'object';

  public readonly value: ValueRecord;

  public constructor(value: ValueRecord) {
    super();
    this.value = value;
  }

  public override toString(): string {
    const json: Record<string, string> = {};

    for (const [key, value] of Object.entries(this.value)) {
      json[key] = value === undefined ? '' : wrapValue(value).toString();
    }

    return JSON.stringify(json);
  }

  public override isTruthy(): boolean {
    return Object.keys(this.value).length > 0;
  }

  public isEmpty(): boolean {
    return Object.keys(this.value).length === 0;
  }

  public get(key: string): Value | null {
    const value = this.value[key];
    return value === undefined ? NullValue.value : wrapValue(value);
  }
}

export class RegExpValue extends NotNullValue {
  public readonly value: RegExp;

  public constructor(value: RegExp) {
    super();
    this.value = value;
  }

  public override toString(): string {
    return this.value.toString();
  }

  public override isTruthy(): boolean {
    return true;
  }
}

export class RelativeDateValue extends DateValue {}

export class TagValue extends StringValue {
  public constructor(value: string) {
    super(value.startsWith('#') ? value : `#${value}`);
  }
}

export class UrlValue extends StringValue {}

export type BasesSortConfig = {
  readonly property: BasesPropertyId;
  readonly direction: 'ASC' | 'DESC';
};

export class QueryController extends Component {
  public readonly app: App;

  public constructor(app: App) {
    super();
    this.app = app;
  }

  public onload(): void {
    return undefined;
  }

  public onunload(): void {
    return undefined;
  }
}

export class BasesEntry implements FormulaContext {
  public readonly file: TFile;
  private readonly values: Readonly<Record<string, Value | null>>;

  public constructor(file: TFile, values: Readonly<Record<string, Value | null>> = {}) {
    this.file = file;
    this.values = values;
  }

  public getValue(propertyId: BasesPropertyId): Value | null {
    return this.values[propertyId] ?? null;
  }
}

export class BasesEntryGroup {
  public readonly key?: Value;
  public readonly entries: BasesEntry[];

  public constructor(entries: BasesEntry[], key?: Value) {
    this.entries = entries;
    this.key = key;
  }

  public hasKey(): boolean {
    return this.key !== undefined && this.key !== NullValue.value;
  }
}

export class BasesQueryResult {
  public readonly data: BasesEntry[];
  private readonly groupedEntries: BasesEntryGroup[];
  private readonly visibleProperties: BasesPropertyId[];

  public constructor(
    data: BasesEntry[] = [],
    properties: BasesPropertyId[] = [],
    groupedData?: BasesEntryGroup[],
  ) {
    this.data = data;
    this.visibleProperties = properties;
    this.groupedEntries = groupedData ?? [new BasesEntryGroup(data)];
  }

  public get groupedData(): BasesEntryGroup[] {
    return [...this.groupedEntries];
  }

  public get properties(): BasesPropertyId[] {
    return [...this.visibleProperties];
  }

  public getSummaryValue(
    queryController: QueryController,
    entries: BasesEntry[],
    prop: BasesPropertyId,
    summaryKey: string,
  ): Value {
    void queryController;
    void prop;

    if (summaryKey === 'count') {
      return new NumberValue(entries.length);
    }

    return NullValue.value;
  }
}

export class BasesViewConfig {
  public name: string;
  private readonly values: Record<string, MutableJsonValue | null>;

  public constructor(
    name = '',
    values: Record<string, MutableJsonValue | null> = {},
  ) {
    this.name = name;
    this.values = values;
  }

  public get(key: string): MutableJsonValue | undefined {
    const value = this.values[key];
    return value === null ? undefined : value;
  }

  public getAsPropertyId(key: string): BasesPropertyId | null {
    const value = this.get(key);
    return isPropertyId(value) ? value : null;
  }

  public getEvaluatedFormula(view: BasesView, key: string): Value {
    void view;
    const value = this.get(key);

    if (value === undefined) {
      return NullValue.value;
    }

    return wrapValue(value);
  }

  public set(key: string, value: MutableJsonValue | null): void {
    this.values[key] = value;
  }

  public getOrder(): BasesPropertyId[] {
    const value = this.get('order');

    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is BasesPropertyId => isPropertyId(item));
  }

  public getSort(): BasesSortConfig[] {
    const value = this.get('sort');

    if (!Array.isArray(value)) {
      return [];
    }

    const results: BasesSortConfig[] = [];

    for (const item of value) {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) {
        continue;
      }

      const property = item.property;
      const direction = item.direction;

      if (isPropertyId(property) && isSortDirection(direction)) {
        results.push({
          property,
          direction,
        });
      }
    }

    return results;
  }

  public getDisplayName(propertyId: BasesPropertyId): string {
    const key = `displayName:${propertyId}`;
    const configured = this.get(key);

    if (typeof configured === 'string' && configured.length > 0) {
      return configured;
    }

    return parsePropertyId(propertyId)?.name ?? propertyId;
  }
}

export type BasesViewFactory = (
  controller: QueryController,
  containerEl: HTMLElement,
) => BasesView;

export interface BasesViewRegistration {
  readonly name: string;
  readonly icon: IconName;
  readonly factory: BasesViewFactory;
  readonly options?: () => readonly ViewOption[];
}

export abstract class BasesView extends Component {
  public abstract type: string;
  public readonly app: App;
  public readonly containerEl: HTMLElement;
  public config: BasesViewConfig;
  public allProperties: BasesPropertyId[] = [];
  public data: BasesQueryResult = new BasesQueryResult();
  protected readonly controller: QueryController;

  protected constructor(
    controller: QueryController,
    containerEl: HTMLElement,
    config: BasesViewConfig = new BasesViewConfig(),
  ) {
    super();
    this.controller = controller;
    this.app = controller.app;
    this.containerEl = containerEl;
    this.config = config;
  }

  public abstract onDataUpdated(): void;

  public async createFileForView(
    baseFileName = 'Untitled',
    frontmatterProcessor?: (frontmatter: MutableJsonObject) => void,
  ): Promise<void> {
    const frontmatter: MutableJsonObject = {};

    if (frontmatterProcessor !== undefined) {
      frontmatterProcessor(frontmatter);
    }

    const fileName = baseFileName.trim().length === 0 ? 'Untitled' : baseFileName.trim();
    this.containerEl.dataset.lastCreatedFile = `${fileName}.md`;
    this.containerEl.dataset.lastCreatedFrontmatter = valueToJson(frontmatter);
  }
}
