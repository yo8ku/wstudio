/**
 * Minimal DOM shim for main-process plugin loading.
 * It intentionally supports the subset of DOM APIs required by the plugin SDK and React plugin mounting.
 */

type HostNode = HostElement | HostDocumentFragment | HostCharacterData | string;

type HostEventListener = (event: HostEvent) => void;
type HostMutationListener = () => void;
type HostElementEventRequest = {
  readonly type: string;
  readonly key?: string;
  readonly clientX?: number;
  readonly clientY?: number;
  readonly button?: number;
  readonly elementX?: number;
  readonly elementY?: number;
  readonly deltaX?: number;
  readonly deltaY?: number;
  readonly surfaceWidth?: number;
  readonly surfaceHeight?: number;
  readonly value?: string;
  readonly checked?: boolean;
  readonly dataTransferTypes?: readonly string[];
  readonly dataTransferText?: string;
  readonly dataTransferUriList?: string;
  readonly dataTransferWorkspaceFilePath?: string;
};
type HostDataTransferInit = {
  readonly types?: readonly string[];
  readonly text?: string;
  readonly uriList?: string;
  readonly workspaceFilePath?: string;
};

const hostMutationObservers = new WeakMap<HostElement, Set<HostMutationListener>>();
const pendingHostMutationListeners = new Set<HostMutationListener>();
let hostMutationFlushScheduled = false;
let nextHostRuntimeNodeId = 0;
let activeHostPointerCapture:
  | {
    readonly element: HostElement;
    readonly pointerId: number;
  }
  | null = null;

const PLUGIN_RUNTIME_NODE_ID_ATTRIBUTE = 'data-plugin-runtime-node-id';

function scheduleHostMutationListener(listener: HostMutationListener): void {
  pendingHostMutationListeners.add(listener);

  if (hostMutationFlushScheduled) {
    return;
  }

  hostMutationFlushScheduled = true;
  queueMicrotask(() => {
    hostMutationFlushScheduled = false;
    const listeners = [...pendingHostMutationListeners];
    pendingHostMutationListeners.clear();

    for (const currentListener of listeners) {
      currentListener();
    }
  });
}

function emitHostMutation(node: HostElement | HostCharacterData | null): void {
  let currentElement: HostElement | null = node instanceof HostElement
    ? node
    : node?.parentElement ?? null;
  const notifiedListeners = new Set<HostMutationListener>();

  while (currentElement !== null) {
    const listeners = hostMutationObservers.get(currentElement);

    if (listeners !== undefined) {
      for (const listener of listeners) {
        if (notifiedListeners.has(listener)) {
          continue;
        }

        notifiedListeners.add(listener);
        scheduleHostMutationListener(listener);
      }
    }

    currentElement = currentElement.parentElement;
  }
}

