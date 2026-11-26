import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { classifyHealth } from '@/lib/collection-health';
import type { CollectionHealth, CollectionHealthCause } from '@/types/database';

/**
 * 수집 상태 요약 — 전 페이지 상단 배너·내비게이션 상태 배지용.
 *
 * 수집이 멈춰도 대시보드는 "실패 0건"으로 보여 정상처럼 읽힌다(실측 2026-11: 118일 중단을 놓침).
 * 그래서 마지막 수집 시각으로 상태를 판정하고, 지연·중단일 때만 외부(GitHub·Bright Data)를
 * 조회해 원인을 붙인다. 정상일 때 외부 호출을 하지 않는 것은 매 페이지 진입마다
 * 외부 API를 두드리지 않기 위해서다.
 */

const EXTERNAL_CACHE_MS = 5 * 60_000;
let externalCache: { at: number; causes: CollectionHealthCause[] } | null = null;

export async function GET() {
  try {
    const supabase = createServiceClient();

    const [logRes, errRes, reqRes] = await Promise.all([
      supabase
        .from('price_logs')
        .select('collected_at')
        .order('collected_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('scrape_errors')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('collect_requests')
        .select('status, error_message, created_at')
        .is('product_id', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (logRes.error) throw new Error(logRes.error.message);

    const lastCollectedAt: string | null = logRes.data?.collected_at ?? null;
    const lastErrorAt: string | null = errRes.data?.created_at ?? null;
    const lastAttemptAt = latestIso(lastCollectedAt, lastErrorAt);

    const hoursSinceCollected = lastCollectedAt
      ? Math.floor((Date.now() - Date.parse(lastCollectedAt)) / 3_600_000)
      : null;
    const status = classifyHealth(hoursSinceCollected);

    const causes: CollectionHealthCause[] = [];
    if (status !== 'ok') {
      const external = await externalCauses();
      const workflowDisabled = external.some((c) => c.code === 'workflow_disabled');
      const lastReq = reqRes.data;
      // 마지막 즉시 수집 요청이 실패로 끝났다면 그 사유가 가장 직접적인 단서다.
      // 단 "꺼진 워크플로라 dispatch 불가"는 workflow_disabled와 같은 원인이라 중복 표시하지 않는다.
      if (lastReq?.status === 'failed' && lastReq.error_message) {
        const reason = readableRequestError(String(lastReq.error_message));
        const duplicate = workflowDisabled && /disabled workflow/i.test(reason);
        if (!duplicate) {
          causes.push({
            code: 'last_request_failed',
            message: `마지막 수집 요청이 실패했습니다: ${reason}`,
          });
        }
      }
      causes.push(...external);
    }

    const body: CollectionHealth = {
      status,
      last_collected_at: lastCollectedAt,
      last_attempt_at: lastAttemptAt,
      hours_since_collected: hoursSinceCollected,
      causes,
      checked_at: new Date().toISOString(),
    };
    return NextResponse.json(body);
  } catch (err) {
    console.error('[api/collect/health]', err);
    return NextResponse.json({ error: '수집 상태 조회 실패' }, { status: 500 });
  }
}

/** collect_requests.error_message에는 GitHub 응답 JSON이 통째로 들어 있어 message만 뽑는다 */
function readableRequestError(raw: string): string {
  const m = raw.match(/"message"\s*:\s*"([^"]+)"/);
  const text = m ? `${raw.split('{')[0].trim()} ${m[1]}`.trim() : raw;
  return text.slice(0, 200);
}

function latestIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

async function externalCauses(): Promise<CollectionHealthCause[]> {
  if (externalCache && Date.now() - externalCache.at < EXTERNAL_CACHE_MS) {
    return externalCache.causes;
  }
  const results = await Promise.all([workflowCause(), brightdataCause()]);
  const causes = results.filter((c): c is CollectionHealthCause => c !== null);
  externalCache = { at: Date.now(), causes };
  return causes;
}

/** GitHub는 60일간 커밋이 없는 저장소의 예약 워크플로를 자동 비활성화한다 */
async function workflowCause(): Promise<CollectionHealthCause | null> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const workflowFile = process.env.GITHUB_WORKFLOW_FILE || 'collect-prices.yml';
  if (!token || !repo) return null;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/${workflowFile}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(10_000),
        cache: 'no-store',
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { state?: string };
    if (!data.state || data.state === 'active') return null;
    const reason =
      data.state === 'disabled_inactivity'
        ? '저장소에 60일간 활동이 없어 GitHub가 자동으로 껐습니다'
        : '수동으로 비활성화돼 있습니다';
    return {
      code: 'workflow_disabled',
      message: `수집 워크플로가 꺼져 있습니다 (${reason}). GitHub Actions에서 다시 켜야 예약 수집이 돕니다.`,
      href: `https://github.com/${repo}/actions/workflows/${workflowFile}`,
    };
  } catch {
    return null;
  }
}

async function brightdataCause(): Promise<CollectionHealthCause | null> {
  const token = process.env.BRIGHTDATA_API_TOKEN;
  if (!token) {
    return {
      code: 'brightdata_invalid_token',
      message: 'Bright Data API 토큰이 설정되지 않았습니다.',
      href: '/brightdata',
    };
  }
  try {
    const res = await fetch('https://api.brightdata.com/customer/balance', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    if (res.status === 401) {
      return {
        code: 'brightdata_invalid_token',
        message: 'Bright Data API 토큰이 유효하지 않습니다.',
        href: '/brightdata',
      };
    }
    // 403은 잔액 조회 권한만 없는 경우라 수집 자체와는 무관 — 원인으로 올리지 않는다
    if (!res.ok) return null;
    const data = (await res.json()) as { balance?: unknown };
    if (typeof data.balance === 'number' && data.balance <= 0) {
      return {
        code: 'brightdata_no_balance',
        message: `Bright Data 잔액이 없습니다 ($${data.balance.toFixed(2)}).`,
        href: '/brightdata',
      };
    }
    return null;
  } catch {
    return {
      code: 'brightdata_unreachable',
      message: 'Bright Data API에 연결하지 못했습니다.',
      href: '/brightdata',
    };
  }
}
