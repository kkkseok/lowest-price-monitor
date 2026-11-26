'use client';

import { useState } from 'react';
import type { Channel } from '@/types/database';
import { normalizeUrl, validateUrl } from './ProductForm';
import { useToast } from './Toast';

const PLACEHOLDERS: Record<Channel, string> = {
  coupang: 'https://www.coupang.com/vp/products/...',
  naver: 'https://search.shopping.naver.com/catalog/...',
  danawa: 'https://prod.danawa.com/info/?pcode=...',
};

interface InlineUrlEditorProps {
  productId: string;
  productName: string;
  channel: Channel;
  onSaved: () => void;
}

/**
 * 상품 관리 펼친 행에서 누락된 채널 URL을 모달 없이 바로 채우는 입력칸.
 * 등록 폼과 같은 검증·정규화·URL 중복 차단을 거친다 — 여기만 느슨하면 같은 페이지가
 * 두 상품에 등록돼 수집이 이중으로 돈다.
 */
export default function InlineUrlEditor({
  productId,
  productName,
  channel,
  onSaved,
}: InlineUrlEditorProps) {
  const toast = useToast();
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const check = validateUrl(channel, value);

  const save = async () => {
    const url = normalizeUrl(channel, value);
    if (!url || !check.ok) return;
    setSaving(true);
    try {
      const dupRes = await fetch('/api/products/check-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            { rowIndex: 0, name: productName, [`${channel}_url`]: url, excludeId: productId },
          ],
        }),
      });
      if (dupRes.ok) {
        const json = (await dupRes.json()) as {
          results?: Array<{ duplicates: Array<{ kind: string; productName: string }> }>;
        };
        const hit = json.results?.[0]?.duplicates.find((d) => d.kind === 'urlMatch');
        if (hit) {
          toast.error(`이 URL은 이미 "${hit.productName}"에 등록돼 있습니다.`);
          return;
        }
      }
      const res = await fetch(`/api/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [`${channel}_url`]: url }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error || 'URL 저장 실패');
        return;
      }
      toast.success('URL을 저장했습니다. 다음 수집부터 반영됩니다.');
      setValue('');
      onSaved();
    } catch {
      toast.error('URL 저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 min-w-0">
      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input
          type="url"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={PLACEHOLDERS[channel]}
          aria-label={`${productName} ${channel} URL 입력`}
          className={`flex-1 min-w-0 px-2 py-1 text-xs border rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            check.ok ? 'border-gray-300' : 'border-red-400'
          }`}
        />
        <button
          type="submit"
          disabled={saving || !value.trim() || !check.ok}
          className="shrink-0 px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {saving ? '저장 중' : '저장'}
        </button>
      </form>
      {(check.error || check.warning) && (
        <p className={`mt-1 text-[11px] ${check.error ? 'text-red-600' : 'text-amber-700'}`}>
          {check.error ?? check.warning}
        </p>
      )}
    </div>
  );
}
