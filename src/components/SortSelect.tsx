'use client';

import type { DashboardSortKey } from '@/types/database';

export const SORT_LABELS: Record<DashboardSortKey, string> = {
  default: '최근 등록순',
  drop: '많이 내린 순',
  rise: '많이 오른 순',
  price_asc: '최저가 낮은 순',
  price_desc: '최저가 높은 순',
  name: '이름순',
};

interface SortSelectProps {
  value: DashboardSortKey;
  onChange: (next: DashboardSortKey) => void;
}

export default function SortSelect({ value, onChange }: SortSelectProps) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-gray-600">
      <span className="sr-only sm:not-sr-only">정렬</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as DashboardSortKey)}
        className="min-h-8 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        {(Object.keys(SORT_LABELS) as DashboardSortKey[]).map((k) => (
          <option key={k} value={k}>
            {SORT_LABELS[k]}
          </option>
        ))}
      </select>
    </label>
  );
}
