/**
 * 插件注册表骨架实现。
 */

import type { ExtensionManifest } from '@note-studio/extension-api';
import type { ExtensionActivationEvent, ExtensionLifecycleState } from '@note-studio/shared';
import { ExtensionRuntimeError } from '../errors/ExtensionRuntimeError';
import { hasActivationEvent } from '../lifecycle/activation';
import { normalizeManifest } from '../manifest/normalizeManifest';
import type { ExtensionRuntimeDescriptor } from '../types/runtime';

export interface ExtensionRegistrationInput {
  readonly manifest: ExtensionManifest;
  readonly manifestPath: string;
  readonly entryFile: string;
  readonly rootDirectory: string;
}

export class ExtensionRegistry {
  private readonly entries = new Map<string, ExtensionRuntimeDescriptor>();

  public register(input: ExtensionRegistrationInput): ExtensionRuntimeDescriptor {
    const manifest = normalizeManifest(input.manifest);

    if (this.entries.has(manifest.id)) {
      throw new ExtensionRuntimeError(
        'EXTENSION_DUPLICATE_ID',
        `Duplicate extension id: ${manifest.id}`,
      );
    }

    const descriptor: ExtensionRuntimeDescriptor = {
      manifest,
      manifestPath: input.manifestPath,
      entryFile: input.entryFile,
      rootDirectory: input.rootDirectory,
      state: 'registered',
    };

    this.entries.set(manifest.id, descriptor);
    return descriptor;
  }

  public list(): readonly ExtensionRuntimeDescriptor[] {
    return Array.from(this.entries.values());
  }

  public getById(extensionId: string): ExtensionRuntimeDescriptor | undefined {
    return this.entries.get(extensionId);
  }

  public clear(): void {
    this.entries.clear();
  }

  public updateState(
    extensionId: string,
    state: ExtensionLifecycleState,
  ): ExtensionRuntimeDescriptor {
    const descriptor = this.entries.get(extensionId);

    if (!descriptor) {
      throw new ExtensionRuntimeError(
        'EXTENSION_NOT_FOUND',
        `Extension not found: ${extensionId}`,
      );
    }

    const nextDescriptor: ExtensionRuntimeDescriptor = {
      ...descriptor,
      state,
    };

    this.entries.set(extensionId, nextDescriptor);
    return nextDescriptor;
  }

  public findByActivationEvent(
    activationEvent: ExtensionActivationEvent,
  ): readonly ExtensionRuntimeDescriptor[] {
    return this.list().filter((descriptor) =>
      hasActivationEvent(descriptor.manifest, activationEvent),
    );
  }
}
