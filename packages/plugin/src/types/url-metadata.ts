/**
 * URL metadata contracts exposed by the host to plugins for safe link previews.
 */

export type UrlMetadataStatus = 'ok' | 'error';

export interface UrlMetadataRequestOptions {
  readonly forceRefresh?: boolean;
  readonly timeoutMs?: number;
}

export interface UrlMetadataResult {
  readonly url: string;
  readonly finalUrl: string;
  readonly status: UrlMetadataStatus;
  readonly statusCode: number | null;
  readonly title: string | null;
  readonly description: string | null;
  readonly siteName: string | null;
  readonly image: string | null;
  readonly favicon: string | null;
  readonly previewHtml: string | null;
  readonly errorMessage: string | null;
  readonly fetchedAt: string;
  readonly cached: boolean;
}

export interface UrlMetadataService {
  fetch(url: string, options?: UrlMetadataRequestOptions): Promise<UrlMetadataResult>;
  clearCache(url?: string): void;
}
