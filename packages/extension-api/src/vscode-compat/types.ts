/**
 * VSCode API 类型定义
 */

export interface Disposable {
  dispose(): void;
}

export interface Event<T> {
  (listener: (e: T) => any, thisArgs?: any): Disposable;
}

export interface ExtensionContext {
  readonly subscriptions: Disposable[];
  readonly extensionPath: string;
  readonly globalState: Memento;
  readonly workspaceState: Memento;
  readonly extensionUri: Uri;
  readonly environmentVariableCollection: EnvironmentVariableCollection;
  readonly secrets: SecretStorage;
  readonly extensionMode: ExtensionMode;
  readonly extension: Extension<any>;
  readonly storageUri: Uri | undefined;
  readonly globalStorageUri: Uri;
  readonly logUri: Uri;
  readonly extensionRuntime: ExtensionRuntime;
}

export interface Memento {
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: any): Promise<void>;
}

export interface Uri {
  readonly scheme: string;
  readonly authority: string;
  readonly path: string;
  readonly query: string;
  readonly fragment: string;
  readonly fsPath: string;
  with(change: { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string }): Uri;
  toString(skipEncoding?: boolean): string;
  toJSON(): any;
}

export interface WorkspaceFolder {
  readonly uri: Uri;
  readonly name: string;
  readonly index: number;
}

export interface ConfigurationChangeEvent {
  affectsConfiguration(section: string, scope?: Uri | null): boolean;
}

export interface FileSystemWatcher extends Disposable {
  readonly ignoreCreateEvents: boolean;
  readonly ignoreChangeEvents: boolean;
  readonly ignoreDeleteEvents: boolean;
  onDidCreate: Event<Uri>;
  onDidChange: Event<Uri>;
  onDidDelete: Event<Uri>;
}

export interface Position {
  readonly line: number;
  readonly character: number;
  isBefore(other: Position): boolean;
  isBeforeOrEqual(other: Position): boolean;
  isAfter(other: Position): boolean;
  isAfterOrEqual(other: Position): boolean;
  isEqual(other: Position): boolean;
  compareTo(other: Position): number;
  translate(lineDelta?: number, characterDelta?: number): Position;
  with(line?: number, character?: number): Position;
}

export interface Range {
  readonly start: Position;
  readonly end: Position;
  isEmpty: boolean;
  isSingleLine: boolean;
  contains(positionOrRange: Position | Range): boolean;
  isEqual(other: Range): boolean;
  intersection(range: Range): Range | undefined;
  union(other: Range): Range;
  with(start?: Position, end?: Position): Range;
}

export interface TextDocument {
  readonly uri: Uri;
  readonly fileName: string;
  readonly isUntitled: boolean;
  readonly languageId: string;
  readonly version: number;
  readonly isDirty: boolean;
  readonly isClosed: boolean;
  save(): Promise<boolean>;
  lineAt(line: number): TextLine;
  lineAt(position: Position): TextLine;
  offsetAt(position: Position): number;
  positionAt(offset: number): Position;
  getText(range?: Range): string;
  getWordRangeAtPosition(position: Position, regex?: RegExp): Range | undefined;
  validateRange(range: Range): Range;
  validatePosition(position: Position): Position;
}

export interface TextLine {
  readonly lineNumber: number;
  readonly text: string;
  readonly range: Range;
  readonly rangeIncludingLineBreak: Range;
  readonly firstNonWhitespaceCharacterIndex: number;
  readonly isEmptyOrWhitespace: boolean;
}

export interface TextEditor {
  readonly document: TextDocument;
  readonly selection: Selection;
  readonly selections: readonly Selection[];
  readonly visibleRanges: readonly Range[];
  readonly options: TextEditorOptions;
  readonly viewColumn: ViewColumn | undefined;
  edit(callback: (editBuilder: TextEditorEdit) => void, options?: { undoStopBefore: boolean; undoStopAfter: boolean }): Promise<boolean>;
  insertSnippet(snippet: SnippetString, location?: Position | Range | Position[] | Range[], options?: { undoStopBefore: boolean; undoStopAfter: boolean }): Promise<boolean>;
  setDecorations(decorationType: TextEditorDecorationType, rangesOrOptions: Range[] | DecorationOptions[]): void;
  revealRange(range: Range, revealType?: TextEditorRevealType): void;
  show(column?: ViewColumn): void;
  hide(): void;
}

export interface Selection extends Range {
  anchor: Position;
  active: Position;
  isEmpty: boolean;
  isReversed: boolean;
}

export interface TextEditorOptions {
  tabSize: number | string;
  insertSpaces: boolean | string;
  cursorStyle: TextEditorCursorStyle;
  lineNumbers: TextEditorLineNumbersStyle;
  rulers: number[];
  wordWrap: TextEditorWordWrapStyle;
  wordWrapColumn: number;
  wordWrapMinified: boolean;
  folding: boolean;
  foldingStrategy: TextEditorFoldingStrategy;
  showFoldingControls: TextEditorFoldingStrategy;
  unfoldOnClickAfterEnd: boolean;
  glyphMargin: boolean;
  find: TextEditorFindOptions;
  fontLigatures: boolean | string;
  disableLayerHinting: boolean;
  disableMonospaceOptimizations: boolean;
  stickyScroll: TextEditorStickyScrollOptions;
}

