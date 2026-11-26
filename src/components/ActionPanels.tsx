'use client';

import Link from 'next/link';
import type { PanelGroups, PriceWithChange, Channel } from '@/types/database';
import { cheapestChannel } from '@/lib/price-utils';
import type { ChangeFilter } from '@/components/FilterChips';

interface Props {
  /** 서버(api/dashboard)가 전체 필터셋 기준으로 집계한 Top N + 카운트 */
  panel: PanelGroups;
  /** 클릭 시 호출 (상품명으로 검색 적용 등). 미지정 시 단순 링크. */
  onProductClick?: (item: PriceWithChange) => void;
  /**
   * 패널 헤더 '전체 보기' 클릭 시 호출.
   * 메인 목록을 같은 조건으로 필터링하기 위해 HomeClient에서 setFilter로 연결.
   */
  onSelectFilter?: (filter: ChangeFilter) => void;
}

const CHANNEL_LABELS: Record<Channel, string> = {
  coupang: '쿠팡',
  naver: '네이버',
  danawa: '다나와',
};

const CHANNEL_COLORS: Record<Channel, string> = {
  coupang: '#E44232',
  naver: '#03C75A',
  danawa: '#0068B7',
};

const TOP_N = 5;

/**
 * 운영자가 지금 무엇을 봐야 하는지 즉시 보이게 하는 액션 중심 4-패널.
 * KPI 요약과 상품 카드 사이에 들어간다.
 * 그룹핑은 서버(computePanelGroups)가 전체 필터셋 기준으로 계산해 내려준다 —
 * 클라이언트는 페이지 슬라이스만 들고 있어 여기서 집계하면 값이 틀어진다.
 */
export default function ActionPanels({ panel, onProductClick, onSelectFilter }: Props) {
  const groups = panel;

  const noActionable =
    groups.drops.length === 0 &&
    groups.rises.length === 0 &&
    groups.failed.length === 0 &&
    groups.missing.length === 0;

  if (noActionable) return null;

  // 빈 패널이 같은 크기로 그리드를 차지하면 첫 화면의 상당 부분이 빈 상자가 된다 —
  // 내용 있는 패널만 그리드에 두고, 빈 패널은 한 줄 요약으로 접는다.
  const emptyNotes: string[] = [];
  if (groups.drops.length === 0) emptyNotes.push('전일 대비 하락 없음');
  if (groups.rises.length === 0) emptyNotes.push('전일 대비 상승 없음');
  if (groups.failed.length === 0) emptyNotes.push('연속 수집 실패 없음');
  if (groups.missing.length === 0) emptyNotes.push('URL 누락·미수집 없음');
  const filledCount = 4 - emptyNotes.length;
  const gridCols =
    filledCount >= 4
      ? 'sm:grid-cols-2 lg:grid-cols-4'
      : filledCount === 3
        ? 'sm:grid-cols-3'
        : filledCount === 2
          ? 'sm:grid-cols-2'
          : '';

  return (
    <section aria-label="운영 액션 패널" className="mb-4 sm:mb-6">
      <div className={`grid grid-cols-1 ${gridCols} gap-3`}>
      {groups.drops.length > 0 && (
      <Panel
        title="가격 하락 Top"
        emoji="📉"
        tone="down"
        totalCount={groups.counts.drops}
        emptyText="전일 대비 하락 없음"
        filterKey="drops"
        onSelectFilter={onSelectFilter}
      >
        {groups.drops.map(({ item, pct }) => (
          <PanelRow
            key={item.product_id}
            item={item}
            onProductClick={onProductClick}
            right={<DeltaBadge pct={pct} />}
          />
        ))}
      </Panel>
      )}

      {groups.rises.length > 0 && (
      <Panel
        title="가격 급등 Top"
        emoji="📈"
        tone="up"
        totalCount={groups.counts.rises}
        emptyText="전일 대비 상승 없음"
        filterKey="rises"
        onSelectFilter={onSelectFilter}
      >
        {groups.rises.map(({ item, pct }) => (
          <PanelRow
            key={item.product_id}
            item={item}
            onProductClick={onProductClick}
            right={<DeltaBadge pct={pct} />}
          />
        ))}
      </Panel>
      )}

      {groups.failed.length > 0 && (
      <Panel
        title="수집 실패"
        emoji="⚠"
        tone="warn"
        totalCount={groups.counts.failed}
        emptyText="실패 없음"
        filterKey="failed"
        onSelectFilter={onSelectFilter}
      >
        {groups.failed.map((item) => (
          <PanelRow
            key={item.product_id}
            item={item}
            onProductClick={onProductClick}
            right={
              <span
                className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5 whitespace-nowrap"
                title={(item.warnings ?? [])
                  .map(
                    (w) =>
                      `${CHANNEL_LABELS[w.channel]}: ${w.last_failure_message || '수집 실패'}`
                  )
                  .join('\n')}
              >
                {item.warnings?.length ?? 0}채널
              </span>
            }
            warnChannels={item.warnings?.map((w) => w.channel)}
          />
        ))}
      </Panel>
      )}

      {groups.missing.length > 0 && (
      <Panel
        title="URL 누락 / 미수집"
        emoji="❓"
        tone="muted"
        totalCount={groups.counts.missing}
        alwaysShowCount
        subtitle={`URL 없음 ${groups.counts.missing_no_url.toLocaleString('ko-KR')} · 미수집 ${groups.counts.missing_not_collected.toLocaleString('ko-KR')}`}
        emptyText="모든 상품 정상 수집"
        filterKey="missing"
        onSelectFilter={onSelectFilter}
      >
        {groups.missing.map((item) => {
          const missingChannels: Channel[] = (['coupang', 'naver', 'danawa'] as Channel[]).filter(
            (ch) => !item.urls[ch]
          );
          // URL이 하나라도 있으면 할 일은 "수집 확인"이다 — 예전엔 URL이 다 있어도 "0/3 누락"으로 보였다
          const label =
            missingChannels.length === 3
              ? 'URL 없음'
              : missingChannels.length === 0
                ? '미수집'
                : `미수집 · URL ${3 - missingChannels.length}/3`;
          return (
            <PanelRow
              key={item.product_id}
              item={item}
              onProductClick={onProductClick}
              right={
                <span className="text-[11px] text-gray-500 whitespace-nowrap">{label}</span>
              }
            />
          );
        })}
      </Panel>
      )}
      </div>
      {emptyNotes.length > 0 && (
        <p className="mt-2 text-xs text-gray-500">✓ {emptyNotes.join(' · ')}</p>
      )}
    </section>
  );
}

