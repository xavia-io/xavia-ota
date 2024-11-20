import { createClient } from '@supabase/supabase-js';

import { DatabaseInterface, Release, Tracking, TrackingMetrics } from './DatabaseInterface';
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

  async getReleaseByPath(path: string): Promise<Release | null> {
    const { data, error } = await this.supabase
      .from(Tables.RELEASES)
      .select()
      .eq('path', path)
      .single();

    if (error) throw new Error(error.message);

    return data || null;
  }

  async getReleaseTrackingMetricsForAllReleases(): Promise<TrackingMetrics[]> {
    const { data: iosCount, error: iosError } = await this.supabase
      .from(Tables.RELEASES_TRACKING)
      .select('platform', { count: 'estimated', head: true })
      .eq('platform', 'ios');

    const { data: androidCount, error: androidError } = await this.supabase
      .from(Tables.RELEASES_TRACKING)
      .select('platform', { count: 'estimated', head: true })
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
  async createTracking(tracking: Omit<Tracking, 'id'>): Promise<Tracking> {
    const { data, error } = await this.supabase
      .from(Tables.RELEASES_TRACKING)
      .insert({
        release_id: tracking.releaseId,
        platform: tracking.platform,
        download_timestamp: tracking.downloadTimestamp,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  }
  async getReleaseTrackingMetrics(releaseId: string): Promise<TrackingMetrics[]> {
    const { data: iosCount, error: iosError } = await this.supabase
      .from(Tables.RELEASES_TRACKING)
      .select('platform', { count: 'estimated', head: true })
      .eq('release_id', releaseId)
      .eq('platform', 'ios');

    const { data: androidCount, error: androidError } = await this.supabase
      .from(Tables.RELEASES_TRACKING)
      .select('platform', { count: 'estimated', head: true })
      .eq('release_id', releaseId)
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
    }));
  }
}