export interface TextEditorEdit {
  replace(location: Position | Range, value: string): void;
  insert(location: Position, value: string): void;
  delete(location: Range): void;
  setEndOfLine(endOfLine: EndOfLine): void;
}

export interface TextEditorDecorationType {
  key: string;
  dispose(): void;
}

export interface DecorationOptions {
  range: Range;
  hoverMessage?: MarkedString | MarkedString[];
  renderOptions?: DecorationRenderOptions;
}

export interface DecorationRenderOptions {
  after?: ThemableDecorationAttachmentRenderOptions;
  before?: ThemableDecorationAttachmentRenderOptions;
  backgroundColor?: string | ThemeColor;
  border?: string;
  borderColor?: string | ThemeColor;
  borderRadius?: string;
  borderSpacing?: string;
  borderStyle?: string;
  borderWidth?: string;
  color?: string | ThemeColor;
  cursor?: string;
  fontStyle?: string;
  fontWeight?: string;
  fontFamily?: string;
  fontSize?: string;
  fontFeatureSettings?: string;
  letterSpacing?: string;
  opacity?: string;
  outline?: string;
  outlineColor?: string | ThemeColor;
  outlineStyle?: string;
  outlineWidth?: string;
  textDecoration?: string;
  textUnderlinePosition?: string;
  gutterIconPath?: string | Uri;
  gutterIconSize?: string;
  overviewRulerColor?: string | ThemeColor;
  overviewRulerLane?: OverviewRulerLane;
  light?: DecorationRenderOptions;
  dark?: DecorationRenderOptions;
}

export interface ThemeColor {
  id: string;
}

export interface MarkedString {
  language: string;
  value: string;
}

export interface SnippetString {
  value: string;
  appendText(string: string): SnippetString;
  appendTabstop(number?: number): SnippetString;
  appendPlaceholder(value: string | ((snippet: SnippetString) => any), number?: number): SnippetString;
  appendVariable(name: string, defaultValue: string | ((snippet: SnippetString) => any)): SnippetString;
}

export interface EnvironmentVariableCollection {
  persistent: boolean;
  replace(variable: string, value: string): void;
  append(variable: string, value: string): void;
  prepend(variable: string, value: string): void;
  delete(variable: string): void;
  forEach(callback: (variable: string, value: string, collection: EnvironmentVariableCollection) => any, thisArg?: any): void;
  clear(): void;
  get(variable: string): string | undefined;
}

