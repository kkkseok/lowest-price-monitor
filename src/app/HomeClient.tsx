'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDashboard } from '@/hooks/useDashboard';
import {
  useUrlState,
  stringCodec,
  stringSetCodec,
  enumCodec,
} from '@/hooks/useUrlState';
import PriceTable from '@/components/PriceTable';
import PriceCardList from '@/components/PriceCardList';
import SummaryCards from '@/components/SummaryCards';
import ActionPanels from '@/components/ActionPanels';
import ActiveFilterChips from '@/components/ActiveFilterChips';
import SearchInput from '@/components/SearchInput';
import FilterChips, { type ChangeFilter } from '@/components/FilterChips';
import BrandFilter, { UNCATEGORIZED_BRAND_ID } from '@/components/BrandFilter';
import ViewToggle, { type ViewMode } from '@/components/ViewToggle';
import SortSelect from '@/components/SortSelect';
import Pagination from '@/components/Pagination';
import { saveDashboardContext } from '@/lib/dashboard-nav';
import { exportSnapshotToExcel } from '@/lib/export';
import { DashboardSkeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { classifyHealth } from '@/lib/collection-health';
import { useCollectionHealth } from '@/hooks/useCollectionHealth';
import Modal from '@/components/Modal';
import type {
  Brand,
  DashboardResponse,
  DashboardSortKey,
  ProductIdsResponse,
} from '@/types/database';
import { buildDashboardParams } from '@/hooks/useDashboard';

// useUrlState용 안정 codec 참조 — 모듈 레벨로 빼두면 useEffect deps가 흔들리지 않음
// drops/rises/missing 은 ActionPanels 카드 클릭으로 진입하는 숨은 필터 — codec에는 포함해 URL 양방향 동기화
const FILTER_CODEC = enumCodec<ChangeFilter>(
  ['all', 'changed', 'bigDrop', 'failed', 'drops', 'rises', 'missing'],
  'all'
);
const VIEW_CODEC = enumCodec<ViewMode>(['card', 'table'], 'card');
const SORT_CODEC = enumCodec<DashboardSortKey>(
  ['default', 'drop', 'rise', 'price_asc', 'price_desc', 'name'],
  'default'
);
const PAGE_CODEC = {
  parse: (raw: string | null) => {
    const n = raw ? parseInt(raw, 10) : 1;
    return Number.isFinite(n) && n >= 1 ? n : 1;
  },
  format: (v: number) => (v <= 1 ? null : String(v)),
};

const PAGE_SIZE = 50;
/** 배치 수집 API의 상한 (api/collect/batch MAX_BATCH와 동일) */
const COLLECT_BATCH_MAX = 1000;

interface CollectStatus {
  id?: string;
  status: string;
  result_success?: number;
  result_failed?: number;
  error_message?: string;
  created_at?: string;
  completed_at?: string;
  progress_done?: number;
  progress_total?: number;
}

/** 상대 시간 포맷 — 'N분 전' / 'N시간 전' / 'N일 전' + 절대 시간 보조 */
function formatRelative(iso: string | null): { relative: string; absolute: string } | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60_000);
  let relative: string;
  if (min < 1) relative = '방금 전';
  else if (min < 60) relative = `${min}분 전`;
  else if (min < 60 * 24) relative = `${Math.floor(min / 60)}시간 전`;
  else relative = `${Math.floor(min / (60 * 24))}일 전`;
  const absolute = new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  return { relative, absolute };
}

