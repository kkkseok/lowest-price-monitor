'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { PriceWithChange, Channel, DashboardSortKey } from '@/types/database';
import PriceChangeIndicator from './PriceChangeIndicator';
import Sparkline from './Sparkline';
import CollectProductButton from './CollectProductButton';
import {
  cheapestChannel,
  changePercent,
  lastKnownCheapest,
  productChangePercent,
  shortDate,
} from '@/lib/price-utils';

interface PriceTableProps {
  data: PriceWithChange[];
  sparklineMap?: Record<string, number[]>;
  collectingIds?: Set<string>;
  globalCollecting?: boolean;
  onCollectProduct?: (id: string) => void;
  /** 서버 정렬 상태 — data는 이미 이 순서로 정렬돼 온다 */
  sort: DashboardSortKey;
  onSortChange: (next: DashboardSortKey) => void;
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

const CHANNELS: Channel[] = ['coupang', 'naver', 'danawa'];

type SortDir = 'asc' | 'desc';

export default function PriceTable({
  data,
  sparklineMap,
  collectingIds,
  globalCollecting,
  onCollectProduct,
  sort,
  onSortChange,
}: PriceTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const sorted = data;

  // 헤더 클릭 → 서버 정렬 키. 같은 헤더를 다시 누르면 방향만 뒤집는다.
  const priceActive = sort === 'price_asc' || sort === 'price_desc';
  const changeActive = sort === 'drop' || sort === 'rise';

  const toggleRow = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (data.length === 0) {
    return (
      <div className="p-12 text-center text-gray-400">표시할 상품이 없습니다.</div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse">
        <thead>
          <tr className="bg-gray-50 border-b">
            <th className="w-8 px-2 py-3"></th>
            <SortableHeader
              label="상품명"
              active={sort === 'name'}
              dir="asc"
              onClick={() => onSortChange(sort === 'name' ? 'default' : 'name')}
              align="left"
            />
            <SortableHeader
              label="최저가"
              active={priceActive}
              dir={sort === 'price_desc' ? 'desc' : 'asc'}
              onClick={() => onSortChange(sort === 'price_asc' ? 'price_desc' : 'price_asc')}
              align="right"
            />
            <SortableHeader
              label="변동률"
              active={changeActive}
              dir={sort === 'rise' ? 'desc' : 'asc'}
              onClick={() => onSortChange(sort === 'drop' ? 'rise' : 'drop')}
              align="right"
            />
            {CHANNELS.map((ch) => (
              <th
                key={ch}
                scope="col"
                className="hidden lg:table-cell px-3 py-3 text-right text-sm font-semibold text-gray-700"
              >
                {CHANNEL_LABELS[ch]}
              </th>
            ))}
            <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
              7일 추이
            </th>
            <th className="px-2 py-3 text-center text-sm font-semibold text-gray-700 w-12">
              수집
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((item) => {
            const cheapest = cheapestChannel(item);
            const pct = productChangePercent(item);
            const isExpanded = expanded.has(item.product_id);
            const sparkline = sparklineMap?.[item.product_id];

            return (
              <RowGroup
                key={item.product_id}
                item={item}
                cheapest={cheapest}
                pct={pct}
                isExpanded={isExpanded}
                onToggle={() => toggleRow(item.product_id)}
                sparkline={sparkline}
                collecting={collectingIds?.has(item.product_id) ?? false}
                globalCollecting={globalCollecting ?? false}
                onCollectProduct={onCollectProduct}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface SortableHeaderProps {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: 'left' | 'right' | 'center';
}

function SortableHeader({ label, active, dir, onClick, align = 'left' }: SortableHeaderProps) {
  const alignClass =
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  const ariaSort = active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={`px-4 py-3 ${alignClass} text-sm font-semibold text-gray-700`}
    >
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 select-none hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
      >
        {label}
        <span className={`text-xs ${active ? 'text-blue-600' : 'text-gray-300'}`} aria-hidden>
          {active ? (dir === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      </button>
    </th>
  );
}

interface RowGroupProps {
  item: PriceWithChange;
  cheapest: ReturnType<typeof cheapestChannel>;
  pct: number | null;
  isExpanded: boolean;
  onToggle: () => void;
  sparkline?: number[];
  collecting: boolean;
  globalCollecting: boolean;
  onCollectProduct?: (id: string) => void;
}

function RowGroup({
  item,
  cheapest,
  pct,
  isExpanded,
  onToggle,
  sparkline,
  collecting,
  globalCollecting,
  onCollectProduct,
}: RowGroupProps) {
  const cheapestPrice = cheapest?.price ?? null;
  const cheapestChannelKey = cheapest?.channel ?? null;
  const cheapestStoreName =
    cheapest && cheapest.channel !== 'coupang' ? cheapest.store_name : null;
  const hasFailures = !!item.warnings && item.warnings.length > 0;
  const stale = cheapest ? null : lastKnownCheapest(item);

  return (
    <>
      <tr
        className="border-b hover:bg-blue-50/30 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="px-2 py-3 text-center">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? '채널 상세 닫기' : '채널 상세 펼치기'}
            className="text-gray-400 hover:text-blue-600 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            {isExpanded ? '▼' : '▶'}
          </button>
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              {item.brand_name && (
                <span className="text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded px-1.5 py-0.5">
                  {item.brand_name}
                </span>
              )}
              <Link
                href={`/products/${item.product_id}`}
                className="text-blue-600 hover:underline font-medium"
                onClick={(e) => e.stopPropagation()}
              >
                {item.product_name}
              </Link>
              {hasFailures && (
                <span
                  className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5"
                  title={item
                    .warnings!.map(
                      (w) =>
                        `${CHANNEL_LABELS[w.channel]}: ${w.last_failure_message || '수집 실패'}`
                    )
                    .join('\n')}
                >
                  ⚠ {item.warnings!.length}
                </span>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-right">
          {cheapestPrice !== null ? (
            <div className="flex flex-col items-end gap-0.5">
              <div className="flex items-center justify-end gap-2">
                {cheapestChannelKey && (
                  <span
                    className="inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-900"
                    title={`${CHANNEL_LABELS[cheapestChannelKey]} 최저`}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: CHANNEL_COLORS[cheapestChannelKey] }}
                      aria-hidden
                    />
                    {CHANNEL_LABELS[cheapestChannelKey]}
                  </span>
                )}
                <span className="font-semibold text-gray-900 tabular-nums">
                  {cheapestPrice.toLocaleString('ko-KR')}원
                </span>
              </div>
              {cheapestStoreName && (
                <span
                  className="text-xs text-gray-500 truncate max-w-[140px]"
                  title={cheapestStoreName}
                >
                  @ {cheapestStoreName}
                </span>
              )}
            </div>
          ) : stale ? (
            <div
              className="flex flex-col items-end gap-0.5"
              title="오늘·어제 수집값이 없어 마지막으로 수집된 가격을 보여줍니다"
            >
              <span className="font-semibold text-gray-400 tabular-nums">
                {stale.price.toLocaleString('ko-KR')}원
              </span>
              <span className="text-xs text-amber-700">
                {shortDate(stale.date)} 기준 · {CHANNEL_LABELS[stale.channel]}
              </span>
            </div>
          ) : (
            <span className="text-xs text-gray-400">수집 이력 없음</span>
          )}
        </td>
        <td className="px-4 py-3 text-right">
          {cheapest && cheapest.change !== null ? (
            <PriceChangeIndicator change={cheapest.change} percent={pct} />
          ) : (
            <span className="text-xs text-gray-400">-</span>
          )}
        </td>
        {/* 채널별 가격 — 넓은 화면에서 행을 펼치지 않고 세 채널을 바로 비교 */}
        {CHANNELS.map((ch) => {
          const cp = item.prices.find((p) => p.channel === ch);
          const isCheapest = cheapestChannelKey === ch;
          return (
            <td key={ch} className="hidden lg:table-cell px-3 py-3 text-right tabular-nums text-sm">
              {cp && cp.price > 0 ? (
                <span className={isCheapest ? 'font-semibold text-gray-900' : 'text-gray-700'}>
                  {cp.price.toLocaleString('ko-KR')}
                </span>
              ) : cp?.last_known ? (
                <span className="text-gray-400" title={`${cp.last_known.date} 수집값`}>
                  {cp.last_known.price.toLocaleString('ko-KR')}
                </span>
              ) : (
                <span className="text-gray-300">{item.urls[ch] ? '-' : '미등록'}</span>
              )}
            </td>
          );
        })}
        <td className="px-4 py-3">
          <div className="flex justify-center">
            <Sparkline values={sparkline ?? []} width={80} height={24} />
          </div>
        </td>
        <td className="px-2 py-3 text-center">
          {onCollectProduct && (
            <CollectProductButton
              productId={item.product_id}
              collecting={collecting}
              disabled={globalCollecting}
              onClick={onCollectProduct}
            />
          )}
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-gray-50/50 border-b">
          <td></td>
          {/* 이름·최저가·변동률 + 채널 3열 + 추이·수집 = 8열 (좁은 화면에선 채널 열이 숨지만 초과 colSpan은 무해) */}
          <td colSpan={8} className="px-4 py-3">
            <ChannelDetailGrid item={item} cheapestChannel={cheapestChannelKey} />
          </td>
        </tr>
      )}
    </>
  );
}

function ChannelDetailGrid({
  item,
  cheapestChannel,
}: {
  item: PriceWithChange;
  cheapestChannel: Channel | null;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {CHANNELS.map((ch) => {
        const channelPrice = item.prices.find((p) => p.channel === ch);
        const warning = item.warnings?.find((w) => w.channel === ch);
        const url = item.urls?.[ch];
        const isCheapest = cheapestChannel === ch;
        const pct = channelPrice ? changePercent(channelPrice) : null;

        const inner = (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: CHANNEL_COLORS[ch] }}
                  aria-hidden
                />
                {CHANNEL_LABELS[ch]}
                {isCheapest && <span className="ml-1">👑</span>}
              </span>
              {url && <span className="text-xs text-gray-400">↗</span>}
            </div>
            {warning && (
              <div className="text-xs text-red-600 bg-red-50 rounded px-2 py-1 mb-2">
                <div>연속 {warning.consecutive_failures}회 수집 실패</div>
                {warning.last_failure_message && (
                  <div className="mt-0.5 text-[11px] text-red-700 break-words">
                    {warning.last_failure_message}
                    {warning.last_failure_at && (
                      <span className="text-red-400">
                        {' · '}
                        {new Date(warning.last_failure_at).toLocaleString('ko-KR', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
            {channelPrice && channelPrice.price > 0 ? (
              <>
                <div className="text-base font-bold text-gray-900 tabular-nums">
                  {channelPrice.price.toLocaleString('ko-KR')}원
                </div>
                <div className="mt-1">
                  <PriceChangeIndicator
                    change={channelPrice.change}
                    percent={pct}
                  />
                </div>
                {channelPrice.store_name && (
                  <div className="mt-1 text-xs text-gray-500">
                    {channelPrice.store_name}
                  </div>
                )}
              </>
            ) : channelPrice?.last_known ? (
              <>
                <div className="text-base font-bold text-gray-400 tabular-nums">
                  {channelPrice.last_known.price.toLocaleString('ko-KR')}원
                </div>
                <div className="mt-1 text-xs text-amber-700">
                  {channelPrice.last_known.date} 수집값 (최근 이틀 수집 없음)
                </div>
                {channelPrice.last_known.store_name && (
                  <div className="mt-1 text-xs text-gray-500">
                    {channelPrice.last_known.store_name}
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-gray-400">
                {url ? '수집 이력 없음' : 'URL 미등록'}
              </div>
            )}
          </>
        );

        const baseClass = `block rounded-md border p-3 transition-colors ${
          isCheapest
            ? 'border-yellow-400 bg-yellow-50/40'
            : 'border-gray-200 bg-white'
        }`;

        return url ? (
          <a
            key={ch}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`${baseClass} cursor-pointer hover:border-blue-400 hover:bg-blue-50/40`}
            title={`${CHANNEL_LABELS[ch]} 페이지로 이동`}
          >
            {inner}
          </a>
        ) : (
          <div key={ch} className={baseClass}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