export interface SecretStorage {
  get(key: string): Promise<string | undefined>;
  store(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  onDidChange: Event<SecretStorageChangeEvent>;
}

export interface SecretStorageChangeEvent {
  readonly key: string;
}

export interface Extension<T> {
  readonly id: string;
  readonly extensionPath: string;
  readonly isActive: boolean;
  readonly packageJSON: any;
  readonly extensionKind: ExtensionKind;
  readonly exports: T;
  activate(): Promise<T>;
}

export interface ExtensionKind {
  UI: 1;
  Workspace: 2;
}

export interface ExtensionRuntime {
  readonly version: string;
  readonly name: string;
}

export enum ExtensionMode {
  Production = 1,
  Development = 2,
  Test = 3
}

export enum ViewColumn {
  One = 1,
  Two = 2,
  Three = 3,
  Four = 4,
  Five = 5,
  Six = 6,
  Seven = 7,
  Eight = 8,
  Nine = 9,
  Active = -1,
  Beside = -2
}

export enum TextEditorCursorStyle {
  Line = 1,
  Block = 2,
  Underline = 3,
  LineThin = 4,
  BlockOutline = 5,
  UnderlineThin = 6
}

export enum TextEditorLineNumbersStyle {
  Off = 0,
  On = 1,
  Relative = 2,
  Interval = 3
}

export enum TextEditorWordWrapStyle {
  Off = 0,
  On = 1,
  WordWrapColumn = 2,
  Bounded = 3
}

export enum TextEditorFoldingStrategy {
  Auto = 'auto',
  Indentation = 'indentation'
}

export enum TextEditorRevealType {
  Default = 0,
  InCenter = 1,
  InCenterIfOutsideViewport = 2,
  AtTop = 3
}

export enum OverviewRulerLane {
  Left = 1,
  Center = 2,
  Right = 4,
  Full = 7
}

export enum EndOfLine {
  LF = 1,
  CRLF = 2
}

export interface TextEditorFindOptions {
  searchString: string;
  replaceString: string;
  isRegex: boolean;
  matchCase: boolean;
  matchWholeWord: boolean;
  preserveCase: boolean;
}

export interface TextEditorStickyScrollOptions {
  enabled: boolean;
  defaultNumberOfLines: number;
  maxLineCount: number;
}

export interface ThemableDecorationAttachmentRenderOptions {
  contentText?: string;
  contentIconPath?: string | Uri;
  border?: string;
  borderColor?: string | ThemeColor;
  fontStyle?: string;
  fontWeight?: string;
  textDecoration?: string;
  color?: string | ThemeColor;
  backgroundColor?: string | ThemeColor;
  margin?: string;
  width?: string;
  height?: string;
}

// 其他必要的类型定义
export interface CompletionItem {
  label: string;
  kind?: any;
  detail?: string;
  documentation?: string | MarkdownString;
  sortText?: string;
  filterText?: string;
  insertText?: string | SnippetString;
  range?: Range;
  commitCharacters?: string[];
  keepWhitespace?: boolean;
  preselect?: boolean;
  command?: any;
  additionalTextEdits?: TextEdit[];
  textEdit?: TextEdit;
  insertTextFormat?: any;
}

export interface CompletionList {
  items: CompletionItem[];
  isIncomplete?: boolean;
}

export interface Hover {
  contents: MarkedString | MarkedString[];
  range?: Range;
}

export interface SignatureHelp {
  signatures: SignatureInformation[];
  activeSignature: number;
  activeParameter: number;
}

export interface SignatureInformation {
  label: string;
  documentation?: string | MarkedString;
  parameters?: ParameterInformation[];
  activeParameter?: number;
}

export interface ParameterInformation {
  label: string | [number, number];
  documentation?: string | MarkedString;
}

export interface Definition {
  uri: Uri;
  range: Range;
}

export interface Location {
  uri: Uri;
  range: Range;
}

export interface DocumentHighlight {
  range: Range;
  kind?: any;
}

export interface SymbolInformation {
  name: string;
  containerName?: string;
  kind: any;
  location: Location;
  tags?: any[];
}

export interface CodeAction {
  title: string;
  kind?: any;
  isPreferred?: boolean;
  edit?: WorkspaceEdit;
  command?: any;
  diagnostics?: Diagnostic[];
}

export interface CodeLens {
  range: Range;
  command?: any;
  isResolved?: boolean;
}

export interface DocumentLink {
  range: Range;
  target?: Uri;
  tooltip?: string;
}

export interface ColorInformation {
  range: Range;
  color: any;
}

export interface ColorPresentation {
  label: string;
  textEdit?: TextEdit;
  additionalTextEdits?: TextEdit[];
}

export interface FoldingRange {
  start: number;
  end: number;
  kind?: any;
}

export interface SelectionRange {
  range: Range;
  parent?: SelectionRange;
}

export interface CallHierarchyItem {
  name: string;
  kind: any;
  tags?: any[];
  detail?: string;
  uri: Uri;
  range: Range;
  selectionRange: Range;
}

export interface TypeHierarchyItem {
  name: string;
  kind: any;
  tags?: any[];
  detail?: string;
  uri: Uri;
  range: Range;
  selectionRange: Range;
}

export interface InlineValue {
  range: Range;
  text: string;
}

export interface InlineValueContext {
  frameId: number;
  stoppedLocation: Range;
}

export interface InlineValueVariableLookup extends InlineValue {
  variableName: string;
  caseSensitiveLookup: boolean;
}

export interface InlineValueEvaluatableExpression extends InlineValue {
  expression: string;
}

export interface InlineValueText extends InlineValue {
  text: string;
}

export interface Diagnostic {
  range: Range;
  message: string;
  severity?: any;
  source?: string;
  code?: string | number;
  tags?: any[];
  relatedInformation?: DiagnosticRelatedInformation[];
}

export interface DiagnosticRelatedInformation {
  location: Location;
  message: string;
}

export interface WorkspaceEdit {
  edits: any[];
  rejectReason?: string;
}

export interface CancellationToken {
  isCancellationRequested: boolean;
  onCancellationRequested: Event<any>;
}

export type ProviderResult<T> = T | undefined | null | Thenable<T | undefined | null>;

export interface TextEdit {
  range: Range;
  newText: string;
}

export interface MarkdownString {
  value: string;
  isTrusted?: boolean;
  supportThemeIcons?: boolean;
  supportHtml?: boolean;
  baseUri?: Uri;
}

export interface DocumentSymbol {
  name: string;
  detail?: string;
  kind: any;
  tags?: any[];
  containerName?: string;
  range: Range;
  selectionRange: Range;
  children?: DocumentSymbol[];
}

export interface SemanticTokens {
  resultId?: string;
  data: number[];
}

export interface SemanticTokensLegend {
  tokenTypes: string[];
  tokenModifiers: string[];
}

export class CancellationError extends Error {
  constructor() {
    super('Operation was cancelled');
    this.name = 'CancellationError';
  }
}

export type Thenable<T> = Promise<T>;