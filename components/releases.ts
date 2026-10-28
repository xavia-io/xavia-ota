export interface Release {
  id: string;
  path: string;
  runtimeVersion: string;
  timestamp: string;
  size: number;
  commitHash: string | null;
  commitMessage: string | null;
  repositoryUrl: string | null;
  updateId: string | null;
  status: 'active' | 'inactive';
  // Newest first. A release has one 'publish' entry and one 'rollback' entry per rollback to it.
  publications: ReleasePublication[];
  archiveAvailable: boolean;
}

export interface ReleasePublication {
  updateId: string;
  publishedAt: string;
  kind: 'publish' | 'rollback';
  rolledBackFromReleaseId: string | null;
  rolledBackFromCommitHash: string | null;
  rolledBackFromRepositoryUrl: string | null;
}

// Orders runtime versions numerically, highest first ("1.10.0" before "1.2.0").
export function compareRuntimeVersionsDesc(a: string, b: string): number {
  return b.localeCompare(a, undefined, { numeric: true });
}

// The update ID phones are offered when this release is Live.
export function servedUpdateId(release: Release): string | null {
  return release.publications[0]?.updateId ?? release.updateId;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
