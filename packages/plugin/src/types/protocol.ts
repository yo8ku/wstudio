/**
 * Application protocol handler contracts exposed to plugins.
 */

export interface AppProtocolData {
  readonly action: string;
  readonly [key: string]: string;
}

export type AppProtocolHandler = (params: AppProtocolData) => Promise<void> | void;

export type ObsidianProtocolData = AppProtocolData;

export type ObsidianProtocolHandler = AppProtocolHandler;
