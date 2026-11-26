'use client';

import { useState } from 'react';

interface PaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  onChange: (page: number) => void;
  /** 상단 배치용 — 총 개수 문구를 생략해 한 줄로 */
  compact?: boolean;
}

/**
 * 이전/다음 + 쪽 번호 직접 입력. 30쪽이 넘는 목록에서 이전/다음만으로는 원하는 쪽까지 갈 수 없다.
 */
export default function Pagination({
  page,
  totalPages,
  totalItems,
  onChange,
  compact = false,
}: PaginationProps) {
  const [draft, setDraft] = useState<string | null>(null);
  if (totalPages <= 1) return null;

  const go = (p: number) => onChange(Math.min(totalPages, Math.max(1, p)));
  const commitDraft = () => {
    if (draft === null) return;
    const n = parseInt(draft, 10);
    setDraft(null);
    if (Number.isFinite(n)) go(n);
  };

  const btn =
    'min-h-8 px-3 py-1 border border-gray-300 rounded bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <nav
      aria-label="페이지 이동"
      className="flex items-center justify-center gap-2 text-sm text-gray-600"
    >
      <button type="button" className={btn} onClick={() => go(page - 1)} disabled={page <= 1}>
        ← 이전
      </button>
      <span className="inline-flex items-center gap-1 tabular-nums">
        <input
          type="number"
          min={1}
          max={totalPages}
          value={draft ?? String(page)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitDraft();
          }}
          aria-label="쪽 번호"
          className="w-14 min-h-8 px-1.5 py-1 text-center border border-gray-300 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        />
        <span>/ {totalPages}쪽</span>
        {!compact && (
          <span className="ml-1 text-gray-400">(총 {totalItems.toLocaleString('ko-KR')}개)</span>
        )}
      </span>
      <button
        type="button"
        className={btn}
        onClick={() => go(page + 1)}
        disabled={page >= totalPages}
      >
        다음 →
      </button>
    </nav>
  );
}
