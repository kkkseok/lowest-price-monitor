import { useState, useEffect, useCallback, useRef } from 'react';
import type { CollectionHealth } from '@/types/database';

const CACHE_TTL_MS = 60_000;

let cache: CollectionHealth | null = null;
let cachedAt = 0;
let inflight: Promise<CollectionHealth> | null = null;

async function fetchHealth(): Promise<CollectionHealth> {
  const res = await fetch('/api/collect/health');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || '수집 상태를 불러오지 못했습니다.');
  }
  return (await res.json()) as CollectionHealth;
}

/** 캐시가 신선하면 null(요청 안 함), 아니면 진행 중 요청을 공유해 반환 */
function load(force: boolean): Promise<CollectionHealth> | null {
  if (!force && cache && Date.now() - cachedAt < CACHE_TTL_MS) return null;
  if (!inflight) {
    inflight = fetchHealth()
      .then((next) => {
        cache = next;
        cachedAt = Date.now();
        return next;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * 수집 상태 훅 — 배너·내비 배지·에러 로그가 같은 값을 공유하도록 모듈 레벨 캐시.
 * 한 화면에서 여러 컴포넌트가 동시에 마운트돼도 요청은 1회만 나간다.
 */
export function useCollectionHealth() {
  // 캐시 값은 초기값으로 바로 반영 — effect에서 동기 setState를 하지 않기 위해
  const [health, setHealth] = useState<CollectionHealth | null>(cache);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const subscribe = useCallback((p: Promise<CollectionHealth> | null) => {
    p?.then(
      (next) => {
        if (!mountedRef.current) return;
        setHealth(next);
        setError(null);
      },
      (err: unknown) => {
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err.message : '알 수 없는 오류');
      }
    );
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    subscribe(load(false));
    return () => {
      mountedRef.current = false;
    };
  }, [subscribe]);

  const refetch = useCallback(() => subscribe(load(true)), [subscribe]);

  return { health, error, refetch };
}
