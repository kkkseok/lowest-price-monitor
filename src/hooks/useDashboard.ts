import { useState, useEffect, useCallback, useRef } from 'react';
import type { ChangeFilterKey, DashboardResponse, DashboardSortKey } from '@/types/database';

const CACHE_TTL_MS = 30_000;
const SEARCH_DEBOUNCE_MS = 300;

export interface DashboardQuery {
  days?: number;
  page: number;
  pageSize?: number;
  q?: string;
  brandIds?: string[];
  filter?: ChangeFilterKey;
  sort?: DashboardSortKey;
}

interface CacheEntry {
  data: DashboardResponse | null;
  cachedAt: number;
  inflight: Promise<DashboardResponse> | null;
}

// 쿼리 직렬화 키별 SWR 캐시 — 페이지 재진입 시 stale 캐시 즉시 표시 후 백그라운드 갱신
const cache = new Map<string, CacheEntry>();

function getEntry(key: string): CacheEntry {
  let entry = cache.get(key);
  if (!entry) {
    entry = { data: null, cachedAt: 0, inflight: null };
    cache.set(key, entry);
  }
  return entry;
}

export function buildDashboardParams(query: DashboardQuery, q: string): URLSearchParams {
  const params = new URLSearchParams();
  params.set('days', String(query.days ?? 7));
  params.set('page', String(Math.max(1, query.page)));
  params.set('page_size', String(query.pageSize ?? 50));
  if (q.trim()) params.set('q', q.trim());
  if (query.brandIds && query.brandIds.length > 0) {
    params.set('brand_ids', query.brandIds.join(','));
  }
  if (query.filter && query.filter !== 'all') params.set('filter', query.filter);
  if (query.sort && query.sort !== 'default') params.set('sort', query.sort);
  return params;
}

async function fetchDashboard(qs: string): Promise<DashboardResponse> {
  const res = await fetch(`/api/dashboard?${qs}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || '대시보드 데이터를 불러오지 못했습니다.');
  }
  return (await res.json()) as DashboardResponse;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}

/**
 * 메인 대시보드 훅 (v2 — 서버 필터/페이지네이션).
 * 검색·브랜드·변동 필터·페이지가 전부 서버 쿼리 파라미터로 나가고,
 * 응답의 집계(summary/filter_counts/panel/brand_counts)는 전체 필터셋 기준이다.
 */
export function useDashboard(query: DashboardQuery) {
  const debouncedQ = useDebouncedValue(query.q ?? '', SEARCH_DEBOUNCE_MS);
  const key = buildDashboardParams(query, debouncedQ).toString();

  const initialEntry = getEntry(key);
  const [data, setData] = useState<DashboardResponse | null>(initialEntry.data);
  const [loading, setLoading] = useState(initialEntry.cachedAt === 0);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const revalidate = useCallback(
    async (force = false) => {
      const entry = getEntry(key);
      const now = Date.now();
      if (!force && entry.cachedAt > 0 && now - entry.cachedAt < CACHE_TTL_MS) {
        return;
      }

      if (!entry.inflight) {
        entry.inflight = fetchDashboard(key)
          .then((next) => {
            entry.data = next;
            entry.cachedAt = Date.now();
            return next;
          })
          .finally(() => {
            entry.inflight = null;
          });
      }

      try {
        const next = await entry.inflight;
        if (!mountedRef.current) return;
        setData(next);
        setError(null);
      } catch (err) {
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err.message : '알 수 없는 오류');
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [key]
  );

  useEffect(() => {
    mountedRef.current = true;
    const entry = getEntry(key);
    if (entry.cachedAt > 0 && entry.data) {
      setData(entry.data);
      setLoading(false);
    } else {
      setLoading(true);
    }
    revalidate(false);
    return () => {
      mountedRef.current = false;
    };
  }, [key, revalidate]);

  // 수집 완료 등 뮤테이션 후 — 모든 키 캐시 무효화 + 현재 키 강제 갱신
  const refetch = useCallback(() => {
    for (const entry of cache.values()) {
      entry.cachedAt = 0;
    }
    setLoading(getEntry(key).data === null);
    return revalidate(true);
  }, [key, revalidate]);

  return {
    data,
    items: data?.items ?? [],
    sparklines: data?.sparklines ?? {},
    total: data?.total ?? 0,
    summary: data?.summary ?? null,
    filterCounts: data?.filter_counts ?? null,
    panel: data?.panel ?? null,
    brandCounts: data?.brand_counts ?? { byId: {}, uncategorized: 0 },
    lastCollectedAt: data?.lastCollectedAt ?? null,
    loading,
    error,
    refetch,
  };
}
