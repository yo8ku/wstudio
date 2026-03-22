/**
 * Workspace path normalization helpers shared by workbench UI components.
 */

export function normalizeWorkspacePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
}

export function getWorkspacePathLastSegment(value: string): string {
  const segments = normalizeWorkspacePath(value).split('/').filter(Boolean);
  return segments[segments.length - 1] || '';
}

export function toRelativeWorkspacePath(fullPath: string, workspacePath: string): string {
  const normalizedFullPath = normalizeWorkspacePath(fullPath);
  const normalizedWorkspace = normalizeWorkspacePath(workspacePath);

  if (!normalizedWorkspace) {
    return normalizedFullPath;
  }

  if (normalizedFullPath === normalizedWorkspace) {
    return '';
  }

  if (normalizedFullPath.startsWith(`${normalizedWorkspace}/`)) {
    return normalizedFullPath.slice(normalizedWorkspace.length + 1);
  }

  return normalizedFullPath;
}

export function toWorkspaceRelativePath(
  fullPath: string | undefined,
  workspacePath: string | null,
): string | null {
  if (!fullPath || !workspacePath) {
    return null;
  }

  return toRelativeWorkspacePath(fullPath, workspacePath);
}
