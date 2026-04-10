import React, { useEffect, useState, useSyncExternalStore } from 'react';
import {
  resolveDefaultWorkspaceFileIconSource,
  getWorkspaceFileIconThemeSnapshot,
  resolveWorkspaceFileIconSource,
  subscribeWorkspaceFileIconThemeChange,
} from '../../services/workspaceFileIconThemeState';
import './WorkspaceFileIcon.scss';

export interface WorkspaceFileIconProps {
  readonly filePath?: string | null;
  readonly name: string;
  readonly isDirectory: boolean;
  readonly expanded?: boolean;
  readonly size?: number;
  readonly className?: string;
}

function joinClassNames(...values: Array<string | undefined>): string {
  return values.filter((value): value is string => typeof value === 'string' && value.length > 0).join(' ');
}

function normalizeIconSource(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  return value.trim().length > 0 ? value : null;
}

export const WorkspaceFileIcon: React.FC<WorkspaceFileIconProps> = ({
  filePath,
  name,
  isDirectory,
  expanded = false,
  size = 16,
  className,
}) => {
  useSyncExternalStore(
    subscribeWorkspaceFileIconThemeChange,
    getWorkspaceFileIconThemeSnapshot,
    getWorkspaceFileIconThemeSnapshot,
  );

  const request = {
    filePath,
    name,
    isDirectory,
    expanded,
  };

  const primaryIconSource = normalizeIconSource(resolveWorkspaceFileIconSource(request));
  const materialFallbackIconSource = normalizeIconSource(resolveDefaultWorkspaceFileIconSource(request));
  const [primaryLoadFailed, setPrimaryLoadFailed] = useState(false);
  const [fallbackLoadFailed, setFallbackLoadFailed] = useState(false);

  useEffect(() => {
    setPrimaryLoadFailed(false);
    setFallbackLoadFailed(false);
  }, [primaryIconSource, materialFallbackIconSource]);

  const iconSource = primaryIconSource !== null && !primaryLoadFailed
    ? primaryIconSource
    : materialFallbackIconSource !== null && !fallbackLoadFailed
      ? materialFallbackIconSource
      : null;

  return (
    <span
      className={joinClassNames('workspace-file-icon', className)}
      style={{ width: `${size}px`, height: `${size}px` }}
      aria-hidden={true}
    >
      {iconSource
        ? (
          <img
            src={iconSource}
            alt=""
            draggable={false}
            onError={() => {
              if (
                iconSource === primaryIconSource
                && materialFallbackIconSource !== null
                && materialFallbackIconSource !== primaryIconSource
              ) {
                setPrimaryLoadFailed(true);
                return;
              }

              setPrimaryLoadFailed(true);
              setFallbackLoadFailed(true);
            }}
          />
        )
        : null}
    </span>
  );
};

export default WorkspaceFileIcon;
