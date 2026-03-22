/**
 * Compatibility wrapper for file icons.
 * Uses the internal SVG icon system instead of external icon assets.
 */

import React from 'react';
import { Icon } from '../Icons/Icon';

export interface MaterialFileIconProps {
  fileName?: string;
  folderName?: string;
  isFolder?: boolean;
  isOpen?: boolean;
  language?: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

const CODE_EXTENSIONS = new Set([
  'js', 'jsx', 'ts', 'tsx', 'json', 'html', 'css', 'scss', 'sass', 'less', 'xml', 'yaml', 'yml',
  'toml', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd', 'c', 'cpp', 'h', 'hpp', 'cs', 'rb',
  'php', 'swift', 'kt', 'dart', 'sql', 'prisma', 'graphql', 'gql', 'proto', 'tf', 'java', 'go',
  'rs', 'py', 'vue',
]);

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a']);

function getExtension(fileName: string): string {
  const segments = fileName.split('.');
  if (segments.length < 2) {
    return '';
  }
  return segments[segments.length - 1].toLowerCase();
}

function resolveFileIconName(fileName: string, language?: string): string {
  const extension = language?.toLowerCase() || getExtension(fileName);

  if (extension === 'md') {
    return 'file-document';
  }
  if (extension === 'pdf') {
    return 'file-document';
  }
  if (IMAGE_EXTENSIONS.has(extension)) {
    return 'file-image';
  }
  if (VIDEO_EXTENSIONS.has(extension)) {
    return 'file-video';
  }
  if (AUDIO_EXTENSIONS.has(extension)) {
    return 'file-audio';
  }
  if (CODE_EXTENSIONS.has(extension)) {
    return 'file-code';
  }

  return 'file';
}

export const MaterialFileIcon: React.FC<MaterialFileIconProps> = ({
  fileName,
  folderName,
  isFolder = false,
  isOpen = false,
  language,
  size = 16,
  className = '',
  style = {},
}) => {
  const iconName = isFolder
    ? (isOpen ? 'folder-open' : 'folder')
    : resolveFileIconName(fileName || folderName || '', language);

  return <Icon name={iconName} size={size} className={className} style={style} />;
};

export default MaterialFileIcon;
