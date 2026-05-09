import { describe, expect, it } from 'vitest';
import type {
  PluginSurfaceRenderableNodeLike,
} from './pluginSurfaceBootstrapDocument';
import {
  buildPluginSurfaceBootstrapDocument,
  pluginSurfaceNodeHasRenderableContent,
  shouldReportPluginSurfaceRendered,
} from './pluginSurfaceBootstrapDocument';

function createElementNode(
  tagName: string,
  childNodes: readonly PluginSurfaceRenderableNodeLike[] = [],
  textContent = '',
): PluginSurfaceRenderableNodeLike {
  return {
    nodeType: 1,
    tagName,
    textContent,
    childNodes,
  };
}

function createTextNode(textContent: string): PluginSurfaceRenderableNodeLike {
  return {
    nodeType: 3,
    textContent,
    childNodes: [],
  };
}

describe('pluginSurfaceBootstrapDocument', () => {
  it('does not treat an empty host container as rendered content', () => {
    expect(pluginSurfaceNodeHasRenderableContent(createElementNode('div'))).toBe(false);
  });

  it('treats nested text content as rendered content', () => {
    const renderedTree = createElementNode('section', [
      createElementNode('h1', [createTextNode('TranscribeX')]),
    ]);

    expect(pluginSurfaceNodeHasRenderableContent(renderedTree)).toBe(true);
  });

  it('treats intrinsic renderable elements as rendered content', () => {
    expect(pluginSurfaceNodeHasRenderableContent(createElementNode('canvas'))).toBe(true);
    expect(pluginSurfaceNodeHasRenderableContent(createElementNode('transcribe-x-root'))).toBe(true);
  });

  it('does not report rendered after bootstrap has already failed', () => {
    const renderedTree = createElementNode('section', [
      createTextNode('ready'),
    ]);
    const rootNode = createElementNode('div', [renderedTree]);

    expect(shouldReportPluginSurfaceRendered({
      rendered: false,
      bootstrapFailed: true,
      rootNode,
      rootNodes: rootNode.childNodes ?? [],
      bodyNodes: [rootNode],
    })).toBe(false);
  });

  it('reports rendered when content exists outside the root container', () => {
    const rootNode = createElementNode('div');
    const portalNode = createElementNode('div', [
      createTextNode('portal content'),
    ]);

    expect(shouldReportPluginSurfaceRendered({
      rendered: false,
      bootstrapFailed: false,
      rootNode,
      rootNodes: rootNode.childNodes ?? [],
      bodyNodes: [rootNode, portalNode],
    })).toBe(true);
  });

  it('allows remote http and https iframes inside plugin surfaces', () => {
    const document = buildPluginSurfaceBootstrapDocument();

    expect(document).toContain("frame-src http: https: about: blob: data:");
  });

  it('allows plugin-safe local media URLs inside plugin surfaces', () => {
    const document = buildPluginSurfaceBootstrapDocument();

    expect(document).toContain('img-src http: https: data: blob: wstudio-extension: local-file: local-media:;');
    expect(document).toContain('media-src http: https: data: blob: wstudio-extension: local-file: local-media:;');
  });
});