function toDatasetKey(attributeName: string): string {
  return attributeName
    .replace(/^data-/, '')
    .replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function isCharacterData(node: HostNode): node is HostCharacterData {
  return node instanceof HostCharacterData;
}

function stringifyNodeText(node: HostNode): string {
  if (typeof node === 'string') {
    return node;
  }

  if (isCharacterData(node)) {
    return node.textContent;
  }

  return node.textContent ?? '';
}

class HostDataTransfer {
  public types: readonly string[];
  public dropEffect = 'copy';
  public effectAllowed = 'copy';

  private readonly values = new Map<string, string>();

  public constructor(init: HostDataTransferInit) {
    this.types = [...(init.types ?? [])];
    this.setSnapshotValue('text/plain', init.text);
    this.setSnapshotValue('text/uri-list', init.uriList);
    this.setSnapshotValue('application/x-note-studio-file-path', init.workspaceFilePath);
  }

  public getData(format: string): string {
    return this.values.get(format) ?? '';
  }

  public setData(format: string, data: string): void {
    this.values.set(format, data);

    if (!this.types.includes(format)) {
      this.types = [...this.types, format];
    }
  }

  public clearData(format?: string): void {
    if (format === undefined) {
      this.values.clear();
      this.types = [];
      return;
    }

    this.values.delete(format);
    this.types = this.types.filter((type) => type !== format);
  }

  private setSnapshotValue(format: string, value: string | undefined): void {
    if (value === undefined) {
      return;
    }

    this.setData(format, value);
  }
}

class HostEvent {
  public readonly type: string;
  public readonly target: HostElement | HostDocument | null;
  public currentTarget: HostElement | HostDocument | null;
  public readonly key?: string;
  public readonly clientX: number;
  public readonly clientY: number;
  public readonly button: number;
  public readonly elementX: number;
  public readonly elementY: number;
  public readonly deltaX: number;
  public readonly deltaY: number;
  public readonly surfaceWidth: number;
  public readonly surfaceHeight: number;
  public readonly dataTransfer: HostDataTransfer | null;
  public defaultPrevented = false;

  public constructor(
    type: string,
    target: HostElement | HostDocument | null,
    init?: {
      readonly key?: string;
      readonly clientX?: number;
      readonly clientY?: number;
      readonly button?: number;
      readonly elementX?: number;
      readonly elementY?: number;
      readonly deltaX?: number;
      readonly deltaY?: number;
      readonly surfaceWidth?: number;
      readonly surfaceHeight?: number;
      readonly dataTransfer?: HostDataTransferInit;
    },
  ) {
    this.type = type;
    this.target = target;
    this.currentTarget = target;
    this.key = init?.key;
    this.clientX = init?.clientX ?? 0;
    this.clientY = init?.clientY ?? 0;
    this.button = init?.button ?? 0;
    this.elementX = init?.elementX ?? 0;
    this.elementY = init?.elementY ?? 0;
    this.deltaX = init?.deltaX ?? 0;
    this.deltaY = init?.deltaY ?? 0;
    this.surfaceWidth = init?.surfaceWidth ?? 0;
    this.surfaceHeight = init?.surfaceHeight ?? 0;
    this.dataTransfer = init?.dataTransfer === undefined ? null : new HostDataTransfer(init.dataTransfer);
  }

  public preventDefault(): void {
    this.defaultPrevented = true;
  }

  public stopPropagation(): void {
    return undefined;
  }
}

class HostClassList {
  private readonly classes = new Set<string>();

  public constructor(private readonly owner: HostElement) {}

  public add(...tokens: string[]): void {
    for (const token of tokens) {
      if (token.trim().length > 0) {
        this.classes.add(token.trim());
      }
    }

    this.syncOwner();
  }

  public remove(...tokens: string[]): void {
    for (const token of tokens) {
      this.classes.delete(token.trim());
    }

    this.syncOwner();
  }

  public contains(token: string): boolean {
    return this.classes.has(token.trim());
  }

  public toggle(token: string, force?: boolean): boolean {
    if (force === true) {
      this.classes.add(token);
      this.syncOwner();
      return true;
    }

    if (force === false) {
      this.classes.delete(token);
      this.syncOwner();
      return false;
    }

    if (this.classes.has(token)) {
      this.classes.delete(token);
      this.syncOwner();
      return false;
    }

    this.classes.add(token);
    this.syncOwner();
    return true;
  }

  public set(value: string): void {
    this.classes.clear();

    for (const token of value.split(/\s+/)) {
      if (token.trim().length > 0) {
        this.classes.add(token.trim());
      }
    }

    this.syncOwner();
  }

  public toString(): string {
    return [...this.classes].join(' ');
  }

  private syncOwner(): void {
    this.owner.className = this.toString();
    emitHostMutation(this.owner);
  }
}

abstract class HostCharacterData {
  public parentElement: HostElement | null = null;
  public isConnected = false;

  protected constructor(
    public readonly ownerDocument: HostDocument,
    public readonly nodeType: 3 | 8,
    public readonly nodeName: '#text' | '#comment',
    private value: string,
  ) {}

  public get parentNode(): HostElement | null {
    return this.parentElement;
  }

  public get data(): string {
    return this.value;
  }

  public set data(value: string) {
    this.value = value;
    emitHostMutation(this);
  }

  public get nodeValue(): string {
    return this.value;
  }

  public set nodeValue(value: string) {
    this.value = value;
    emitHostMutation(this);
  }

  public get textContent(): string {
    return this.nodeType === 3 ? this.value : '';
  }

  public set textContent(value: string) {
    this.value = value;
    emitHostMutation(this);
  }

  public remove(): void {
    this.parentElement?.removeChild(this);
  }

  public abstract cloneNode(): HostCharacterData;
}

class HostTextNode extends HostCharacterData {
  public constructor(ownerDocument: HostDocument, value: string) {
    super(ownerDocument, 3, '#text', value);
  }

  public override cloneNode(): HostTextNode {
    return new HostTextNode(this.ownerDocument, this.data);
  }
}

class HostCommentNode extends HostCharacterData {
  public constructor(ownerDocument: HostDocument, value: string) {
    super(ownerDocument, 8, '#comment', value);
  }

  public override cloneNode(): HostCommentNode {
    return new HostCommentNode(this.ownerDocument, this.data);
  }
}

function cloneHostNode(node: HostNode): HostNode {
  if (typeof node === 'string') {
    return node;
  }

  if (node instanceof HostDocumentFragment) {
    return node.cloneNode();
  }

  if (isCharacterData(node)) {
    return node.cloneNode();
  }

  return node.cloneNode(true);
}

function expandInsertionNodes(nodes: readonly HostNode[]): HostNode[] {
  const result: HostNode[] = [];

  for (const node of nodes) {
    if (node instanceof HostDocumentFragment) {
      const fragmentChildren = [...node.childNodes];
      node.replaceChildren();
      result.push(...expandInsertionNodes(fragmentChildren));
      continue;
    }

    result.push(node);
  }

  return result;
}

class HostDocumentFragment {
  public readonly nodeType = 11;
  public readonly nodeName = '#document-fragment';
  public readonly childNodes: HostNode[] = [];

  public constructor(public readonly ownerDocument: HostDocument) {}

  public append(...nodes: HostNode[]): void {
    this.childNodes.push(...expandInsertionNodes(nodes));
  }

  public appendChild<TNode extends HostNode>(node: TNode): TNode {
    this.append(node);
    return node;
  }

  public replaceChildren(...nodes: HostNode[]): void {
    this.childNodes.length = 0;
    this.childNodes.push(...expandInsertionNodes(nodes));
  }

  public get textContent(): string {
    return this.childNodes.map(stringifyNodeText).join('');
  }

  public cloneNode(): HostDocumentFragment {
    const fragment = new HostDocumentFragment(this.ownerDocument);
    fragment.append(...this.childNodes.map(cloneHostNode));
    return fragment;
  }
}

class HostElement {
  public readonly nodeType = 1;
  public readonly childNodes: HostNode[] = [];
  public readonly dataset: Record<string, string>;
  public readonly style: Record<string, string>;
  public readonly classList: HostClassList;
  public parentElement: HostElement | null = null;
  public className = '';
  public hidden = false;
  public isConnected = false;
  public title = '';
  public tabIndex = 0;
  public scrollTop = 0;
  public scrollLeft = 0;
  public value = '';
  public type = '';
  public checked = false;
  public disabled = false;
  public role = '';
  public readonly runtimeNodeId: string;

  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Set<HostEventListener>>();

  public constructor(
    tagName: string,
    public readonly ownerDocument: HostDocument,
    public readonly namespaceURI = 'http://www.w3.org/1999/xhtml',
  ) {
    this.tagName = tagName.toUpperCase();
    nextHostRuntimeNodeId += 1;
    this.runtimeNodeId = `plugin-runtime-node-${nextHostRuntimeNodeId}`;
    this.classList = new HostClassList(this);
    this.dataset = new Proxy<Record<string, string>>({}, {
      set: (target, property, value): boolean => {
        target[String(property)] = String(value);
        emitHostMutation(this);
        return true;
      },
      deleteProperty: (target, property): boolean => {
        delete target[String(property)];
        emitHostMutation(this);
        return true;
      },
    });
    this.style = new Proxy<Record<string, string>>({}, {
      set: (target, property, value): boolean => {
        target[String(property)] = String(value);
        emitHostMutation(this);
        return true;
      },
      deleteProperty: (target, property): boolean => {
        delete target[String(property)];
        emitHostMutation(this);
        return true;
      },
    });
  }

  public readonly tagName: string;

  public get nodeName(): string {
    return this.tagName;
  }

  public get parentNode(): HostElement | null {
    return this.parentElement;
  }

  public get firstChild(): HostNode | null {
    return this.childNodes[0] ?? null;
  }

  public get lastChild(): HostNode | null {
    return this.childNodes[this.childNodes.length - 1] ?? null;
  }

  public append(...nodes: HostNode[]): void {
    const normalizedNodes = expandInsertionNodes(nodes);

    for (const node of normalizedNodes) {
      this.attachNode(node);
      this.childNodes.push(node);
    }

    emitHostMutation(this);
  }

  public appendChild<TNode extends HostNode>(node: TNode): TNode {
    this.append(node);
    return node;
  }

  public insertBefore<TNode extends HostNode>(node: TNode, referenceNode: HostNode | null): TNode {
    const normalizedNodes = expandInsertionNodes([node]);

    if (referenceNode === null) {
      this.append(...normalizedNodes);
      return node;
    }

    const referenceIndex = this.childNodes.indexOf(referenceNode);

    if (referenceIndex === -1) {
      this.append(...normalizedNodes);
      return node;
    }

    let insertIndex = referenceIndex;

    for (const normalizedNode of normalizedNodes) {
      this.attachNode(normalizedNode);
      this.childNodes.splice(insertIndex, 0, normalizedNode);
      insertIndex += 1;
    }

    emitHostMutation(this);

    return node;
  }

  public replaceChildren(...nodes: HostNode[]): void {
    for (const child of this.childNodes) {
      this.detachNode(child);
    }

    this.childNodes.length = 0;
    this.append(...nodes);
    emitHostMutation(this);
  }

  public replaceWith(...nodes: HostNode[]): void {
    if (this.parentElement === null) {
      return;
    }

    const parent = this.parentElement;
    const siblings = parent.childNodes;
    const index = siblings.indexOf(this);

    if (index === -1) {
      return;
    }

    const normalizedNodes = expandInsertionNodes(nodes);
    siblings.splice(index, 1, ...normalizedNodes);
    for (const node of normalizedNodes) {
      if (node instanceof HostElement) {
        node.parentElement = parent;
        continue;
      }

      if (isCharacterData(node)) {
        node.parentElement = parent;
      }
    }

    parent.syncChildren();
    this.parentElement = null;
    this.isConnected = false;
    emitHostMutation(parent);
  }

  public remove(): void {
    if (this.parentElement === null) {
      return;
    }

    const siblings = this.parentElement.childNodes;
    const index = siblings.indexOf(this);

    if (index !== -1) {
      siblings.splice(index, 1);
      this.parentElement.syncChildren();
      emitHostMutation(this.parentElement);
    }

    this.parentElement = null;
    this.isConnected = false;
  }

  public removeChild<TNode extends HostNode>(node: TNode): TNode {
    const index = this.childNodes.indexOf(node);

    if (index !== -1) {
      this.childNodes.splice(index, 1);
      this.detachNode(node);
      emitHostMutation(this);
    }

    return node;
  }

  public setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);

    if (name === 'class') {
      this.classList.set(value);
      return;
    }

    if (name === 'role') {
      this.role = value;
    }

    if (name.startsWith('data-')) {
      this.dataset[toDatasetKey(name)] = value;
      return;
    }

    emitHostMutation(this);
  }

  public getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  public removeAttribute(name: string): void {
    this.attributes.delete(name);

    if (name === 'class') {
      this.classList.set('');
      return;
    }

    if (name === 'role') {
      this.role = '';
    }

    if (name.startsWith('data-')) {
      delete this.dataset[toDatasetKey(name)];
      return;
    }

    emitHostMutation(this);
  }

  public hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  public getAttributeEntries(): readonly (readonly [string, string])[] {
    return [...this.attributes.entries()];
  }

  public addEventListener(type: string, listener: HostEventListener): void {
    const listeners = this.listeners.get(type);

    if (listeners === undefined) {
      this.listeners.set(type, new Set([listener]));
      return;
    }

    listeners.add(listener);
  }

  public removeEventListener(type: string, listener: HostEventListener): void {
    const listeners = this.listeners.get(type);

    if (listeners === undefined) {
      return;
    }

    listeners.delete(listener);

    if (listeners.size === 0) {
      this.listeners.delete(type);
    }
  }

  public dispatchEvent(event: HostEvent): boolean {
    event.currentTarget = this;
    const listeners = this.listeners.get(event.type);

    if (listeners !== undefined) {
      for (const listener of [...listeners]) {
        listener(event);
      }
    }

    return !event.defaultPrevented;
  }

  public click(): void {
    this.dispatchEvent(new HostEvent('click', this));
  }

  public setPointerCapture(pointerId: number): void {
    activeHostPointerCapture = {
      element: this,
      pointerId,
    };
  }

  public releasePointerCapture(pointerId: number): void {
    if (
      activeHostPointerCapture?.element === this
      && activeHostPointerCapture.pointerId === pointerId
    ) {
      activeHostPointerCapture = null;
    }
  }

  public hasPointerCapture(pointerId: number): boolean {
    return (
      activeHostPointerCapture?.element === this
      && activeHostPointerCapture.pointerId === pointerId
    );
  }

  public querySelector<TElement extends HostElement>(selector: string): TElement | null {
    const allMatches = this.querySelectorAll<TElement>(selector);
    return allMatches.length > 0 ? allMatches[0] : null;
  }

  public querySelectorAll<TElement extends HostElement>(selector: string): TElement[] {
    const matches: TElement[] = [];
    const matcher = createSelectorMatcher(selector);

    const visit = (node: HostNode): void => {
      if (!(node instanceof HostElement)) {
        return;
      }

      if (matcher(node)) {
        matches.push(node as TElement);
      }

      for (const child of node.childNodes) {
        visit(child);
      }
    };

    for (const child of this.childNodes) {
      visit(child);
    }

    return matches;
  }

  public get children(): HostElement[] {
    return this.childNodes.filter((node): node is HostElement => node instanceof HostElement);
  }

  public contains(candidate: HostNode): boolean {
    if (candidate === this) {
      return true;
    }

    for (const child of this.childNodes) {
      if (child === candidate) {
        return true;
      }

      if (child instanceof HostElement && child.contains(candidate)) {
        return true;
      }
    }

    return false;
  }

  public focus(): void {
    return undefined;
  }

  public blur(): void {
    return undefined;
  }

  public cloneNode(deep = false): HostElement {
    const clone = this.tagName === 'SVG'
      ? new HostSVGSVGElement(this.ownerDocument)
      : this.tagName === 'IFRAME'
        ? new HostHTMLIFrameElement(this.ownerDocument)
        : new HostElement(this.tagName.toLowerCase(), this.ownerDocument, this.namespaceURI);

    clone.className = this.className;
    clone.hidden = this.hidden;
    clone.title = this.title;
    clone.tabIndex = this.tabIndex;
    clone.scrollTop = this.scrollTop;
    clone.scrollLeft = this.scrollLeft;
    clone.value = this.value;
    clone.type = this.type;
    clone.checked = this.checked;
    clone.disabled = this.disabled;
    clone.role = this.role;

    for (const [name, value] of this.attributes.entries()) {
      clone.setAttribute(name, value);
    }

    if (deep) {
      clone.append(...this.childNodes.map(cloneHostNode));
    }

    return clone;
  }

  public get textContent(): string {
    return this.childNodes.map(stringifyNodeText).join('');
  }

  public set textContent(value: string) {
    this.replaceChildren(value);
  }

  private attachNode(node: HostNode): void {
    if (typeof node === 'string') {
      return;
    }

    if (node instanceof HostElement) {
      node.parentElement?.removeChild(node);
      node.parentElement = this;
      node.isConnected = this.isConnected;
      node.syncChildren();
      return;
    }

    if (isCharacterData(node)) {
      node.parentElement?.removeChild(node);
      node.parentElement = this;
      node.isConnected = this.isConnected;
    }
  }

  private detachNode(node: HostNode): void {
    if (node instanceof HostElement) {
      node.parentElement = null;
      node.isConnected = false;
      node.syncChildren();
      return;
    }

    if (isCharacterData(node)) {
      node.parentElement = null;
      node.isConnected = false;
    }
  }

  private syncChildren(): void {
    const connected = this.parentElement !== null ? this.parentElement.isConnected : this.isConnected;

    for (const child of this.childNodes) {
      if (child instanceof HostElement) {
        child.isConnected = connected;
        child.syncChildren();
        continue;
      }

      if (isCharacterData(child)) {
        child.isConnected = connected;
      }
    }
  }
}

