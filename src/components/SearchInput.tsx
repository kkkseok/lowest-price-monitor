'use client';

import { useEffect, useRef } from 'react';

interface SearchInputProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}

/** 입력 중인 곳에서 `/`를 쳤을 때는 단축키로 가로채지 않는다 */
function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export default function SearchInput({
  value,
  onChange,
  placeholder = '상품명 검색...',
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // `/` = 검색창으로, 검색창에서 Esc = 검색어 지우기 — 목록 화면에서 가장 자주 하는 동작
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      // 모달이 열려 있으면 뒤의 검색창으로 포커스를 빼앗지 않는다
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="relative flex-1 min-w-[200px] max-w-md">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
        🔍
      </span>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault();
            onChange('');
          }
        }}
        placeholder={placeholder}
        aria-keyshortcuts="/"
        className="w-full pl-9 pr-16 py-2 text-sm border border-gray-300 rounded-md bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
          aria-label="검색어 지우기"
        >
          ✕
        </button>
      ) : (
        <kbd
          className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded border border-gray-200 bg-gray-50 text-[11px] text-gray-400 pointer-events-none"
          aria-hidden
        >
          /
        </kbd>
      )}
    </div>
  );
}
