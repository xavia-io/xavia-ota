import { Pool } from 'pg';

import {
  DatabaseInterface,
  BundlePatch,
  MonthlyInstallationMetrics,
  Release,
  Tracking,
  TrackingMetrics,
} from './DatabaseInterface';
import { Tables } from './DatabaseFactory';

export class PostgresDatabase implements DatabaseInterface {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DB,
      host: process.env.POSTGRES_HOST,
      port: parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
    });
  }
  async getLatestReleaseRecordForRuntimeVersion(runtimeVersion: string): Promise<Release | null> {
    // Phones are offered the latest publication of the active release, so a rollback is served
    // under its own update ID and time rather than the release's original ones.
    const query = `
      SELECT r.id, r.runtime_version as "runtimeVersion", r.path, r.timestamp,
             r.commit_hash as "commitHash", r.commit_message as "commitMessage",
             r.update_id as "updateId", r.repository_url as "repositoryUrl", r.status,
             latest.update_id as "servedUpdateId", latest.published_at as "servedAt"
      FROM ${Tables.RELEASES} r
      LEFT JOIN LATERAL (
        SELECT update_id, published_at FROM ${Tables.RELEASE_PUBLICATIONS} p
        WHERE p.release_id = r.id
        ORDER BY p.published_at DESC, p.kind = 'rollback' DESC
        LIMIT 1
      ) latest ON TRUE
      WHERE r.runtime_version = $1 AND r.status = 'active'
      LIMIT 1
    `;

    const { rows } = await this.pool.query(query, [runtimeVersion]);
    return rows[0] || null;
  }
  // Bound upload work to recent releases of this runtime, prioritising the active base.
  async getRecentPatchBases(runtimeVersion: string, targetReleaseId: string): Promise<Release[]> {
    const { rows } = await this.pool.query(
      `
      SELECT id, runtime_version as "runtimeVersion", path, timestamp, status
      FROM releases
      WHERE runtime_version = $1 AND id <> $2 AND status IN ('active', 'inactive')
      ORDER BY (status = 'active') DESC, timestamp DESC, id DESC LIMIT 3
    `,
      [runtimeVersion, targetReleaseId]
    );
    return rows;
  }

  async saveBundlePatch(patch: BundlePatch): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO release_bundle_patches
        (target_release_id, base_release_id, platform, target_hash, base_hash, patch_hash, storage_path, size)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (target_release_id, base_release_id, platform) DO UPDATE
      SET target_hash = EXCLUDED.target_hash, base_hash = EXCLUDED.base_hash,
          patch_hash = EXCLUDED.patch_hash, storage_path = EXCLUDED.storage_path, size = EXCLUDED.size
    `,
      [
        patch.targetReleaseId,
        patch.baseReleaseId,
        patch.platform,
        patch.targetHash,
        patch.baseHash,
        patch.patchHash,
        patch.storagePath,
        patch.size,
      ]
    );
  }

  async getBundlePatch(
    targetReleaseId: string,
    baseReleaseId: string,
    platform: string
  ): Promise<BundlePatch | null> {
    const { rows } = await this.pool.query(
      `
      SELECT target_release_id as "targetReleaseId", base_release_id as "baseReleaseId", platform,
             target_hash as "targetHash", base_hash as "baseHash", patch_hash as "patchHash",
             storage_path as "storagePath", size
      FROM release_bundle_patches
      WHERE target_release_id = $1 AND base_release_id = $2 AND platform = $3
    `,
      [targetReleaseId, baseReleaseId, platform]
    );
    return rows[0] || null;
  }

  async getReleaseByPath(path: string): Promise<Release | null> {
    const query = `
      SELECT id, runtime_version as "runtimeVersion", path, timestamp,
             commit_hash as "commitHash", commit_message as "commitMessage", update_id as "updateId",
             repository_url as "repositoryUrl", status
      FROM ${Tables.RELEASES} WHERE path = $1
    `;
    const { rows } = await this.pool.query(query, [path]);
    return rows[0] || null;
  }

  // Resolves the release's own update ID or any publication of it, so downloads that started
  // under an earlier publication keep working after a rollback.
  async getReleaseByUpdateId(runtimeVersion: string, updateId: string): Promise<Release | null> {
    const { rows } = await this.pool.query(
      `
      SELECT r.id, r.runtime_version as "runtimeVersion", r.path, r.timestamp,
             r.commit_hash as "commitHash", r.commit_message as "commitMessage",
             r.update_id as "updateId", r.repository_url as "repositoryUrl", r.status
      FROM ${Tables.RELEASES} r
      WHERE r.runtime_version = $1 AND (
        r.update_id = $2 OR EXISTS (
          SELECT 1 FROM ${Tables.RELEASE_PUBLICATIONS} p
          WHERE p.release_id = r.id AND p.runtime_version = $1 AND p.update_id = $2
        )
      )
      LIMIT 1
    `,
      [runtimeVersion, updateId]
    );
    return rows[0] || null;
  }

  async activateRelease(id: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT runtime_version FROM ${Tables.RELEASES} WHERE id = $1`,
        [id]
      );
      if (!rows.length) throw new Error('Release not found');
      // Serialize activations for the same runtime, including concurrent uploads.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [rows[0].runtime_version]);
      await client.query(`SELECT id FROM ${Tables.RELEASES} WHERE id = $1 FOR UPDATE`, [id]);
      await client.query(
        `UPDATE ${Tables.RELEASES} SET status = 'inactive' WHERE runtime_version = $1 AND status = 'active'`,
        [rows[0].runtime_version]
      );
      await client
        .query(
          `UPDATE ${Tables.RELEASES} SET status = 'active' WHERE id = $1 AND status IN ('uploading', 'inactive', 'active') RETURNING id`,
          [id]
        )
        .then((result) => {
          if (!result.rowCount) throw new Error('Release cannot be activated');
        });
      // Published at activation time so the update sorts after anything a phone already has.
      await client.query(
        `INSERT INTO ${Tables.RELEASE_PUBLICATIONS}
           (release_id, runtime_version, update_id, published_at, kind)
         SELECT id, runtime_version, update_id, now(), 'publish'
         FROM ${Tables.RELEASES} WHERE id = $1 AND update_id IS NOT NULL
         ON CONFLICT (runtime_version, update_id) DO NOTHING`,
        [id]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Makes the release Live again under a new update ID published now. Phones only accept an update
  // with an ID they have not stored and a newer time, so reusing the original ID would be ignored by
  // phones that already moved past it.
  async rollbackToRelease(
    id: string,
    expectedActiveId: string
  ): Promise<
    | { outcome: 'activated'; updateId: string }
    | { outcome: 'already_active' | 'same_update_id' | 'active_changed' | 'not_found' }
  > {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: runtimeRows } = await client.query(
        `SELECT runtime_version FROM ${Tables.RELEASES} WHERE id = $1`,
        [id]
      );
      if (!runtimeRows.length) {
        await client.query('ROLLBACK');
        return { outcome: 'not_found' };
      }
      const runtimeVersion = runtimeRows[0].runtime_version;
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [runtimeVersion]);
      const { rows: targets } = await client.query(
        `SELECT id, update_id, status FROM ${Tables.RELEASES}
         WHERE id = $1 AND runtime_version = $2 FOR UPDATE`,
        [id, runtimeVersion]
      );
      if (
        !targets.length ||
        targets[0].status === 'failed' ||
        targets[0].status === 'uploading' ||
        !targets[0].update_id
      ) {
        await client.query('ROLLBACK');
        return { outcome: 'not_found' };
      }
      const { rows: active } = await client.query(
        `SELECT id, update_id FROM ${Tables.RELEASES}
         WHERE runtime_version = $1 AND status = 'active' FOR UPDATE`,
        [runtimeVersion]
      );
      if (active[0]?.id === id) {
        await client.query('ROLLBACK');
        return { outcome: 'already_active' };
      }
      if (active[0]?.id !== expectedActiveId) {
        await client.query('ROLLBACK');
        return { outcome: 'active_changed' };
      }
      if (active[0]?.update_id && active[0].update_id === targets[0].update_id) {
        await client.query('ROLLBACK');
        return { outcome: 'same_update_id' };
      }
      await client.query(
        `UPDATE ${Tables.RELEASES} SET status = 'inactive'
         WHERE runtime_version = $1 AND status = 'active'`,
        [runtimeVersion]
      );
      await client.query(
        `UPDATE ${Tables.RELEASES} SET status = 'active'
         WHERE id = $1 AND runtime_version = $2`,
        [id, runtimeVersion]
      );
      const { rows: publication } = await client.query(
        `INSERT INTO ${Tables.RELEASE_PUBLICATIONS}
           (release_id, runtime_version, update_id, published_at, kind, rolled_back_from_release_id)
         VALUES ($1, $2, gen_random_uuid()::text, now(), 'rollback', $3)
         RETURNING update_id`,
        [id, runtimeVersion, active[0].id]
      );
      await client.query('COMMIT');
      return { outcome: 'activated', updateId: publication[0].update_id };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async failRelease(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE ${Tables.RELEASES} SET status = 'failed' WHERE id = $1 AND status = 'uploading'`,
      [id]
    );
  }

  async retryFailedRelease(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE ${Tables.RELEASES} SET status = 'uploading' WHERE id = $1 AND status = 'failed'`,
      [id]
    );
    return Boolean(result.rowCount);
  }

  async retryStaleUpload(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE ${Tables.RELEASES} SET timestamp = now()
       WHERE id = $1 AND status = 'uploading' AND timestamp < now() - interval '15 minutes'`,
      [id]
    );
    return Boolean(result.rowCount);
  }

  async setReleaseUpdateId(id: string, updateId: string): Promise<void> {
    await this.pool.query(
      `WITH updated AS (
         UPDATE ${Tables.RELEASES} SET update_id = $2 WHERE id = $1 AND update_id IS NULL
         RETURNING id, runtime_version, update_id, timestamp, status
       )
       INSERT INTO ${Tables.RELEASE_PUBLICATIONS}
         (release_id, runtime_version, update_id, published_at, kind)
       SELECT id, runtime_version, update_id,
              CASE WHEN status = 'active' THEN now() ELSE timestamp END, 'publish'
       FROM updated
       ON CONFLICT (runtime_version, update_id) DO NOTHING`,
      [id, updateId]
    );
  }

  async createTracking(
    tracking: Pick<Tracking, 'releaseId' | 'platform' | 'installationId'>
  ): Promise<void> {
    // A legacy row may have come from a no-update check. Qualify it only after a manifest offer.
    await this.pool.query(
      `UPDATE ${Tables.RELEASES_TRACKING}
       SET offered_release = TRUE,
           platform = $3,
           download_timestamp = now()
       WHERE release_id = $1 AND installation_id = $2 AND offered_release = FALSE`,
      [tracking.releaseId, tracking.installationId, tracking.platform]
    );
    const query = `
      INSERT INTO ${Tables.RELEASES_TRACKING} (release_id, platform, installation_id, offered_release)
      VALUES ($1, $2, $3, TRUE)
      ON CONFLICT (release_id, installation_id) WHERE installation_id IS NOT NULL DO NOTHING
    `;
    await this.pool.query(query, [tracking.releaseId, tracking.platform, tracking.installationId]);
  }

  async recordManifestRequest(releaseId: string, platform: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO release_request_metrics (release_id, platform, manifest_requests)
       VALUES ($1, $2, 1)
       ON CONFLICT (release_id, platform) DO UPDATE SET
         manifest_requests = release_request_metrics.manifest_requests + 1`,
      [releaseId, platform]
    );
  }

  async recordAssetRequest(
    releaseId: string,
    platform: string,
    bytes: number,
    installationId: string | null
  ): Promise<void> {
    await this.pool.query(
      `WITH attempt AS (
         INSERT INTO release_download_attempts (release_id, installation_id, platform)
         SELECT $1, $4::uuid, $2 WHERE $4::uuid IS NOT NULL
         ON CONFLICT (release_id, installation_id) DO NOTHING
         RETURNING 1
       )
       INSERT INTO release_request_metrics
         (release_id, platform, asset_requests, bytes_transferred, download_attempts)
       VALUES ($1, $2, 1, $3, (SELECT COUNT(*) FROM attempt))
       ON CONFLICT (release_id, platform) DO UPDATE SET
         asset_requests = release_request_metrics.asset_requests + 1,
         bytes_transferred = release_request_metrics.bytes_transferred + EXCLUDED.bytes_transferred,
         download_attempts = release_request_metrics.download_attempts + EXCLUDED.download_attempts`,
      [releaseId, platform, bytes, installationId]
    );
  }

  // Update IDs come from Expo-Recent-Failed-Update-IDs; each may be a release's own ID or any
  // publication of it. IDs this server never served are ignored.
  async recordFailedLaunches(
    runtimeVersion: string,
    platform: string,
    installationId: string,
    updateIds: string[]
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO release_failed_launches (release_id, installation_id, platform)
       SELECT r.id, $3::uuid, $2
       FROM ${Tables.RELEASES} r
       WHERE r.runtime_version = $1 AND (
         r.update_id = ANY($4::text[]) OR EXISTS (
           SELECT 1 FROM ${Tables.RELEASE_PUBLICATIONS} p
           WHERE p.release_id = r.id AND p.runtime_version = $1 AND p.update_id = ANY($4::text[])
         )
       )
       ON CONFLICT (release_id, installation_id) DO NOTHING`,
      [runtimeVersion, platform, installationId, updateIds]
    );
  }

  async getReleaseTrackingMetrics(releaseId: string): Promise<TrackingMetrics[]> {
    const query = `
      SELECT platform, COUNT(DISTINCT installation_id) as count
      FROM ${Tables.RELEASES_TRACKING}
      WHERE release_id = $1 AND installation_id IS NOT NULL AND offered_release = TRUE
      GROUP BY platform
    `;
    const { rows } = await this.pool.query(query, [releaseId]);
    return rows.map((row) => ({
      platform: row.platform,
      count: Number(row.count),
    }));
  }

  async getReleaseTrackingMetricsForAllReleases(): Promise<TrackingMetrics[]> {
    const query = `
      SELECT platform, COUNT(DISTINCT installation_id) as count
      FROM ${Tables.RELEASES_TRACKING}
      WHERE installation_id IS NOT NULL AND offered_release = TRUE
      GROUP BY platform
    `;
    const { rows } = await this.pool.query(query);
    return rows.map((row) => ({
      platform: row.platform,
      count: Number(row.count),
    }));
  }

  async getMonthlyInstallationMetrics(): Promise<MonthlyInstallationMetrics[]> {
    const { rows } = await this.pool.query(`
      SELECT to_char(date_trunc('month', download_timestamp AT TIME ZONE 'Africa/Lagos'), 'YYYY-MM') AS month,
             COUNT(DISTINCT installation_id) AS count
      FROM ${Tables.RELEASES_TRACKING}
      WHERE installation_id IS NOT NULL AND offered_release = TRUE
      GROUP BY date_trunc('month', download_timestamp AT TIME ZONE 'Africa/Lagos')
      ORDER BY month DESC
    `);
    return rows.map((row) => ({ month: row.month, count: Number(row.count) }));
  }

  async getRuntimeInstallationMetrics(runtimeVersion: string): Promise<{
    iosInstalls: number;
    androidInstalls: number;
    uniqueInstallsThisMonth: number;
  }> {
    const { rows } = await this.pool.query(
      `SELECT
         COUNT(DISTINCT t.installation_id) FILTER (WHERE t.platform = 'ios') AS "iosInstalls",
         COUNT(DISTINCT t.installation_id) FILTER (WHERE t.platform = 'android') AS "androidInstalls",
         COUNT(DISTINCT t.installation_id) FILTER (
           WHERE date_trunc('month', t.download_timestamp AT TIME ZONE 'Africa/Lagos') =
                 date_trunc('month', now() AT TIME ZONE 'Africa/Lagos')
         ) AS "uniqueInstallsThisMonth"
       FROM ${Tables.RELEASES_TRACKING} t
       JOIN ${Tables.RELEASES} r ON r.id = t.release_id
       WHERE r.runtime_version = $1 AND t.installation_id IS NOT NULL AND t.offered_release = TRUE`,
      [runtimeVersion]
    );
    return {
      iosInstalls: Number(rows[0].iosInstalls),
      androidInstalls: Number(rows[0].androidInstalls),
      uniqueInstallsThisMonth: Number(rows[0].uniqueInstallsThisMonth),
    };
  }

  async getReleaseMetricsHierarchy(releaseId?: string): Promise<
    {
      releaseId: string;
      runtimeVersion: string;
      updateId: string | null;
      status: string;
      publishedAt: Date;
      platform: string;
      uniqueInstallations: number;
      manifestRequests: number;
      downloadAttempts: number;
      assetRequests: number;
      bytesTransferred: number;
      failedLaunches: number;
    }[]
  > {
    const { rows } = await this.pool.query(
      `
      SELECT r.id AS "releaseId", r.runtime_version AS "runtimeVersion",
             r.update_id AS "updateId", r.status, r.timestamp AS "publishedAt",
             platforms.platform,
             COALESCE(installs.count, 0) AS "uniqueInstallations",
             COALESCE(metrics.manifest_requests, 0) AS "manifestRequests",
             COALESCE(metrics.download_attempts, 0) AS "downloadAttempts",
             COALESCE(metrics.asset_requests, 0) AS "assetRequests",
             COALESCE(metrics.bytes_transferred, 0) AS "bytesTransferred",
             COALESCE(failed.count, 0) AS "failedLaunches"
      FROM ${Tables.RELEASES} r
      CROSS JOIN (VALUES ('ios'), ('android')) AS platforms(platform)
      LEFT JOIN (
        SELECT release_id, platform, COUNT(DISTINCT installation_id) AS count
        FROM ${Tables.RELEASES_TRACKING}
        WHERE installation_id IS NOT NULL AND offered_release = TRUE
        GROUP BY release_id, platform
      ) installs ON installs.release_id = r.id AND installs.platform = platforms.platform
      LEFT JOIN release_request_metrics metrics
        ON metrics.release_id = r.id AND metrics.platform = platforms.platform
      LEFT JOIN (
        SELECT release_id, platform, COUNT(*) AS count
        FROM release_failed_launches
        GROUP BY release_id, platform
      ) failed ON failed.release_id = r.id AND failed.platform = platforms.platform
      WHERE r.status IN ('active', 'inactive')
        ${releaseId ? 'AND r.id = $1' : ''}
      ORDER BY r.runtime_version DESC, r.timestamp DESC, platforms.platform
    `,
      releaseId ? [releaseId] : []
    );
    return rows.map((row) => ({
      ...row,
      uniqueInstallations: Number(row.uniqueInstallations),
      manifestRequests: Number(row.manifestRequests),
      downloadAttempts: Number(row.downloadAttempts),
      assetRequests: Number(row.assetRequests),
      bytesTransferred: Number(row.bytesTransferred),
      failedLaunches: Number(row.failedLaunches),
    }));
  }

  async getGlobalInstallationSummary(): Promise<{
    uniqueInstallations: number;
    iosInstallations: number;
    androidInstallations: number;
  }> {
    const { rows } = await this.pool.query(
      `SELECT COUNT(DISTINCT installation_id) AS "uniqueInstallations",
              COUNT(DISTINCT installation_id) FILTER (WHERE platform = 'ios') AS "iosInstallations",
              COUNT(DISTINCT installation_id) FILTER (WHERE platform = 'android') AS "androidInstallations"
       FROM ${Tables.RELEASES_TRACKING}
       WHERE installation_id IS NOT NULL AND offered_release = TRUE`
    );
    return {
      uniqueInstallations: Number(rows[0].uniqueInstallations),
      iosInstallations: Number(rows[0].iosInstallations),
      androidInstallations: Number(rows[0].androidInstallations),
    };
  }

  async listRuntimeSummaries(
    search: string,
    limit: number,
    offset: number
  ): Promise<{
    runtimes: {
      version: string;
      releaseCount: number;
      latestPublishedAt: Date;
      activeCommitHash: string | null;
      activeRepositoryUrl: string | null;
    }[];
    total: number;
  }> {
    const filter = `status IN ('active', 'inactive')
      AND POSITION(lower($1) IN lower(runtime_version)) > 0`;
    const [list, count] = await Promise.all([
      this.pool.query(
        `WITH published AS (
           SELECT runtime_version AS version, COUNT(*)::int AS "releaseCount",
                  MAX(timestamp) AS "latestPublishedAt"
           FROM ${Tables.RELEASES}
           WHERE ${filter}
           GROUP BY runtime_version
         )
         SELECT published.*, active.commit_hash AS "activeCommitHash",
                active.repository_url AS "activeRepositoryUrl"
         FROM published
         LEFT JOIN ${Tables.RELEASES} active
           ON active.runtime_version = published.version AND active.status = 'active'
         ORDER BY CASE WHEN published.version ~ '^[0-9]+([.][0-9]+)*$'
                       THEN string_to_array(published.version, '.')::numeric[] END DESC NULLS LAST,
                  published.version DESC
         LIMIT $2 OFFSET $3`,
        [search, limit, offset]
      ),
      this.pool.query(
        `SELECT COUNT(DISTINCT runtime_version)::int AS total
         FROM ${Tables.RELEASES} WHERE ${filter}`,
        [search]
      ),
    ]);
    return { runtimes: list.rows, total: count.rows[0].total };
  }

  async createRelease(release: Omit<Release, 'id'>): Promise<Release> {
    const query = `
      INSERT INTO ${Tables.RELEASES} (runtime_version, path, timestamp, commit_hash, commit_message, update_id, repository_url, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, runtime_version as "runtimeVersion", path, timestamp, commit_hash as "commitHash", update_id as "updateId",
                commit_message as "commitMessage", repository_url as "repositoryUrl", status
    `;

    const values = [
      release.runtimeVersion,
      release.path,
      release.timestamp,
      release.commitHash,
      release.commitMessage,
      release.updateId,
      release.repositoryUrl ?? null,
      release.status ?? 'inactive',
    ];
    const { rows } = await this.pool.query(query, values);
    return rows[0];
  }

  async getRelease(id: string): Promise<Release | null> {
    const query = `
      SELECT id, runtime_version as "runtimeVersion", path, timestamp,
             commit_hash as "commitHash", commit_message as "commitMessage", update_id as "updateId",
             repository_url as "repositoryUrl", status
      FROM ${Tables.RELEASES} WHERE id = $1
    `;

    const { rows } = await this.pool.query(query, [id]);
    return rows[0] || null;
  }

  async listReleases(): Promise<Release[]> {
    const query = `
      SELECT r.id, r.runtime_version as "runtimeVersion", r.path, r.timestamp,
             r.commit_hash as "commitHash", r.commit_message as "commitMessage",
             r.update_id as "updateId", r.repository_url as "repositoryUrl", r.status,
             (
               SELECT COALESCE(json_agg(json_build_object(
                 'updateId', p.update_id,
                 'publishedAt', p.published_at,
                 'kind', p.kind,
                 'rolledBackFromReleaseId', p.rolled_back_from_release_id,
                 'rolledBackFromCommitHash', f.commit_hash,
                 'rolledBackFromRepositoryUrl', f.repository_url
               ) ORDER BY p.published_at DESC, p.kind = 'rollback' DESC), '[]'::json)
               FROM ${Tables.RELEASE_PUBLICATIONS} p
               LEFT JOIN ${Tables.RELEASES} f ON f.id = p.rolled_back_from_release_id
               WHERE p.release_id = r.id
             ) AS publications
      FROM ${Tables.RELEASES} r
      ORDER BY r.timestamp DESC
    `;

    const { rows } = await this.pool.query(query);
    return rows;
  }
}