class HostHTMLIFrameElement extends HostElement {
  public constructor(ownerDocument: HostDocument) {
    super('iframe', ownerDocument);
  }
}

class HostSVGSVGElement extends HostElement {
  public constructor(ownerDocument: HostDocument) {
    super('svg', ownerDocument, 'http://www.w3.org/2000/svg');
  }
}

class HostDocument {
  public readonly nodeType = 9;
  public readonly nodeName = '#document';
  public readonly body: HostElement;
  public readonly documentElement: HostElement;
  private readonly listeners = new Map<string, Set<HostEventListener>>();

  public constructor() {
    this.body = new HostElement('body', this);
    this.body.isConnected = true;
    this.documentElement = this.body;
  }

  public get activeElement(): HostElement {
    return this.body;
  }

  public createElement(tagName: string): HostElement {
    if (tagName.toLowerCase() === 'svg') {
      return new HostSVGSVGElement(this);
    }

    if (tagName.toLowerCase() === 'iframe') {
      return new HostHTMLIFrameElement(this);
    }

    return new HostElement(tagName, this);
  }

  public createElementNS(namespaceUri: string, tagName: string): HostElement {
    if (namespaceUri === 'http://www.w3.org/2000/svg' || tagName.toLowerCase() === 'svg') {
      return new HostSVGSVGElement(this);
    }

    return this.createElement(tagName);
  }

