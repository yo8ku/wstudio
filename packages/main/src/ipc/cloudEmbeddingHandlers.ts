/**
 * Cloud embedding IPC handlers.
 * Provide renderer-safe access to cloud embedding configuration and actions.
 */

import { ipcMain } from 'electron';
import {
  cloudEmbeddingService,
  type CustomEmbeddingConfig,
  type EmbeddingResult,
} from '../services/CloudEmbeddingService';
import type {
  EmbeddingModelConfig,
  EmbeddingProviderConfig,
} from '../services/EmbeddingModelConfig';

interface CloudEmbeddingResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface CloudEmbeddingConnectionResult {
  success: boolean;
  message: string;
  dimensions?: number;
}

const CLOUD_EMBEDDING_CHANNELS = [
  'cloud-embedding:get-providers',
  'cloud-embedding:get-models',
  'cloud-embedding:set-api-key',
  'cloud-embedding:get-api-key',
  'cloud-embedding:set-model',
  'cloud-embedding:get-current-model',
  'cloud-embedding:generate',
  'cloud-embedding:generate-batch',
  'cloud-embedding:test-connection',
  'cloud-embedding:has-valid-api-key',
  'cloud-embedding:set-custom-config',
  'cloud-embedding:get-custom-config',
] as const;

let handlersRegistered = false;

const toErrorMessage = (error: Error | string): string => (
  error instanceof Error ? error.message : String(error)
);

const buildSuccess = <T>(data: T): CloudEmbeddingResponse<T> => ({
  success: true,
  data,
});

const buildFailure = <T>(error: Error | string): CloudEmbeddingResponse<T> => ({
  success: false,
  error: toErrorMessage(error),
});

export const registerCloudEmbeddingHandlers = (): void => {
  if (handlersRegistered) {
    return;
  }

  for (const channel of CLOUD_EMBEDDING_CHANNELS) {
    try {
      ipcMain.removeHandler(channel);
    } catch {
      // Ignore missing handlers.
    }
  }

  handlersRegistered = true;

  ipcMain.handle(
    'cloud-embedding:get-providers',
    async (): Promise<CloudEmbeddingResponse<EmbeddingProviderConfig[]>> => {
      try {
        return buildSuccess(cloudEmbeddingService.getProviders());
      } catch (error) {
        console.error('[CloudEmbedding IPC] Failed to get providers:', error);
        return buildFailure(error instanceof Error ? error : String(error));
      }
    },
  );

  ipcMain.handle(
    'cloud-embedding:get-models',
    async (): Promise<CloudEmbeddingResponse<EmbeddingModelConfig[]>> => {
      try {
        return buildSuccess(cloudEmbeddingService.getAvailableModels());
      } catch (error) {
        console.error('[CloudEmbedding IPC] Failed to get models:', error);
        return buildFailure(error instanceof Error ? error : String(error));
      }
    },
  );

  ipcMain.handle(
    'cloud-embedding:set-api-key',
    async (_event, providerId: string, apiKey: string): Promise<CloudEmbeddingResponse<void>> => {
      try {
        cloudEmbeddingService.setApiKey(providerId, apiKey);
        return buildSuccess(undefined);
      } catch (error) {
        console.error('[CloudEmbedding IPC] Failed to set API key:', error);
        return buildFailure(error instanceof Error ? error : String(error));
      }
    },
  );

  ipcMain.handle(
    'cloud-embedding:get-api-key',
    async (_event, providerId: string): Promise<CloudEmbeddingResponse<string>> => {
      try {
        return buildSuccess(cloudEmbeddingService.getApiKey(providerId) ?? '');
      } catch (error) {
        console.error('[CloudEmbedding IPC] Failed to get API key:', error);
        return buildFailure(error instanceof Error ? error : String(error));
      }
    },
  );

  ipcMain.handle(
    'cloud-embedding:set-model',
    async (_event, modelId: string): Promise<CloudEmbeddingResponse<void>> => {
      try {
        cloudEmbeddingService.setModel(modelId);
        return buildSuccess(undefined);
      } catch (error) {
        console.error('[CloudEmbedding IPC] Failed to set model:', error);
        return buildFailure(error instanceof Error ? error : String(error));
      }
    },
  );

  ipcMain.handle(
    'cloud-embedding:get-current-model',
    async (): Promise<CloudEmbeddingResponse<EmbeddingModelConfig | null>> => {
      try {
        return buildSuccess(cloudEmbeddingService.getCurrentModel() ?? null);
      } catch (error) {
        console.error('[CloudEmbedding IPC] Failed to get current model:', error);
        return buildFailure(error instanceof Error ? error : String(error));
      }
    },
  );

  ipcMain.handle(
    'cloud-embedding:generate',
    async (_event, text: string): Promise<CloudEmbeddingResponse<EmbeddingResult>> => {
      try {
        return buildSuccess(await cloudEmbeddingService.generateEmbedding(text));
      } catch (error) {
        console.error('[CloudEmbedding IPC] Failed to generate embedding:', error);
        return buildFailure(error instanceof Error ? error : String(error));
      }
    },
  );

  ipcMain.handle(
    'cloud-embedding:generate-batch',
    async (_event, texts: string[]): Promise<CloudEmbeddingResponse<EmbeddingResult>> => {
      try {
        return buildSuccess(await cloudEmbeddingService.generateBatchEmbeddings(texts));
      } catch (error) {
        console.error('[CloudEmbedding IPC] Failed to generate batch embeddings:', error);
        return buildFailure(error instanceof Error ? error : String(error));
      }
    },
  );

  ipcMain.handle(
    'cloud-embedding:test-connection',
    async (
      _event,
      providerId: string,
      apiKey: string,
      modelId?: string,
    ): Promise<CloudEmbeddingResponse<CloudEmbeddingConnectionResult>> => {
      try {
        return buildSuccess(await cloudEmbeddingService.testConnection(providerId, apiKey, modelId));
      } catch (error) {
        console.error('[CloudEmbedding IPC] Failed to test connection:', error);
        return buildFailure(error instanceof Error ? error : String(error));
      }
    },
  );

  ipcMain.handle(
    'cloud-embedding:has-valid-api-key',
    async (): Promise<CloudEmbeddingResponse<boolean>> => {
      try {
        return buildSuccess(cloudEmbeddingService.hasValidApiKey());
      } catch (error) {
        console.error('[CloudEmbedding IPC] Failed to check API key:', error);
        return buildFailure(error instanceof Error ? error : String(error));
      }
    },
  );

  ipcMain.handle(
    'cloud-embedding:set-custom-config',
    async (_event, config: CustomEmbeddingConfig): Promise<CloudEmbeddingResponse<void>> => {
      try {
        cloudEmbeddingService.setCustomConfig(config);
        return buildSuccess(undefined);
      } catch (error) {
        console.error('[CloudEmbedding IPC] Failed to set custom config:', error);
        return buildFailure(error instanceof Error ? error : String(error));
      }
    },
  );

  ipcMain.handle(
    'cloud-embedding:get-custom-config',
    async (): Promise<CloudEmbeddingResponse<CustomEmbeddingConfig | null>> => {
      try {
        return buildSuccess(cloudEmbeddingService.getCustomConfig() ?? null);
      } catch (error) {
        console.error('[CloudEmbedding IPC] Failed to get custom config:', error);
        return buildFailure(error instanceof Error ? error : String(error));
      }
    },
  );
};
