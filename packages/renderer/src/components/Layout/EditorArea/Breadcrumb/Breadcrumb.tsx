/**
 * Breadcrumb component.
 * Shows the active file path in the editor area and reveals file in explorer on click.
 */

import React, { useCallback, useMemo } from 'react';
import { useExplorerStore } from '../../../../stores/explorerStore';
import './Breadcrumb.scss';

interface BreadcrumbProps {
  path: string;
}

const normalizePath = (value: string): string => {
  return value.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
};

const getLastSegment = (value: string): string => {
  const segments = normalizePath(value).split('/').filter(Boolean);
  return segments[segments.length - 1] || '';
};

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ path }) => {
  const workspacePath = useExplorerStore((state) => state.workspacePath);

  const segments = useMemo(() => {
    const normalizedPath = normalizePath(path || '');
    if (!normalizedPath) {
      return [] as string[];
    }

    const normalizedWorkspace = normalizePath(workspacePath || '');
    if (
      normalizedWorkspace &&
      (normalizedPath === normalizedWorkspace || normalizedPath.startsWith(`${normalizedWorkspace}/`))
    ) {
      const rootFolderName = getLastSegment(normalizedWorkspace);
      const relativePath =
        normalizedPath === normalizedWorkspace
          ? ''
          : normalizedPath.slice(normalizedWorkspace.length + 1);
      const relativeSegments = relativePath ? relativePath.split('/').filter(Boolean) : [];

      return rootFolderName ? [rootFolderName, ...relativeSegments] : relativeSegments;
    }

    const fallbackSegments = normalizedPath.split('/').filter(Boolean);
    if (fallbackSegments.length > 0 && /^[A-Za-z]:$/.test(fallbackSegments[0])) {
      fallbackSegments.shift();
    }

    return fallbackSegments.slice(-4);
  }, [path, workspacePath]);

  const displaySegments = useMemo(() => {
    if (segments.length <= 5) {
      return segments;
    }

    return [
      segments[0],
      segments[1],
      '...',
      segments[segments.length - 2],
      segments[segments.length - 1],
    ];
  }, [segments]);

  const isTwoLevelNavigation = segments.length === 2;

  const handleClick = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent('file-tree-reveal', {
        detail: { path },
      })
    );
  }, [path]);

  if (displaySegments.length === 0) {
    return null;
  }

  return (
    <div className={`breadcrumb ${isTwoLevelNavigation ? 'breadcrumb--two-level' : ''}`}>
      {displaySegments.map((segment, index) => (
        <React.Fragment key={`${segment}-${index}`}>
          {segment === '...' ? (
            <span className="breadcrumb-ellipsis">...</span>
          ) : (
            <div
              className={`breadcrumb-item ${
                isTwoLevelNavigation && index === 0 ? 'breadcrumb-item--parent' : ''
              } ${
                isTwoLevelNavigation && index === displaySegments.length - 1 ? 'breadcrumb-item--leaf' : ''
              }`}
              onClick={handleClick}
              title={`${path} - reveal in file tree`}
            >
              {segment}
            </div>
          )}

          {index < displaySegments.length - 1 && (
            <svg
              className="breadcrumb-separator"
              fill="currentColor"
              viewBox="0 0 20 20"
              width="10"
              height="10"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};