  public createDocumentFragment(): HostDocumentFragment {
    return new HostDocumentFragment(this);
  }

  public createTextNode(value: string): HostTextNode {
    return new HostTextNode(this, value);
  }

  public createComment(value: string): HostCommentNode {
    return new HostCommentNode(this, value);
  }

  public addEventListener(type: string, listener: HostEventListener): void {
    const listeners = this.listeners.get(type);

    if (listeners === undefined) {
      this.listeners.set(type, new Set([listener]));
      return;
    }

    listeners.add(listener);
  }

  public removeEventListener(type: string, listener: HostEventListener): void {
    const listeners = this.listeners.get(type);

    if (listeners === undefined) {
      return;
    }

    listeners.delete(listener);

    if (listeners.size === 0) {
      this.listeners.delete(type);
    }
  }

  public dispatchEvent(event: HostEvent): boolean {
    event.currentTarget = this;
    const listeners = this.listeners.get(event.type);

    if (listeners !== undefined) {
      for (const listener of [...listeners]) {
        listener(event);
      }
    }

    return !event.defaultPrevented;
  }

  public querySelector<TElement extends HostElement>(selector: string): TElement | null {
    return this.body.querySelector(selector);
  }

  public querySelectorAll<TElement extends HostElement>(selector: string): TElement[] {
    return this.body.querySelectorAll(selector);
  }
}

