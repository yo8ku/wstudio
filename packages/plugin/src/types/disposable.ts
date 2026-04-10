/**
 * Disposable contracts used by the plugin component and registration system.
 */

export interface Disposable {
  dispose(): Promise<void> | void;
}

export interface EventRef extends Disposable {}

export type IntervalHandle = ReturnType<typeof setInterval>;

export type DisposableCallback = () => Promise<void> | void;

export type ComponentRegistration = Disposable | DisposableCallback;
