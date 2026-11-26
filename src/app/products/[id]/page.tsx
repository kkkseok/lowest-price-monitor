import { notFound } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase';
import ProductDetailClient, { type Period } from '@/components/ProductDetailClient';
import type { PriceLog, Product } from '@/types/database';

const DEFAULT_PERIOD: Period = '30d';
const DAY_MS = 24 * 60 * 60 * 1000;

function startDateFor(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

/**
 * 기본 기간(30일)에 기록이 없을 때 마지막 기록이 들어오는 가장 짧은 기간.
 * 수집이 멈춘 상품을 열면 "수집된 가격이 없습니다"만 보여 이력이 없는 것처럼 읽히던 문제 대응.
 * price_daily를 보는 이유: price_logs 원본은 보존 기간(6개월) 뒤 삭제되지만 요약은 남는다.
 */
function periodCovering(latestDate: string): Period {
  const ageDays = (Date.now() - Date.parse(`${latestDate}T00:00:00+09:00`)) / DAY_MS;
  return ageDays <= 89 ? '90d' : 'all';
}

/**
 * 상품 상세 — 서버 컴포넌트.
 * product와 초기 30일치 price history를 Promise.all로 프리페치 후 클라이언트 컴포넌트에 전달.
 * 마운트 직후 두 번의 클라이언트 fetch를 기다리지 않도록 한다.
 */
export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createServiceClient();

  const [productRes, historyRes] = await Promise.all([
    supabase
      .from('products')
      .select('*, brand:brands(id, name)')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('price_logs')
      .select('*')
      .eq('product_id', id)
      .eq('is_suspicious', false)
      .gte('collected_at', startDateFor(30))
      .order('collected_at', { ascending: false }),
  ]);

  if (productRes.error || !productRes.data) {
    notFound();
  }

  const raw = productRes.data as Product & { brand: { id: string; name: string } | null };
  const product: Product = { ...raw, brand_name: raw.brand?.name ?? null };
  const defaultHistory = (historyRes.data ?? []) as PriceLog[];

  let initialPeriod: Period = DEFAULT_PERIOD;
  let initialHistory: PriceLog[] | undefined = defaultHistory;
  let autoExpandedFrom: Period | null = null;
  if (defaultHistory.length === 0) {
    const { data: latest } = await supabase
      .from('price_daily')
      .select('date')
      .eq('product_id', id)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest?.date) {
      initialPeriod = periodCovering(latest.date);
      autoExpandedFrom = DEFAULT_PERIOD;
      // 넓힌 기간은 보존 기간 밖 구간을 price_daily로 메워야 해서 /api/prices에 맡긴다
      initialHistory = undefined;
    }
  }

  return (
    <ProductDetailClient
      productId={id}
      initialProduct={product}
      initialPeriod={initialPeriod}
      initialHistory={initialHistory}
      autoExpandedFrom={autoExpandedFrom}
    />
  );
}