class HostDOMParser {
  public parseFromString(source: string, mimeType: string): object {
    if (mimeType === 'image/svg+xml') {
      return {
        documentElement: new HostSVGSVGElement(new HostDocument()),
      };
    }

    const document = new HostDocument();
    const body = document.body;
    body.textContent = source;

    return {
      body,
      documentElement: body,
    };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function serializeStyleAttribute(style: Record<string, string>, hidden: boolean): string | null {
  const entries = Object.entries(style)
    .filter(([, currentValue]) => currentValue.trim().length > 0)
    .map(([key, currentValue]) => `${toKebabCase(key)}:${currentValue.trim()}`);

  if (hidden) {
    entries.push('display:none');
  }

  return entries.length === 0 ? null : entries.join(';');
}

function serializeHostNodeToHtml(node: HostNode): string {
  if (typeof node === 'string') {
    return escapeHtml(node);
  }

  if (node instanceof HostCommentNode) {
    return `<!--${escapeHtml(node.data)}-->`;
  }

  if (node instanceof HostTextNode) {
    return escapeHtml(node.data);
  }

  if (node instanceof HostDocumentFragment) {
    return node.childNodes.map((childNode) => serializeHostNodeToHtml(childNode)).join('');
  }

  if (!(node instanceof HostElement)) {
    return '';
  }

  const tagName = node.tagName.toLowerCase();
  const attributes = new Map<string, string>();

  for (const [name, currentValue] of node.getAttributeEntries()) {
    attributes.set(name, currentValue);
  }

  attributes.set(PLUGIN_RUNTIME_NODE_ID_ATTRIBUTE, node.runtimeNodeId);

  if (node.className.trim().length > 0) {
    attributes.set('class', node.className.trim());
  }

  if (node.title.trim().length > 0) {
    attributes.set('title', node.title.trim());
  }

  if (node.role.trim().length > 0) {
    attributes.set('role', node.role.trim());
  }

  if (node.type.trim().length > 0) {
    attributes.set('type', node.type.trim());
  }

  if (tagName !== 'textarea' && node.value.length > 0) {
    attributes.set('value', node.value);
  }

  if (node.checked) {
    attributes.set('checked', 'checked');
  }

  if (node.disabled) {
    attributes.set('disabled', 'disabled');
  }

  if (node.tabIndex !== 0) {
    attributes.set('tabindex', String(node.tabIndex));
  }

  for (const [key, currentValue] of Object.entries(node.dataset)) {
    attributes.set(`data-${key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)}`, currentValue);
  }

  const styleAttribute = serializeStyleAttribute(node.style, node.hidden);
  if (styleAttribute !== null) {
    attributes.set('style', styleAttribute);
  }

  const attributeText = [...attributes.entries()]
    .map(([name, currentValue]) => ` ${name}="${escapeHtml(currentValue)}"`)
    .join('');
  const childrenHtml = tagName === 'textarea'
    ? escapeHtml(node.value)
    : node.childNodes.map((childNode) => serializeHostNodeToHtml(childNode)).join('');
  return `<${tagName}${attributeText}>${childrenHtml}</${tagName}>`;
}

function createSelectorMatcher(selector: string): (element: HostElement) => boolean {
  const trimmed = selector.trim();
  const dataAttributeMatch = /^\[data-([a-z0-9-]+)="([^"]*)"\]$/i.exec(trimmed);

  if (dataAttributeMatch !== null) {
    const datasetKey = toDatasetKey(`data-${dataAttributeMatch[1]}`);
    const expectedValue = dataAttributeMatch[2];
    return (element: HostElement): boolean => element.dataset[datasetKey] === expectedValue;
  }

  const classSelectorMatch = /^([a-z0-9]+)?(?:\.([a-z0-9_-]+))?$/i.exec(trimmed);

  if (classSelectorMatch !== null) {
    const expectedTag = classSelectorMatch[1]?.toUpperCase();
    const expectedClass = classSelectorMatch[2];

    return (element: HostElement): boolean => {
      const tagMatches = expectedTag === undefined || element.tagName === expectedTag;
      const classMatches = expectedClass === undefined
        || element.classList.contains(expectedClass)
        || element.className.split(/\s+/).some((token) => token === expectedClass);
      return tagMatches && classMatches;
    };
  }

  return (): boolean => false;
}

export function installMainProcessDomShim(): void {
  if (typeof globalThis.document !== 'undefined') {
    return;
  }

  const document = new HostDocument();

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: document as object as Document,
  });

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: globalThis as object as Window,
  });

  Object.defineProperty(globalThis, 'HTMLElement', {
    configurable: true,
    value: HostElement as object as typeof HTMLElement,
  });

  Object.defineProperty(globalThis, 'HTMLInputElement', {
    configurable: true,
    value: HostElement as object as typeof HTMLInputElement,
  });

  Object.defineProperty(globalThis, 'HTMLDivElement', {
    configurable: true,
    value: HostElement as object as typeof HTMLDivElement,
  });

  Object.defineProperty(globalThis, 'HTMLTextAreaElement', {
    configurable: true,
    value: HostElement as object as typeof HTMLTextAreaElement,
  });

  Object.defineProperty(globalThis, 'HTMLSelectElement', {
    configurable: true,
    value: HostElement as object as typeof HTMLSelectElement,
  });

  Object.defineProperty(globalThis, 'HTMLProgressElement', {
    configurable: true,
    value: HostElement as object as typeof HTMLProgressElement,
  });

  Object.defineProperty(globalThis, 'HTMLButtonElement', {
    configurable: true,
    value: HostElement as object as typeof HTMLButtonElement,
  });

  Object.defineProperty(globalThis, 'HTMLIFrameElement', {
    configurable: true,
    value: HostHTMLIFrameElement as object as typeof HTMLIFrameElement,
  });

  Object.defineProperty(globalThis, 'SVGSVGElement', {
    configurable: true,
    value: HostSVGSVGElement as object as typeof SVGSVGElement,
  });

  Object.defineProperty(globalThis, 'DocumentFragment', {
    configurable: true,
    value: HostDocumentFragment as object as typeof DocumentFragment,
  });

  Object.defineProperty(globalThis, 'Text', {
    configurable: true,
    value: HostTextNode as object as typeof Text,
  });

  Object.defineProperty(globalThis, 'Document', {
    configurable: true,
    value: HostDocument as object as typeof Document,
  });

  Object.defineProperty(globalThis, 'Comment', {
    configurable: true,
    value: HostCommentNode as object as typeof Comment,
  });

  Object.defineProperty(globalThis, 'DOMParser', {
    configurable: true,
    value: HostDOMParser as object as typeof DOMParser,
  });
}

