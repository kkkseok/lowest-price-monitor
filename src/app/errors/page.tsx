'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Channel } from '@/types/database';
import { useScrapeErrors, type ErrorGroupRow } from '@/hooks/useScrapeErrors';
import { ErrorsSkeleton } from '@/components/Skeleton';
import { useCollectionHealth } from '@/hooks/useCollectionHealth';
import { useToast } from '@/components/Toast';

/** api/errors group_by=product_channel의 조회 창과 같아야 한다 */
const ERROR_WINDOW_DAYS = 14;

/**
 * 실패 사유 분류 — 원인마다 할 일이 다르다(품절: 기다리거나 비활성화 / 차단·시간초과: 재시도 /
 * 가격 추출 실패: URL·파서 점검). 메시지는 스크래퍼가 남긴 문자열이라 키워드로만 묶는다.
 */
type ErrorCause = 'soldout' | 'blocked' | 'timeout' | 'parse' | 'other';
const CAUSE_LABELS: Record<ErrorCause, string> = {
  soldout: '품절',
  blocked: '차단',
  timeout: '시간 초과',
  parse: '가격 추출 실패',
  other: '기타',
};
function classifyCause(message: string): ErrorCause {
  if (/품절|판매\s*종료/.test(message)) return 'soldout';
  if (/차단|blocked|403|제한/i.test(message)) return 'blocked';
  if (/timeout|시간|초과|abort/i.test(message)) return 'timeout';
  if (/가격 추출 실패|파싱|parse/i.test(message)) return 'parse';
  return 'other';
}

const CHANNEL_LABELS: Record<Channel, string> = {
  coupang: '쿠팡',
  naver: '네이버',
  danawa: '다나와',
};

const CHANNEL_DOTS: Record<Channel, string> = {
  coupang: '#E44232',
  naver: '#03C75A',
  danawa: '#0068B7',
};

function formatRelative(iso: string | null): string {
  if (!iso) return '없음';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '없음';
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  if (min < 60 * 24) return `${Math.floor(min / 60)}시간 전`;
  return `${Math.floor(min / (60 * 24))}일 전`;
}

