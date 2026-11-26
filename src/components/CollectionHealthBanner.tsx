'use client';

import Link from 'next/link';
import { useCollectionHealth } from '@/hooks/useCollectionHealth';
import { formatElapsedHours } from '@/lib/collection-health';

/**
 * 수집 지연·중단 경고 배너 — 모든 페이지 상단.
 * 정상(ok)일 때는 아무것도 그리지 않는다. 상태 조회 자체가 실패해도 조용히 숨기지 않고
 * 알린다 — 상태를 모르는 것을 정상으로 보이게 하면 이 배너를 둔 의미가 없다.
 */
export default function CollectionHealthBanner() {
  const { health, error } = useCollectionHealth();

  if (error) {
    return (
      <Banner tone="warn" title="수집 상태를 확인하지 못했습니다">
        <p>{error}</p>
      </Banner>
    );
  }
  if (!health || health.status === 'ok') return null;

  const title =
    health.status === 'unknown'
      ? '아직 수집된 가격이 없습니다'
      : health.status === 'stopped'
        ? `가격 수집이 ${formatElapsedHours(health.hours_since_collected ?? 0)}째 멈춰 있습니다`
        : `가격 수집이 ${formatElapsedHours(health.hours_since_collected ?? 0)}째 지연되고 있습니다`;

  return (
    <Banner tone={health.status === 'delayed' ? 'warn' : 'danger'} title={title}>
      {health.last_collected_at && (
        <p>
          마지막 수집:{' '}
          {new Date(health.last_collected_at).toLocaleString('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
          . 화면의 가격은 그 시점 기준입니다.
        </p>
      )}
      {health.causes.length > 0 ? (
        <ul className="mt-1.5 space-y-1">
          {health.causes.map((c) => (
            <li key={c.code} className="flex flex-wrap items-baseline gap-x-2">
              <span>• {c.message}</span>
              {c.href &&
                (c.href.startsWith('/') ? (
                  <Link href={c.href} className="font-medium underline underline-offset-2">
                    확인하기
                  </Link>
                ) : (
                  <a
                    href={c.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium underline underline-offset-2"
                  >
                    확인하기 ↗
                  </a>
                ))}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1">
          자동으로 찾은 원인이 없습니다. GitHub Actions의 Collect Prices 실행 기록을 확인해 주세요.
        </p>
      )}
    </Banner>
  );
}

function Banner({
  tone,
  title,
  children,
}: {
  tone: 'warn' | 'danger';
  title: string;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === 'danger'
      ? 'bg-red-50 border-red-200 text-red-800'
      : 'bg-amber-50 border-amber-200 text-amber-900';
  return (
    <div role="alert" className={`mb-4 rounded-lg border px-4 py-3 text-sm ${toneClass}`}>
      <div className="font-semibold">⚠ {title}</div>
      <div className="mt-1 text-[13px] leading-relaxed">{children}</div>
    </div>
  );
}
