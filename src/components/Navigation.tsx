'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCollectionHealth } from '@/hooks/useCollectionHealth';
import type { CollectionHealthStatus } from '@/types/database';

const NAV_ITEMS = [
  { href: '/', label: '대시보드' },
  { href: '/products/manage', label: '상품 관리' },
  { href: '/export', label: '이력 내보내기' },
  { href: '/errors', label: '에러 로그' },
  { href: '/brightdata', label: 'API 사용량' },
];

const HEALTH_BADGE: Record<CollectionHealthStatus, { label: string; cls: string }> = {
  ok: { label: '수집 정상', cls: 'bg-green-50 text-green-700 border-green-200' },
  delayed: { label: '수집 지연', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  stopped: { label: '수집 중단', cls: 'bg-red-50 text-red-700 border-red-200' },
  unknown: { label: '수집 이력 없음', cls: 'bg-gray-50 text-gray-600 border-gray-200' },
};

export default function Navigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // 어느 화면에 있든 수집 상태를 한눈에 — 배너는 스크롤하면 사라지지만 내비는 늘 보인다
  const { health } = useCollectionHealth();
  const badge = health ? HEALTH_BADGE[health.status] : null;

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  const closeMenu = () => setOpen(false);

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm relative z-30">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-14 gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href="/"
              className="text-lg font-bold text-gray-900 whitespace-nowrap"
            >
              최저가 모니터
            </Link>
            {badge && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium whitespace-nowrap ${badge.cls}`}
                title={
                  health?.last_collected_at
                    ? `마지막 수집: ${new Date(health.last_collected_at).toLocaleString('ko-KR')}`
                    : undefined
                }
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden />
                {badge.label}
              </span>
            )}
          </div>

          {/* 데스크톱 메뉴 (≥ md) */}
          <div className="hidden md:flex gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive(item.href)
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* 모바일 햄버거 (< md) */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-md text-gray-700 hover:bg-gray-100"
            aria-label={open ? '메뉴 닫기' : '메뉴 열기'}
            aria-expanded={open}
          >
            {open ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M6 6l12 12M6 18L18 6" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* 모바일 메뉴 펼침 */}
      {open && (
        <div className="md:hidden border-t border-gray-200 bg-white shadow-md">
          <div className="max-w-7xl mx-auto px-4 py-2 flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMenu}
                className={`block px-3 py-3 rounded-md text-sm font-medium ${
                  isActive(item.href)
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
