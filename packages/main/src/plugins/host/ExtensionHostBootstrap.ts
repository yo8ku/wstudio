/**
 * 插件宿主子进程引导文件，先修正 @note-studio/* 模块解析，再加载真实宿主实现。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

interface ModuleResolverApi {
  _resolveFilename(
    request: string,
    parent: NodeJS.Module | undefined,
    isMain: boolean,
  ): string;
}

function resolveRepositoryRoot(): string {
  const possibleRoots = [
    path.resolve(__dirname, '../../../../../../..'),
    path.resolve(__dirname, '../../../../../..'),
    process.cwd(),
  ];

  for (const candidate of possibleRoots) {
    const runtimePackagePath = path.join(candidate, 'packages', 'extension-runtime', 'package.json');
    if (fs.existsSync(runtimePackagePath)) {
      return candidate;
    }
  }

  throw new Error('Unable to resolve repository root for extension host bootstrap.');
}

function patchWorkspaceModuleResolution(repositoryRoot: string): void {
  const moduleApi = require('module') as ModuleResolverApi;
  const originalResolveFilename = moduleApi._resolveFilename;

  moduleApi._resolveFilename = function resolveFilename(
    request: string,
    parent: NodeJS.Module | undefined,
    isMain: boolean,
  ): string {
    if (request.startsWith('@note-studio/')) {
      const packageName = request.slice('@note-studio/'.length).split('/')[0];
      const packagePath = path.join(repositoryRoot, 'packages', packageName);
      if (fs.existsSync(packagePath)) {
        return originalResolveFilename.call(this, packagePath, parent, isMain);
      }
    }

    return originalResolveFilename.call(this, request, parent, isMain);
  };
}

function bootstrap(): void {
  const repositoryRoot = resolveRepositoryRoot();
  patchWorkspaceModuleResolution(repositoryRoot);
  require('./ExtensionHostProcessMain');
}

bootstrap();
