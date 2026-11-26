'use client';

interface CollectProductButtonProps {
  productId: string;
  collecting: boolean;
  disabled: boolean;
  onClick: (id: string) => void;
  size?: 'sm' | 'md';
  disabledTitle?: string;
}

export default function CollectProductButton({
  productId,
  collecting,
  disabled,
  onClick,
  size = 'md',
  disabledTitle,
}: CollectProductButtonProps) {
  const title = collecting
    ? '수집 중...'
    : disabled
      ? (disabledTitle ?? '전체 수집이 진행 중입니다')
      : '이 상품만 즉시 수집';

  // 24px 미만 타깃은 마우스로도 빗맞기 쉽다 — 최소 32px
  const sizeClass = size === 'sm' ? 'w-8 h-8 text-sm' : 'w-9 h-9 text-base';

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        if (collecting || disabled) return;
        onClick(productId);
      }}
      disabled={collecting || disabled}
      title={title}
      aria-label={title}
      className={`inline-flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:border-blue-400 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${sizeClass}`}
    >
      {collecting ? (
        <span className="inline-block w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      ) : (
        <span aria-hidden>↻</span>
      )}
    </button>
  );
}
