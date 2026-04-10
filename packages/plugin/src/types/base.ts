/**
 * Shared foundational platform types aligned with the plugin-facing API surface.
 */

export type ConstructorArgument = string | number | boolean | bigint | symbol | object | null | undefined;

export type Constructor<TObject> = abstract new (...args: ConstructorArgument[]) => TObject;

export type Modifier = 'Mod' | 'Ctrl' | 'Meta' | 'Shift' | 'Alt';

export type PaneType = 'tab' | 'split' | 'window';

export type SplitDirection = 'vertical' | 'horizontal';

export type Side = 'left' | 'right';

export type UserEvent = MouseEvent | KeyboardEvent | TouchEvent | PointerEvent;

export interface Point {
  readonly x: number;
  readonly y: number;
}
