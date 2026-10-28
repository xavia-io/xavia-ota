import { createClient } from '@supabase/supabase-js';

import {
  DatabaseInterface,
  MonthlyInstallationMetrics,
  Release,
  Tracking,
  TrackingMetrics,
} from './DatabaseInterface';
import { Tables } from './DatabaseFactory';

export class SupabaseDatabase implements DatabaseInterface {
  private supabase;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_API_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  async getLatestReleaseRecordForRuntimeVersion(runtimeVersion: string): Promise<Release | null> {
    const { data, error } = await this.supabase
      .from(Tables.RELEASES)
      .select()
      .eq('runtime_version', runtimeVersion)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    if (error) throw new Error(error.message);

    if (data) {
      return {
        id: data.id,
        runtimeVersion: data.runtime_version,
        path: data.path,
        timestamp: data.timestamp,
        commitHash: data.commit_hash,
        commitMessage: data.commit_message,
        updateId: data.update_id,
        repositoryUrl: data.repository_url,
      };
    }

    return null;
  }

  async getReleaseByPath(path: string): Promise<Release | null> {
    const { data, error } = await this.supabase
      .from(Tables.RELEASES)
      .select()
      .eq('path', path)
      .single();

    if (error) throw new Error(error.message);
    if (!data) return null;

    return {
      id: data.id,
      runtimeVersion: data.runtime_version,
      path: data.path,
      timestamp: data.timestamp,
      commitHash: data.commit_hash,
      commitMessage: data.commit_message,
      updateId: data.update_id,
      repositoryUrl: data.repository_url,
    };
  }

  async getReleaseTrackingMetricsForAllReleases(): Promise<TrackingMetrics[]> {
    const { count: iosCount, error: iosError } = await this.supabase
      .from(Tables.RELEASES_TRACKING)
      .select('platform', { count: 'exact', head: true })
      .not('installation_id', 'is', null)
      .eq('platform', 'ios');

    const { count: androidCount, error: androidError } = await this.supabase
      .from(Tables.RELEASES_TRACKING)
      .select('platform', { count: 'exact', head: true })
      .not('installation_id', 'is', null)
      .eq('platform', 'android');

    if (iosError || androidError) throw new Error(iosError?.message || androidError?.message);
    return [
      {
        platform: 'ios',
        count: Number(iosCount),
      },
      {
        platform: 'android',
        count: Number(androidCount),
      },
    ];
  }
  async getMonthlyInstallationMetrics(): Promise<MonthlyInstallationMetrics[]> {
    const { data, error } = await this.supabase
      .from('monthly_installations')
      .select('month,count')
      .order('month', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({ month: row.month, count: Number(row.count) }));
  }
  async createTracking(
    tracking: Pick<Tracking, 'releaseId' | 'platform' | 'installationId'>
  ): Promise<void> {
    const { error } = await this.supabase.from(Tables.RELEASES_TRACKING).upsert(
      {
        release_id: tracking.releaseId,
        platform: tracking.platform,
        installation_id: tracking.installationId,
      },
      { onConflict: 'release_id,installation_id', ignoreDuplicates: true }
    );

    if (error) throw new Error(error.message);
  }
  async getReleaseTrackingMetrics(releaseId: string): Promise<TrackingMetrics[]> {
    const { count: iosCount, error: iosError } = await this.supabase
      .from(Tables.RELEASES_TRACKING)
      .select('platform', { count: 'exact', head: true })
      .eq('release_id', releaseId)
      .not('installation_id', 'is', null)
      .eq('platform', 'ios');

    const { count: androidCount, error: androidError } = await this.supabase
      .from(Tables.RELEASES_TRACKING)
      .select('platform', { count: 'exact', head: true })
      .eq('release_id', releaseId)
      .not('installation_id', 'is', null)
      .eq('platform', 'android');

    if (iosError || androidError) throw new Error(iosError?.message || androidError?.message);

    return [
      {
        platform: 'ios',
        count: Number(iosCount),
      },
      {
        platform: 'android',
        count: Number(androidCount),
      },
    ];
  }

  async createRelease(release: Omit<Release, 'id'>): Promise<Release> {
    const { data, error } = await this.supabase
      .from(Tables.RELEASES)
      .insert({
        path: release.path,
        runtime_version: release.runtimeVersion,
        timestamp: release.timestamp,
        commit_hash: release.commitHash,
        commit_message: release.commitMessage,
        update_id: release.updateId,
        repository_url: release.repositoryUrl ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getRelease(id: string): Promise<Release | null> {
    const { data, error } = await this.supabase
      .from(Tables.RELEASES)
      .select()
      .eq('id', id)
      .single();

    if (error) throw error;

    return {
      id: data.id,
      path: data.path,
      runtimeVersion: data.runtime_version,
      timestamp: data.timestamp,
      commitHash: data.commit_hash,
      commitMessage: data.commit_message,
      repositoryUrl: data.repository_url,
    };
  }

  async listReleases(): Promise<Release[]> {
    const { data, error } = await this.supabase
      .from(Tables.RELEASES)
      .select()
      .order('timestamp', { ascending: false });

    if (error) throw error;
    return data.map((release) => ({
      id: release.id,
      path: release.path,
      runtimeVersion: release.runtime_version,
      timestamp: release.timestamp,
      size: release.size,
      commitHash: release.commit_hash,
      commitMessage: release.commit_message,
      repositoryUrl: release.repository_url,
    }));
  }
}
