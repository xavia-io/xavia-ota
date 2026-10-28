export interface Release {
  id: string;
  runtimeVersion: string;
  path: string;
  timestamp: string;
  commitHash: string;
  commitMessage: string;
  updateId?: string;
  status?: 'uploading' | 'active' | 'inactive' | 'failed';
  repositoryUrl?: string | null;
  // The update ID and time phones are currently offered: the latest publication of this release.
  servedUpdateId?: string | null;
  servedAt?: string | null;
  publications?: ReleasePublication[];
}

export interface ReleasePublication {
  updateId: string;
  publishedAt: string;
  kind: 'publish' | 'rollback';
  rolledBackFromReleaseId: string | null;
  rolledBackFromCommitHash: string | null;
  rolledBackFromRepositoryUrl: string | null;
}

export interface Tracking {
  id: string;
  releaseId: string;
  downloadTimestamp: string;
  platform: string;
  installationId: string;
}

export interface TrackingMetrics {
  platform: string;
  count: number;
}

export interface MonthlyInstallationMetrics {
  month: string;
  count: number;
}

export interface DatabaseInterface {
  createRelease(release: Omit<Release, 'id'>): Promise<Release>;
  getRelease(id: string): Promise<Release | null>;
  getReleaseByPath(path: string): Promise<Release | null>;
  listReleases(): Promise<Release[]>;
  createTracking(
    tracking: Pick<Tracking, 'releaseId' | 'platform' | 'installationId'>
  ): Promise<void>;
  getReleaseTrackingMetrics(releaseId: string): Promise<TrackingMetrics[]>;
  getReleaseTrackingMetricsForAllReleases(): Promise<TrackingMetrics[]>;
  getMonthlyInstallationMetrics(): Promise<MonthlyInstallationMetrics[]>;
  getLatestReleaseRecordForRuntimeVersion(runtimeVersion: string): Promise<Release | null>;
}

export interface BundlePatch {
  targetReleaseId: string;
  baseReleaseId: string;
  platform: string;
  targetHash: string;
  baseHash: string;
  patchHash: string;
  storagePath: string;
  size: number;
}
