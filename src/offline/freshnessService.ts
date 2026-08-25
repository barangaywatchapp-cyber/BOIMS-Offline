/**
 * BOIMS Offline Architecture
 * Phase 10 — Offline Data Freshness, Reconciliation & Stale-Cache Management Service
 *
 * Guarantees:
 * - Deterministic, side-effect-free evaluation of cache freshness across all collections.
 * - Collection-specific freshness and maximum retention policies.
 * - In-flight refresh de-duplication to prevent redundant remote queries.
 * - Non-destructive failed refresh handling (preserves last valid cache without false fresh marking).
 * - Multi-tab safety: completely decoupled from Phase 8 mutation replay leases.
 * - Zero credentials, secrets, or auth tokens in cache metadata.
 */

import { offlineStorage } from './storage';
import {
  CachedEntity,
  CacheFreshnessStatus,
  CollectionFreshnessPolicy,
  FreshnessEvaluationResult,
  CollectionFreshnessSummary,
  COLLECTION_FRESHNESS_POLICIES,
  DEFAULT_COLLECTION_FRESHNESS_POLICY,
  getFreshnessPolicyForCollection,
  evaluateCacheFreshness,
  evaluateCollectionFreshness,
} from './types';

export class FreshnessService {
  private inFlightRefreshes: Set<string> = new Set();
  private broadcastChannel: BroadcastChannel | null = null;
  private isBroadcastEnabled: boolean = true;
  private channelName: string = 'boims_offline_freshness_signals';

  constructor() {
    this.initBroadcastChannel();
  }

  /**
   * Initializes BroadcastChannel for non-durable, ephemeral cross-tab cache invalidation notifications.
   */
  private initBroadcastChannel(): void {
    if (typeof BroadcastChannel !== 'undefined' && this.isBroadcastEnabled) {
      try {
        this.broadcastChannel = new BroadcastChannel(this.channelName);
      } catch (err) {
        console.warn('[FreshnessService] BroadcastChannel initialization skipped:', err);
        this.broadcastChannel = null;
      }
    }
  }

  /**
   * Retrieves the configured CollectionFreshnessPolicy for a given collection.
   */
  public getPolicy(collectionName: string): CollectionFreshnessPolicy {
    return getFreshnessPolicyForCollection(collectionName);
  }

  /**
   * Generates in-flight refresh key.
   */
  private getRefreshKey(collectionName: string, recordId?: string): string {
    return recordId ? `${collectionName}:${recordId}` : `${collectionName}:*`;
  }

  /**
   * Checks whether a refresh is currently in-flight for a collection or specific record.
   */
  public isRefreshing(collectionName: string, recordId?: string): boolean {
    const specificKey = this.getRefreshKey(collectionName, recordId);
    const collectionKey = this.getRefreshKey(collectionName);
    return this.inFlightRefreshes.has(specificKey) || this.inFlightRefreshes.has(collectionKey);
  }

  /**
   * Attempts to begin an in-flight refresh. Returns true if acquired, false if already in-flight.
   */
  public beginRefresh(collectionName: string, recordId?: string): boolean {
    const key = this.getRefreshKey(collectionName, recordId);
    if (this.inFlightRefreshes.has(key)) {
      return false;
    }
    this.inFlightRefreshes.add(key);
    return true;
  }

  /**
   * Marks an in-flight refresh as complete.
   */
  public completeRefresh(collectionName: string, recordId?: string): void {
    const key = this.getRefreshKey(collectionName, recordId);
    this.inFlightRefreshes.delete(key);
  }

  /**
   * Evaluates freshness for a specific cached entity by collection and record ID.
   */
  public async getEntityFreshness(
    collectionName: string,
    recordId: string,
    options?: { now?: number | string; customPolicy?: Partial<CollectionFreshnessPolicy> }
  ): Promise<FreshnessEvaluationResult> {
    const isRefreshing = this.isRefreshing(collectionName, recordId);
    const cached = await offlineStorage.getCachedEntity(collectionName, recordId);

    return evaluateCacheFreshness(cached, collectionName, {
      recordId,
      now: options?.now,
      isRefreshing,
      customPolicy: options?.customPolicy,
    });
  }

  /**
   * Evaluates collection-level freshness across all cached entities of a collection.
   */
  public async getCollectionFreshness(
    collectionName: string,
    options?: { now?: number | string; customPolicy?: Partial<CollectionFreshnessPolicy> }
  ): Promise<CollectionFreshnessSummary> {
    const isRefreshing = this.isRefreshing(collectionName);
    const entities = await offlineStorage.getCachedEntities(collectionName);

    return evaluateCollectionFreshness(entities, collectionName, {
      now: options?.now,
      isRefreshing,
      customPolicy: options?.customPolicy,
    });
  }

  /**
   * Atomically records a successful authoritative remote read into the local IndexedDB cache,
   * refreshing `cachedAt` to the current timestamp and setting `updatedAt`.
   */
  public async recordRefreshSuccess<T = unknown>(
    collectionName: string,
    recordId: string,
    remoteData: T,
    remoteUpdatedAt?: string,
    version?: number | string
  ): Promise<CachedEntity<T>> {
    this.completeRefresh(collectionName, recordId);
    const cached = await offlineStorage.putCachedEntity<T>(
      collectionName,
      recordId,
      remoteData,
      {
        updatedAt: remoteUpdatedAt || new Date().toISOString(),
        version,
      }
    );

    // Ephemeral cross-tab signal (does not touch replay leases)
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          type: 'cache_refreshed',
          collectionName,
          recordId,
          timestamp: new Date().toISOString(),
        });
      } catch {
        // ignore broadcast failures
      }
    }

    return cached;
  }

  /**
   * Atomically records a bulk refresh of remote entities into the local IndexedDB cache.
   */
  public async recordBulkRefreshSuccess<T = unknown>(
    collectionName: string,
    records: Array<{ recordId: string; data: T; updatedAt?: string; version?: number | string }>
  ): Promise<Array<CachedEntity<T>>> {
    this.completeRefresh(collectionName);
    const cachedList = await offlineStorage.putCachedEntities<T>(collectionName, records);

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          type: 'collection_refreshed',
          collectionName,
          count: records.length,
          timestamp: new Date().toISOString(),
        });
      } catch {
        // ignore broadcast failures
      }
    }

    return cachedList;
  }

  /**
   * Handles a failed online refresh non-destructively:
   * - Preserves the previous cached record in IndexedDB untouched.
   * - Releases the in-flight lock.
   * - Returns the preserved record alongside the error description.
   */
  public async recordRefreshFailure(
    collectionName: string,
    recordId: string,
    error: unknown
  ): Promise<{
    preserved: boolean;
    previousCache: CachedEntity | null;
    error: string;
    evaluation: FreshnessEvaluationResult;
  }> {
    this.completeRefresh(collectionName, recordId);
    const previousCache = await offlineStorage.getCachedEntity(collectionName, recordId);
    const errorMessage = error instanceof Error ? error.message : String(error);

    const evaluation = evaluateCacheFreshness(previousCache, collectionName, {
      recordId,
      isRefreshing: false,
    });

    return {
      preserved: previousCache !== null,
      previousCache,
      error: errorMessage,
      evaluation,
    };
  }

  /**
   * Resets all in-flight locks (useful for testing or full app recovery).
   */
  public clearInFlightRefreshes(): void {
    this.inFlightRefreshes.clear();
  }
}

export const freshnessService = new FreshnessService();
