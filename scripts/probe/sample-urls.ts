import { writeFileSync } from 'node:fs';
import { createServiceClient } from '../../src/lib/supabase';

/**
 * Scrapling 프로브용 샘플 URL을 DB에서 읽어 JSON 파일로 쓴다 (읽기 전용).
 * 저장소가 공개라 URL을 커밋하지 않고 실행 시점에 가져온다.
 * 사용: npx tsx scripts/probe/sample-urls.ts <out.json> [perChannel=10]
 */
const COLUMNS = ['coupang_url', 'naver_url', 'danawa_url'] as const;

async function main(): Promise<void> {
  const out = process.argv[2];
  const per = Number(process.argv[3] ?? 10);
  if (!out) throw new Error('출력 경로가 필요합니다');

  const supabase = createServiceClient();
  const result: Record<string, string[]> = {};
  for (const col of COLUMNS) {
    const { data, error } = await supabase
      .from('products')
      .select(col)
      .eq('is_active', true)
      .not(col, 'is', null)
      .order('created_at', { ascending: false })
      .limit(per);
    if (error) throw new Error(`${col} 조회 실패: ${error.message}`);
    result[col] = (data ?? []).map((r) => (r as Record<string, string>)[col]);
  }
  writeFileSync(out, JSON.stringify(result));
  console.log(Object.entries(result).map(([k, v]) => `${k}=${v.length}`).join(' '));
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