interface PanelProps {
  title: string;
  emoji: string;
  tone: 'down' | 'up' | 'warn' | 'muted';
  totalCount: number;
  emptyText: string;
  children: React.ReactNode;
  filterKey?: ChangeFilter;
  onSelectFilter?: (filter: ChangeFilter) => void;
  /** 제목 아래 한 줄 보조 설명 */
  subtitle?: string;
  /** Top N 이하여도 총 건수를 표시 */
  alwaysShowCount?: boolean;
}

function Panel({
  title,
  emoji,
  tone,
  totalCount,
  emptyText,
  children,
  filterKey,
  onSelectFilter,
  subtitle,
  alwaysShowCount = false,
}: PanelProps) {
  const toneClass = {
    down: 'border-blue-200 bg-blue-50/40',
    up: 'border-red-200 bg-red-50/40',
    warn: 'border-orange-200 bg-orange-50/40',
    muted: 'border-gray-200 bg-gray-50/60',
  }[tone];
  const titleColor = {
    down: 'text-blue-800',
    up: 'text-red-800',
    warn: 'text-orange-800',
    muted: 'text-gray-700',
  }[tone];
  const linkColor = {
    down: 'text-blue-700 hover:text-blue-900',
    up: 'text-red-700 hover:text-red-900',
    warn: 'text-orange-700 hover:text-orange-900',
    muted: 'text-gray-700 hover:text-gray-900',
  }[tone];
  const isEmpty =
    typeof children === 'object' &&
    children !== null &&
    Array.isArray(children) &&
    (children as React.ReactNode[]).length === 0;
  const canFilter = !isEmpty && totalCount > 0 && filterKey && onSelectFilter;
  return (
    <div className={`rounded-lg border ${toneClass} p-3 flex flex-col`}>
      <div className="flex items-center justify-between mb-2 gap-2">
        <h3 className={`text-xs font-semibold ${titleColor} flex items-center gap-1.5 min-w-0`}>
          <span aria-hidden>{emoji}</span>
          <span className="truncate">{title}</span>
          {(alwaysShowCount || totalCount > TOP_N) && (
            <span className="text-[11px] text-gray-500 font-normal">
              총 {totalCount.toLocaleString('ko-KR')}건
            </span>
          )}
        </h3>
        {canFilter && (
          <button
            type="button"
            onClick={() => onSelectFilter!(filterKey!)}
            className={`shrink-0 text-[11px] font-medium ${linkColor} hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded`}
            aria-label={`${title} ${totalCount}건 전체 필터로 보기`}
          >
            전체 보기 →
          </button>
        )}
      </div>
      {subtitle && <div className="-mt-1 mb-2 text-[11px] text-gray-500">{subtitle}</div>}
      {isEmpty ? (
        <div className="text-xs text-gray-400 py-2">{emptyText}</div>
      ) : (
        <ul className="space-y-1">{children}</ul>
      )}
    </div>
  );
}

interface PanelRowProps {
  item: PriceWithChange;
  onProductClick?: (item: PriceWithChange) => void;
  right: React.ReactNode;
  warnChannels?: Channel[];
}

function PanelRow({ item, onProductClick, right, warnChannels }: PanelRowProps) {
  const cheapest = cheapestChannel(item);

  const inner = (
    <div className="flex items-center gap-2 min-w-0">
      <span className="flex-1 min-w-0 truncate text-xs text-gray-800" title={item.product_name}>
        {item.brand_name && (
          <span className="text-xs font-semibold text-purple-700 mr-1">
            [{item.brand_name}]
          </span>
        )}
        {item.product_name}
      </span>
      {warnChannels && warnChannels.length > 0 && (
        <span className="flex gap-0.5 shrink-0">
          {warnChannels.map((ch) => (
            <span
              key={ch}
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: CHANNEL_COLORS[ch] }}
              title={CHANNEL_LABELS[ch]}
            />
          ))}
        </span>
      )}
      {cheapest && (
        <span className="text-xs text-gray-600 tabular-nums shrink-0">
          {cheapest.price.toLocaleString('ko-KR')}원
        </span>
      )}
      {right}
    </div>
  );

  return (
    <li>
      {onProductClick ? (
        <button
          type="button"
          onClick={() => onProductClick(item)}
          className="w-full text-left px-2 py-1.5 rounded hover:bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {inner}
        </button>
      ) : (
        <Link
          href={`/products/${item.product_id}`}
          className="block px-2 py-1.5 rounded hover:bg-white/70"
        >
          {inner}
        </Link>
      )}
    </li>
  );
}

function DeltaBadge({ pct }: { pct: number }) {
  const isDown = pct < 0;
  const cls = isDown
    ? 'text-blue-700 bg-blue-50 border-blue-200'
    : 'text-red-700 bg-red-50 border-red-200';
  return (
    <span
      className={`text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded border whitespace-nowrap ${cls}`}
    >
      {isDown ? '▼' : '▲'}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}
