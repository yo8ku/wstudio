/**
 * 可调整大小的图片扩展
 * 功能：支持拖动调整图片大小、旋转、对齐
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ResizableImageComponent } from './ResizableImageComponent';

export interface ResizableImageOptions {
  inline: boolean;
  allowBase64: boolean;
  HTMLAttributes: Record<string, string>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    resizableImage: {
      setImage: (options: { 
        src: string; 
        alt?: string; 
        title?: string; 
        width?: number; 
        height?: number;
        rotation?: number;
        align?: 'left' | 'center' | 'right';
        caption?: string;
        displayStyle?: 'default' | 'link' | 'card';
      }) => ReturnType;
    };
  }
}

export const ResizableImage = Node.create<ResizableImageOptions>({
  name: 'image',
  
  addOptions() {
    return {
      inline: false,
      allowBase64: true,
      HTMLAttributes: {},
    };
  },

  inline() {
    return this.options.inline;
  },

  group() {
    return this.options.inline ? 'inline' : 'block';
  },

  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null,
      },
      alt: {
        default: null,
      },
      title: {
        default: null,
      },
      width: {
        default: null,
        parseHTML: element => {
          const width = element.getAttribute('width') || element.style.width;
          return width ? parseInt(width, 10) : null;
        },
        renderHTML: attributes => {
          if (!attributes.width) {
            return {};
          }
          return {
            width: attributes.width,
          };
        },
      },
      height: {
        default: null,
        parseHTML: element => {
          const height = element.getAttribute('height') || element.style.height;
          return height ? parseInt(height, 10) : null;
        },
        renderHTML: attributes => {
          if (!attributes.height) {
            return {};
          }
          return {
            height: attributes.height,
          };
        },
      },
      rotation: {
        default: 0,
        parseHTML: element => {
          const rotation = element.getAttribute('data-rotation');
          return rotation ? parseInt(rotation, 10) : 0;
        },
        renderHTML: attributes => {
          if (!attributes.rotation) {
            return {};
          }
          return {
            'data-rotation': attributes.rotation,
          };
        },
      },
      align: {
        default: 'left',
        parseHTML: element => {
          return element.getAttribute('data-align') || 'left';
        },
        renderHTML: attributes => {
          return {
            'data-align': attributes.align || 'left',
          };
        },
      },
      caption: {
        default: '',
        parseHTML: element => {
          return element.getAttribute('data-caption') || '';
        },
        renderHTML: attributes => {
          if (!attributes.caption) {
            return {};
          }
          return {
            'data-caption': attributes.caption,
          };
        },
      },
      displayStyle: {
        default: 'default',
        parseHTML: element => {
          return element.getAttribute('data-display-style') || 'default';
        },
        renderHTML: attributes => {
          return {
            'data-display-style': attributes.displayStyle || 'default',
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: this.options.allowBase64
          ? 'img[src]'
          : 'img[src]:not([src^="data:"])',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)];
  },

  addCommands() {
    return {
      setImage:
        options =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageComponent);
  },
});

export default ResizableImage;