function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ErrorsPage() {
  const { rows, loading, error: fetchError, refetch } = useScrapeErrors();
  const { health } = useCollectionHealth();
  const toast = useToast();
  // 같은 상품이 여러 채널 카드로 나뉘어 보이므로 조치 상태는 상품 단위로 묶는다
  const [busyById, setBusyById] = useState<Record<string, 'recollect' | 'deactivate'>>({});
  const setBusy = (id: string, v: 'recollect' | 'deactivate' | null) =>
    setBusyById((prev) => {
      const next = { ...prev };
      if (v) next[id] = v;
      else delete next[id];
      return next;
    });

  const handleRecollect = async (productId: string) => {
    setBusy(productId, 'recollect');
    try {
      const res = await fetch(`/api/collect/product/${productId}`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || '수집 요청 실패');
        return;
      }
      const ok = body.success ?? 0;
      const failed = body.failed ?? 0;
      if (failed === 0 && ok > 0) toast.success(`수집 성공 (${ok}개 채널)`);
      else if (ok > 0) toast.show(`${ok}개 성공, ${failed}개 실패`, 'info');
      else toast.error(`다시 실패했습니다 (${failed}개 채널)`);
      refetch();
    } catch {
      toast.error('수집 요청 중 오류가 발생했습니다.');
    } finally {
      setBusy(productId, null);
    }
  };

  const handleDeactivate = async (productId: string) => {
    setBusy(productId, 'deactivate');
    try {
      // toggle API는 현재 값을 뒤집어, 이미 비활성인 상품이면 오히려 켜진다 — 값을 명시해 끈다
      const res = await fetch(`/api/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      });
      if (!res.ok) {
        toast.error('비활성화 실패');
        return;
      }
      toast.success('비활성화했습니다. 상품 관리에서 다시 켤 수 있습니다.');
      refetch();
    } catch {
      toast.error('비활성화 중 오류가 발생했습니다.');
    } finally {
      setBusy(productId, null);
    }
  };
  const [channelFilter, setChannelFilter] = useState<Channel | 'all'>('all');
  const noRecentAttempt =
    !!health &&
    (!health.last_attempt_at ||
      Date.now() - Date.parse(health.last_attempt_at) > ERROR_WINDOW_DAYS * 86_400_000);

  const [causeFilter, setCauseFilter] = useState<ErrorCause | 'all'>('all');
  const channelRows = rows.filter((r) => channelFilter === 'all' || r.channel === channelFilter);
  const filtered = channelRows.filter(
    (r) => causeFilter === 'all' || classifyCause(r.last_failure_message) === causeFilter
  );
  // 채널 필터를 건 상태 기준 원인별 건수 — 0건 원인은 칩을 숨겨 줄을 짧게 유지
  const causeCounts = channelRows.reduce<Partial<Record<ErrorCause, number>>>((acc, r) => {
    const c = classifyCause(r.last_failure_message);
    acc[c] = (acc[c] ?? 0) + 1;
    return acc;
  }, {});

  const counts = {
    all: rows.length,
    coupang: rows.filter((r) => r.channel === 'coupang').length,
    naver: rows.filter((r) => r.channel === 'naver').length,
    danawa: rows.filter((r) => r.channel === 'danawa').length,
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">수집 에러 로그</h1>
          <p className="text-xs text-gray-500 mt-1">
            최근 14일 기준 · 상품 × 채널 그룹 · 연속 실패 많은 순
          </p>
        </div>
        <div className="flex gap-2">
          <FilterChip
            label="전체"
            count={counts.all}
            active={channelFilter === 'all'}
            onClick={() => setChannelFilter('all')}
          />
          {(['coupang', 'naver', 'danawa'] as Channel[]).map((ch) => (
            <FilterChip
              key={ch}
              label={CHANNEL_LABELS[ch]}
              count={counts[ch]}
              active={channelFilter === ch}
              onClick={() => setChannelFilter(ch)}
              dotColor={CHANNEL_DOTS[ch]}
            />
          ))}
        </div>
      </div>

      {channelRows.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">원인</span>
          <FilterChip
            label="전체"
            count={channelRows.length}
            active={causeFilter === 'all'}
            onClick={() => setCauseFilter('all')}
          />
          {(Object.keys(CAUSE_LABELS) as ErrorCause[])
            .filter((c) => (causeCounts[c] ?? 0) > 0)
            .map((c) => (
              <FilterChip
                key={c}
                label={CAUSE_LABELS[c]}
                count={causeCounts[c] ?? 0}
                active={causeFilter === c}
                onClick={() => setCauseFilter(c)}
              />
            ))}
        </div>
      )}

      {loading && <ErrorsSkeleton />}

      {fetchError && (
        <div className="text-center py-12 text-red-500">오류: {fetchError}</div>
      )}

      {!loading && !fetchError && filtered.length === 0 && (
        noRecentAttempt ? (
          // 실패 기록이 없는 이유가 "수집이 돌지 않아서"일 수 있다 — 정상으로 오독하지 않게 구분
          <div className="mx-auto max-w-md text-center py-12">
            <div className="text-gray-700 font-medium">최근 14일간 수집 시도가 없습니다</div>
            <p className="mt-1 text-sm text-gray-500">
              에러가 없는 것이 아니라 수집 자체가 돌지 않았습니다.
              {health?.last_attempt_at &&
                ` 마지막 시도: ${formatAbsolute(health.last_attempt_at)}.`}
            </p>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-400">
            {channelFilter === 'all'
              ? '최근 14일간 수집 에러가 없습니다.'
              : `${CHANNEL_LABELS[channelFilter]} 채널의 수집 에러가 없습니다.`}
          </div>
        )
      )}

      {!loading && !fetchError && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((r) => (
            <ErrorGroupCard
              key={`${r.product_id}:${r.channel}`}
              row={r}
              busy={busyById[r.product_id] ?? null}
              onRecollect={handleRecollect}
              onDeactivate={handleDeactivate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ErrorGroupCardProps {
  row: ErrorGroupRow;
  /** 이 카드의 상품에 진행 중인 조치 */
  busy: 'recollect' | 'deactivate' | null;
  onRecollect: (productId: string) => void;
  onDeactivate: (productId: string) => void;
}

function ErrorGroupCard({ row, busy, onRecollect, onDeactivate }: ErrorGroupCardProps) {
  const severe = row.consecutive_failures >= 3;
  return (
    <div
      className={`rounded-lg border p-4 bg-white ${
        severe ? 'border-red-300 shadow-sm' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          {row.brand_name && (
            <div className="text-xs font-semibold text-purple-700 mb-0.5">
              {row.brand_name}
            </div>
          )}
          <Link
            href={`/products/${row.product_id}`}
            className="font-medium text-gray-900 hover:text-blue-600 hover:underline text-sm leading-tight break-keep"
          >
            {row.product_name}
          </Link>
        </div>
        <span
          className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
          style={{ color: CHANNEL_DOTS[row.channel] }}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: CHANNEL_DOTS[row.channel] }}
          />
          {CHANNEL_LABELS[row.channel]}
        </span>
      </div>

      <div className="flex items-baseline gap-2 mb-2">
        <span
          className={`text-2xl font-bold tabular-nums ${
            severe ? 'text-red-600' : 'text-gray-700'
          }`}
        >
          {row.consecutive_failures}
        </span>
        <span className="text-xs text-gray-500">연속 실패</span>
        {severe && (
          <span className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5 ml-auto">
            ⚠ 점검 필요
          </span>
        )}
      </div>

      <dl className="text-xs space-y-1 text-gray-600 border-t border-gray-100 pt-2">
        <div className="flex justify-between gap-2">
          <dt className="text-gray-500">마지막 실패</dt>
          <dd
            className="text-gray-700 tabular-nums"
            title={formatAbsolute(row.last_failure_at)}
          >
            {formatRelative(row.last_failure_at)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-gray-500">마지막 성공</dt>
          <dd
            className={`tabular-nums ${row.last_success_at ? 'text-gray-700' : 'text-red-500'}`}
            title={row.last_success_at ? formatAbsolute(row.last_success_at) : ''}
          >
            {formatRelative(row.last_success_at)}
          </dd>
        </div>
      </dl>

      <div className="mt-2 text-[11px] text-red-600 font-mono break-words bg-red-50 rounded px-2 py-1">
        {row.last_failure_message}
      </div>

      {/* 원인을 본 자리에서 바로 조치하도록 — 상세로 갔다가 관리 화면으로 다시 가는 왕복을 줄인다 */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onRecollect(row.product_id)}
          disabled={busy !== null}
          className="min-h-8 px-2.5 py-1 text-xs rounded border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
        >
          {busy === 'recollect' ? '수집 중…' : '↻ 다시 수집'}
        </button>
        <Link
          href={`/products/manage?id=${row.product_id}`}
          className="min-h-8 inline-flex items-center px-2.5 py-1 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
        >
          ✏ URL 수정
        </Link>
        <button
          type="button"
          onClick={() => onDeactivate(row.product_id)}
          disabled={busy !== null}
          title="수집 대상에서 뺍니다. 상품 관리에서 다시 활성화할 수 있습니다."
          className="min-h-8 px-2.5 py-1 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {busy === 'deactivate' ? '처리 중…' : '🚫 비활성화'}
        </button>
        <Link
          href={`/products/${row.product_id}`}
          className="ml-auto text-xs text-blue-600 hover:underline"
        >
          상세 →
        </Link>
      </div>
    </div>
  );
}

interface FilterChipProps {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  dotColor?: string;
}

function FilterChip({ label, count, active, onClick, dotColor }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
        active
          ? 'bg-gray-900 text-white border-gray-900'
          : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
      }`}
    >
      {dotColor && (
        <span
          className="inline-block w-1.5 h-1.5 rounded-full mr-1"
          style={{ backgroundColor: dotColor }}
        />
      )}
      {label}
      <span className={`ml-1.5 ${active ? 'text-gray-300' : 'text-gray-500'}`}>
        {count}
      </span>
    </button>
  );
}