export default function Home() {
  const [search, setSearchRaw] = useUrlState('q', '', stringCodec);
  const [filter, setFilterRaw] = useUrlState<ChangeFilter>(
    'filter',
    'all',
    FILTER_CODEC
  );
  const [brandSelection, setBrandSelectionRaw] = useUrlState(
    'brand',
    new Set<string>(),
    stringSetCodec
  );
  const [view, setView] = useUrlState<ViewMode>('view', 'card', VIEW_CODEC);
  const [page, setPage] = useUrlState('page', 1, PAGE_CODEC);
  const [sort, setSortRaw] = useUrlState<DashboardSortKey>('sort', 'default', SORT_CODEC);
  const setSort = useCallback(
    (next: DashboardSortKey) => {
      setSortRaw(next);
      setPage(1);
    },
    [setSortRaw, setPage]
  );

  // 필터가 바뀌면 1페이지로 리셋
  const setSearch = useCallback(
    (next: string) => {
      setSearchRaw(next);
      setPage(1);
    },
    [setSearchRaw, setPage]
  );
  const setFilter = useCallback(
    (next: ChangeFilter) => {
      setFilterRaw(next);
      setPage(1);
    },
    [setFilterRaw, setPage]
  );
  const setBrandSelection = useCallback(
    (next: Set<string> | ((prev: Set<string>) => Set<string>)) => {
      setBrandSelectionRaw(next);
      setPage(1);
    },
    [setBrandSelectionRaw, setPage]
  );

  const brandIdsArr = useMemo(() => [...brandSelection].sort(), [brandSelection]);
  const {
    items,
    sparklines: sparklineMap,
    total,
    summary,
    filterCounts,
    panel,
    brandCounts,
    lastCollectedAt,
    loading,
    error,
    refetch: refetchDashboard,
  } = useDashboard({
    days: 7,
    page,
    pageSize: PAGE_SIZE,
    q: search,
    brandIds: brandIdsArr,
    filter,
    sort,
  });
  // 두 콜백 호출처를 그대로 두기 위해 분리된 함수명을 유지
  const refetch = refetchDashboard;
  const refetchLastCollected = refetchDashboard;

  // 브랜드 이름 매핑 (필터 칩 라벨) — 목록이 페이지 단위라 별도 조회
  const [brands, setBrands] = useState<Brand[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/brands')
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setBrands(data as Brand[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const [collecting, setCollecting] = useState(false);
  const [collectStatus, setCollectStatus] = useState<CollectStatus | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const [collectingIds, setCollectingIds] = useState<Set<string>>(new Set());
  const [confirmCollect, setConfirmCollect] = useState<
    { kind: 'all' } | { kind: 'filtered'; count: number } | null
  >(null);
  const { health } = useCollectionHealth();
  const toast = useToast();

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/collect');
      const data: CollectStatus = await res.json();
      setCollectStatus(data);

      if (data.status === 'completed' || data.status === 'failed') {
        stopPolling();
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem('collect_in_progress');
        }
        refetch();
        refetchLastCollected();
      }
    } catch {
      /* ignore */
    }
  }, [refetch, refetchLastCollected, stopPolling]);

  const handleCollect = async () => {
    setCollecting(true);
    setCollectStatus(null);
    try {
      const res = await fetch('/api/collect', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) {
        setCollectStatus({ status: 'failed', error_message: body.error });
        return;
      }
      setCollectStatus({ status: 'pending' });
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('collect_in_progress', '1');
      }
      pollRef.current = setInterval(pollStatus, 3000);
    } catch {
      setCollectStatus({
        status: 'failed',
        error_message: '수집 요청 중 오류가 발생했습니다.',
      });
    } finally {
      setCollecting(false);
    }
  };

  // 마운트 시 진행 중인 수집이 있으면 자동으로 폴링 재시작 (탭 이동 후 복귀 대응).
  // 페이지 전환마다 매번 GET하던 동작을 가드: 진행 중 플래그가 있거나 마지막 체크 후 60초 경과 시에만 호출.
  useEffect(() => {
    let cancelled = false;
    const COLLECT_CHECK_TTL_MS = 60_000;
    const FLAG_KEY = 'collect_in_progress';
    const TS_KEY = 'collect_last_check_ts';

    const flag =
      typeof window !== 'undefined' ? window.sessionStorage.getItem(FLAG_KEY) : null;
    const lastCheck =
      typeof window !== 'undefined'
        ? Number(window.sessionStorage.getItem(TS_KEY) || 0)
        : 0;
    const stale = Date.now() - lastCheck > COLLECT_CHECK_TTL_MS;
    if (!flag && !stale) return;

    fetch('/api/collect')
      .then((res) => res.json())
      .then((data: CollectStatus) => {
        if (cancelled) return;
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(TS_KEY, String(Date.now()));
        }
        if (data && (data.status === 'pending' || data.status === 'running')) {
          if (typeof window !== 'undefined') {
            window.sessionStorage.setItem(FLAG_KEY, '1');
          }
          setCollectStatus(data);
          if (!pollRef.current) {
            pollRef.current = setInterval(pollStatus, 3000);
          }
        } else if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem(FLAG_KEY);
        }
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [pollStatus]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const progressDone = collectStatus?.progress_done ?? 0;
  const progressTotal = collectStatus?.progress_total ?? 0;
  const progressPct =
    progressTotal > 0 ? Math.round((progressDone / progressTotal) * 100) : 0;

  const statusMessage = () => {
    if (!collectStatus) return null;
    switch (collectStatus.status) {
      case 'pending':
        return progressTotal > 0
          ? `수집 대기 중... (${progressDone}/${progressTotal} 상품)`
          : '수집 대기 중... GitHub Actions 시작을 기다리는 중';
      case 'running':
        return progressTotal > 0
          ? `수집 진행 중... ${progressDone} / ${progressTotal} 상품 완료`
          : '수집 진행 중...';
      case 'completed':
        return `수집 완료: ${collectStatus.result_success ?? 0}건 성공, ${collectStatus.result_failed ?? 0}건 실패`;
      case 'failed':
        return `수집 실패: ${collectStatus.error_message || '알 수 없는 오류'}`;
      default:
        return null;
    }
  };

  const isActive =
    collectStatus?.status === 'pending' || collectStatus?.status === 'running';

  const handleCollectProduct = useCallback(
    async (productId: string) => {
      if (isActive) {
        toast.error('전체 수집이 진행 중입니다.');
        return;
      }
      if (collectingIds.has(productId)) return;

      setCollectingIds((prev) => {
        const next = new Set(prev);
        next.add(productId);
        return next;
      });
      try {
        const res = await fetch(`/api/collect/product/${productId}`, {
          method: 'POST',
        });
        const body = await res.json();
        if (!res.ok) {
          toast.error(body.error || '수집 요청 실패');
          return;
        }
        const successCount = body.success ?? 0;
        const failedCount = body.failed ?? 0;
        if (successCount > 0 && failedCount === 0) {
          toast.success(`수집 완료: ${successCount}건 성공`);
        } else if (successCount > 0) {
          toast.show(
            `수집 완료: ${successCount}건 성공, ${failedCount}건 실패`,
            'info'
          );
        } else {
          toast.error(`수집 실패: 0건 성공, ${failedCount}건 실패`);
        }
        refetch();
        refetchLastCollected();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '수집 요청 중 오류');
      } finally {
        setCollectingIds((prev) => {
          const next = new Set(prev);
          next.delete(productId);
          return next;
        });
      }
    },
    [isActive, collectingIds, toast, refetch, refetchLastCollected]
  );

  // 상세에서 같은 조건의 목록으로 돌아오고, 이 페이지 순서대로 이전/다음 상품을 열 수 있게 남긴다
  useEffect(() => {
    if (typeof window === 'undefined' || items.length === 0) return;
    saveDashboardContext(
      `${window.location.pathname}${window.location.search}`,
      items.map((i) => ({ id: i.product_id, name: i.product_name }))
    );
  }, [items]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const listTopRef = useRef<HTMLDivElement>(null);

  const collectionStale = useMemo(() => {
    if (!lastCollectedAt) return true;
    const hours = Math.floor((Date.now() - Date.parse(lastCollectedAt)) / 3_600_000);
    return classifyHealth(hours) !== 'ok';
  }, [lastCollectedAt]);

  // 검색/변동필터/브랜드 중 하나라도 적용돼 부분집합을 보고 있는지
  const isFiltered =
    search.trim() !== '' || filter !== 'all' || brandSelection.size > 0;

  // 현재 필터 결과 "전체"(페이지 밖 포함)를 GitHub Actions로 일괄 수집.
  // 페이지 슬라이스만 들고 있으므로 서버에 ids_only로 전체 id를 요청한다.
  const handleCollectFiltered = useCallback(async () => {
    if (isActive) {
      toast.error('수집이 진행 중입니다. 완료 후 다시 시도해주세요.');
      return;
    }
    setCollecting(true);
    setCollectStatus(null);
    try {
      const params = buildDashboardParams(
        { page: 1, q: search, brandIds: brandIdsArr, filter },
        search
      );
      params.set('ids_only', 'true');
      const idsRes = await fetch(`/api/dashboard?${params.toString()}`);
      if (!idsRes.ok) {
        toast.error('필터 결과 조회 실패');
        return;
      }
      const idsBody = (await idsRes.json()) as ProductIdsResponse;
      const ids = idsBody.ids;
      if (ids.length === 0) {
        toast.show('수집할 상품이 없습니다.', 'info');
        return;
      }
      if (ids.length > COLLECT_BATCH_MAX) {
        toast.error(
          `필터 결과가 ${ids.length.toLocaleString('ko-KR')}개로 배치 상한(${COLLECT_BATCH_MAX.toLocaleString('ko-KR')}개)을 넘습니다. 전체 수집(즉시 수집)을 사용하세요.`
        );
        return;
      }
      const res = await fetch('/api/collect/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: ids }),
      });
      const body = await res.json();
      if (!res.ok) {
        setCollectStatus({ status: 'failed', error_message: body.error });
        toast.error(body.error || '수집 요청 실패');
        return;
      }
      setCollectStatus({ status: 'pending' });
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('collect_in_progress', '1');
      }
      pollRef.current = setInterval(pollStatus, 3000);
      toast.success(`${ids.length}개 상품 수집을 시작했습니다.`);
    } catch {
      setCollectStatus({
        status: 'failed',
        error_message: '수집 요청 중 오류가 발생했습니다.',
      });
      toast.error('수집 요청 중 오류가 발생했습니다.');
    } finally {
      setCollecting(false);
    }
  }, [isActive, search, brandIdsArr, filter, toast, pollStatus]);

  // 필터 칩 카운트 — 서버가 검색+브랜드 적용 후 전체 기준으로 계산
  const counts = filterCounts ?? { all: 0, changed: 0, bigDrop: 0, failed: 0 };

  // 엑셀 스냅샷 — 필터 결과 전체를 별도 요청 (페이지 슬라이스가 아닌 전량)
  const [exporting, setExporting] = useState(false);
  const handleExportSnapshot = useCallback(async () => {
    if (total === 0) {
      toast.show('내보낼 상품이 없습니다.', 'info');
      return;
    }
    setExporting(true);
    try {
      // 화면과 같은 순서로 내보내도록 정렬도 함께 넘긴다
      const params = buildDashboardParams(
        { page: 1, q: search, brandIds: brandIdsArr, filter, sort },
        search
      );
      params.set('all', 'true');
      const res = await fetch(`/api/dashboard?${params.toString()}`);
      if (!res.ok) {
        toast.error('내보낼 데이터 조회 실패');
        return;
      }
      const body = (await res.json()) as DashboardResponse;
      const today = new Date().toISOString().split('T')[0];
      await exportSnapshotToExcel(body.items, `현재최저가_${today}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '내보내기 실패');
    } finally {
      setExporting(false);
    }
  }, [total, search, brandIdsArr, filter, sort, toast]);

  // 적용된 필터 칩 — 사용자가 무엇이 활성인지 즉시 인지하도록
  const activeChips = useMemo(() => {
    const items: Array<{
      label: string;
      tone?: 'search' | 'filter' | 'brand';
      onRemove?: () => void;
    }> = [];
    if (search.trim())
      items.push({
        label: `검색: "${search.trim()}"`,
        tone: 'search',
        onRemove: () => setSearch(''),
      });
    if (filter !== 'all') {
      const labels: Record<ChangeFilter, string> = {
        all: '전체',
        changed: '가격 변동',
        bigDrop: '5% 이상 하락',
        failed: '수집 실패',
        drops: '가격 하락',
        rises: '가격 급등',
        missing: 'URL 누락 / 미수집',
      };
      items.push({
        label: labels[filter],
        tone: 'filter',
        onRemove: () => setFilter('all'),
      });
    }
    if (brandSelection.size > 0) {
      const idToName = new Map(brands.map((b) => [b.id, b.name]));
      for (const id of brandSelection) {
        const name = id === UNCATEGORIZED_BRAND_ID ? '미분류' : idToName.get(id) ?? '브랜드';
        items.push({
          label: `브랜드: ${name}`,
          tone: 'brand',
          onRemove: () => {
            setBrandSelection((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
          },
        });
      }
    }
    return items;
  }, [
    search,
    filter,
    brandSelection,
    brands,
    setSearch,
    setFilter,
    setBrandSelection,
  ]);

  const clearAllFilters = useCallback(() => {
    setSearch('');
    setFilter('all');
    setBrandSelection(new Set());
  }, [setSearch, setFilter, setBrandSelection]);

  // 수집을 막을 것이 확실한 원인 — 확인 단계에서 미리 알려 헛클릭과 실패 토스트를 줄인다
  const blockingCauses = (health?.causes ?? []).filter(
    (c) => c.code === 'workflow_disabled' || c.code === 'brightdata_invalid_token' || c.code === 'brightdata_no_balance'
  );

  return (
    <div>
      <Modal
        open={confirmCollect !== null}
        onClose={() => setConfirmCollect(null)}
        title="가격 수집 시작"
        size="md"
      >
        {confirmCollect && (
          <div className="space-y-3 text-sm text-gray-700">
            <p>
              {confirmCollect.kind === 'all' ? (
                <>
                  <strong>활성 상품 전체</strong>
                  {!isFiltered && summary
                    ? ` (${summary.totalProducts.toLocaleString('ko-KR')}개)`
                    : ''}
                  를 GitHub Actions에서 수집합니다.
                </>
              ) : (
                <>
                  현재 필터 결과 <strong>{confirmCollect.count.toLocaleString('ko-KR')}개</strong>{' '}
                  상품을 GitHub Actions에서 수집합니다.
                </>
              )}
            </p>
            <p className="text-gray-500">
              채널 호출마다 Bright Data 사용량이 발생하고, 상품 수에 따라 끝나기까지 시간이 걸립니다.
              진행률은 이 화면 상단에 표시됩니다.
            </p>
            {blockingCauses.length > 0 && (
              <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-red-800">
                <div className="font-medium">지금은 수집이 실패할 가능성이 높습니다</div>
                <ul className="mt-1 space-y-0.5 text-[13px]">
                  {blockingCauses.map((c) => (
                    <li key={c.code}>• {c.message}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmCollect(null)}
                className="min-h-9 px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  const kind = confirmCollect.kind;
                  setConfirmCollect(null);
                  if (kind === 'all') handleCollect();
                  else handleCollectFiltered();
                }}
                className="min-h-9 px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
              >
                수집 시작
              </button>
            </div>
          </div>
        )}
      </Modal>

      <div className="flex items-center justify-between mb-4 sm:mb-6 flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">현재 최저가 요약</h1>
          {(() => {
            const fmt = formatRelative(lastCollectedAt);
            return fmt ? (
              <span
                className="text-xs text-gray-500"
                title={`마지막 수집: ${fmt.absolute}`}
              >
                🕒 마지막 수집: {fmt.relative} · {fmt.absolute}
              </span>
            ) : null;
          })()}
        </div>
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          <button
            onClick={() => setConfirmCollect({ kind: 'all' })}
            disabled={collecting || isActive}
            className="flex-1 sm:flex-none min-h-9 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {collecting ? '요청 중...' : isActive ? '수집 중...' : '즉시 수집'}
          </button>
          <button
            onClick={handleExportSnapshot}
            disabled={exporting || total === 0}
            title="지금 화면의 검색·필터·정렬 결과를 현재가 기준으로 내려받습니다. 기간별 이력은 '이력 내보내기' 메뉴에서."
            className="flex-1 sm:flex-none min-h-9 px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 text-sm"
          >
            {exporting ? '내보내는 중...' : '현재가 Excel'}
          </button>
        </div>
      </div>

      {collectStatus && collectStatus.status !== 'idle' && (
        <div
          className={`mb-4 p-3 rounded-lg border text-sm ${
            collectStatus.status === 'completed'
              ? 'bg-green-50 border-green-200 text-green-700'
              : collectStatus.status === 'failed'
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-blue-50 border-blue-200 text-blue-700'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {isActive && (
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              )}
              <span>{statusMessage()}</span>
            </div>
            {isActive && progressTotal > 0 && (
              <span className="text-xs text-blue-600 font-medium">{progressPct}%</span>
            )}
          </div>
          {isActive && progressTotal > 0 && (
            <div className="mt-2 w-full bg-blue-100 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-blue-500 h-1.5 transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}
        </div>
      )}

      {loading && <DashboardSkeleton />}

      {error && <div className="text-center py-12 text-red-500">오류: {error}</div>}

      {!loading && !error && !isFiltered && total === 0 && (
        <div className="text-center py-12 text-gray-400">
          등록된 상품이 없습니다. 상품 관리에서 상품을 추가해주세요.
        </div>
      )}

      {!loading && !error && summary && panel && (isFiltered || total > 0) && (
        <>
          <SummaryCards
            stats={summary}
            collectionStale={collectionStale}
            isFiltered={search.trim() !== '' || brandSelection.size > 0}
          />

          {/* 상품 행은 상세로 이동(ActionPanels 기본 링크). 목록 필터는 "전체 보기 →"로만 건다 —
              행 클릭이 검색어를 바꾸면 상세로 갈 줄 안 사용자가 목록이 줄어든 이유를 모른다. */}
          <ActionPanels
            panel={panel}
            onSelectFilter={(next) => {
              setFilter(next);
              // 필터로 진입하면 검색어는 충돌하므로 비우고, 사용자가 결과를 바로 보도록 스크롤
              setSearch('');
              if (typeof window !== 'undefined') {
                window.scrollTo({
                  top: window.innerHeight * 0.5,
                  behavior: 'smooth',
                });
              }
            }}
          />

          <div className="mb-4 flex flex-wrap items-center gap-3 justify-between">
            <div className="flex flex-wrap items-center gap-3 flex-1 w-full">
              <SearchInput value={search} onChange={setSearch} />
              <FilterChips value={filter} onChange={setFilter} counts={counts} />
              <BrandFilter
                selected={brandSelection}
                onChange={setBrandSelection}
                counts={brandCounts.byId}
                uncategorizedCount={brandCounts.uncategorized}
              />
            </div>
            <div className="flex items-center gap-2">
              <SortSelect value={sort} onChange={setSort} />
              {/* 모바일에서는 카드 뷰만, 데스크톱에서는 토글 노출 */}
              <div className="hidden md:block">
                <ViewToggle value={view} onChange={setView} />
              </div>
            </div>
          </div>

          <ActiveFilterChips
            items={activeChips}
            onClearAll={activeChips.length > 0 ? clearAllFilters : undefined}
            matchedCount={total}
            totalCount={counts.all}
          />

          {isFiltered && total > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmCollect({ kind: 'filtered', count: total })}
                disabled={collecting || isActive}
                title="현재 필터 결과 전체(페이지 밖 포함)를 GitHub Actions로 일괄 수집"
                className="inline-flex items-center gap-1.5 min-h-9 px-3 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 text-sm font-medium"
              >
                {isActive
                  ? '수집 중...'
                  : `필터된 ${total.toLocaleString('ko-KR')}개 수집`}
              </button>
            </div>
          )}

          <div ref={listTopRef} className="scroll-mt-4" />
          {totalPages > 1 && items.length > 0 && (
            <div className="mb-3">
              <Pagination
                page={page}
                totalPages={totalPages}
                totalItems={total}
                onChange={setPage}
                compact
              />
            </div>
          )}
          {items.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm border p-12 text-center text-gray-400">
              조건에 맞는 상품이 없습니다.
            </div>
          ) : (
            <>
              {/* 모바일은 항상 카드 뷰 */}
              <div className="md:hidden">
                <PriceCardList
                  data={items}
                  sparklineMap={sparklineMap}
                  collectingIds={collectingIds}
                  globalCollecting={isActive}
                  onCollectProduct={handleCollectProduct}
                />
              </div>
              {/* 데스크톱은 토글에 따라 */}
              <div className="hidden md:block">
                {view === 'table' ? (
                  <div className="bg-white rounded-lg shadow-sm border">
                    <PriceTable
                      data={items}
                      sparklineMap={sparklineMap}
                      collectingIds={collectingIds}
                      globalCollecting={isActive}
                      onCollectProduct={handleCollectProduct}
                      sort={sort}
                      onSortChange={setSort}
                    />
                  </div>
                ) : (
                  <PriceCardList
                    data={items}
                    sparklineMap={sparklineMap}
                    collectingIds={collectingIds}
                    globalCollecting={isActive}
                    onCollectProduct={handleCollectProduct}
                  />
                )}
              </div>

              {/* 페이지네이션 — 서버 페이지 단위 */}
              <div className="mt-4">
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  totalItems={total}
                  onChange={(p) => {
                    setPage(p);
                    // 아래쪽 컨트롤로 넘기면 새 페이지의 첫 항목이 보이도록 목록 위로 올린다
                    listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