export function dispatchHostDocumentEvent(
  type: string,
  init?: {
    readonly key?: string;
    readonly clientX?: number;
    readonly clientY?: number;
    readonly button?: number;
  },
): void {
  if (typeof globalThis.document === 'undefined') {
    return;
  }

  const currentDocument = globalThis.document as object as HostDocument;

  if (
    activeHostPointerCapture !== null
    && activeHostPointerCapture.element.isConnected
    && (type === 'mousemove' || type === 'mouseup')
  ) {
    const event = new HostEvent(type, activeHostPointerCapture.element, init);
    let currentTarget: HostElement | null = activeHostPointerCapture.element;

    while (currentTarget !== null) {
      currentTarget.dispatchEvent(event);
      currentTarget = currentTarget.parentElement;
    }

    currentDocument.dispatchEvent(event);

    if (type === 'mouseup') {
      activeHostPointerCapture = null;
    }

    return;
  }

  activeHostPointerCapture = activeHostPointerCapture?.element.isConnected === true
    ? activeHostPointerCapture
    : null;
  currentDocument.dispatchEvent(new HostEvent(type, currentDocument, init));
}

function findHostElementByRuntimeNodeId(root: HostElement, runtimeNodeId: string): HostElement | null {
  if (root.runtimeNodeId === runtimeNodeId) {
    return root;
  }

  for (const childNode of root.childNodes) {
    if (!(childNode instanceof HostElement)) {
      continue;
    }

    const matchedChild = findHostElementByRuntimeNodeId(childNode, runtimeNodeId);
    if (matchedChild !== null) {
      return matchedChild;
    }
  }

  return null;
}

export function dispatchHostElementEvent(
  root: HTMLElement,
  runtimeNodeId: string,
  request: HostElementEventRequest,
): boolean {
  const hostRoot = root as object as HostElement;
  const target = findHostElementByRuntimeNodeId(hostRoot, runtimeNodeId);

  if (target === null) {
    return false;
  }

  if (request.value !== undefined) {
    target.value = request.value;
    emitHostMutation(target);
  }

  if (request.checked !== undefined) {
    target.checked = request.checked;
    emitHostMutation(target);
  }

  const event = new HostEvent(request.type, target, {
    key: request.key,
    clientX: request.clientX,
    clientY: request.clientY,
    button: request.button,
    elementX: request.elementX,
    elementY: request.elementY,
    deltaX: request.deltaX,
    deltaY: request.deltaY,
    surfaceWidth: request.surfaceWidth,
    surfaceHeight: request.surfaceHeight,
    dataTransfer: request.dataTransferTypes === undefined
      ? undefined
      : {
        types: request.dataTransferTypes,
        text: request.dataTransferText,
        uriList: request.dataTransferUriList,
        workspaceFilePath: request.dataTransferWorkspaceFilePath,
      },
  });

  let currentTarget: HostElement | null = target;
  while (currentTarget !== null) {
    currentTarget.dispatchEvent(event);
    currentTarget = currentTarget.parentElement;
  }

  target.ownerDocument.dispatchEvent(event);
  return true;
}

export function subscribeHostElementMutations(
  root: HTMLElement,
  listener: HostMutationListener,
): () => void {
  const hostRoot = root as object as HostElement;
  const existingListeners = hostMutationObservers.get(hostRoot);

  if (existingListeners === undefined) {
    hostMutationObservers.set(hostRoot, new Set([listener]));
  } else {
    existingListeners.add(listener);
  }

  return () => {
    const listeners = hostMutationObservers.get(hostRoot);

    if (listeners === undefined) {
      return;
    }

    listeners.delete(listener);

    if (listeners.size === 0) {
      hostMutationObservers.delete(hostRoot);
    }
  };
}

export function serializeHostElementToHtml(root: HTMLElement): string {
  return serializeHostNodeToHtml(root as object as HostElement);
}
