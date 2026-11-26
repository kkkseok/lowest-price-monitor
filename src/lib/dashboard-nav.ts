/**
 * 대시보드 ↔ 상품 상세 이동 맥락 (sessionStorage).
 *
 * 상세의 "← 대시보드로"가 `/`로 가면 검색·필터·정렬·페이지가 전부 초기화돼, 여러 상품을
 * 차례로 점검할 때 매번 조건을 다시 걸어야 했다. 대시보드가 마지막 URL과 현재 페이지의
 * 상품 순서를 남기면, 상세는 그 URL로 돌아가고 같은 순서로 이전/다음 상품을 연다.
 * 탭 단위로만 유지하려고 localStorage가 아닌 sessionStorage를 쓴다.
 */
const URL_KEY = 'dashboard:lastUrl';
const IDS_KEY = 'dashboard:lastIds';

export function saveDashboardContext(url: string, ids: { id: string; name: string }[]): void {
  try {
    sessionStorage.setItem(URL_KEY, url);
    sessionStorage.setItem(IDS_KEY, JSON.stringify(ids));
  } catch {
    // 저장 불가(사파리 프라이빗 등)면 기본 동작(`/`, 이전/다음 없음)으로 남는다
  }
}

export function loadDashboardUrl(): string {
  try {
    const url = sessionStorage.getItem(URL_KEY);
    return url && url.startsWith('/') ? url : '/';
  } catch {
    return '/';
  }
}

export function loadNeighbors(
  productId: string
): { prev: { id: string; name: string } | null; next: { id: string; name: string } | null } {
  try {
    const raw = sessionStorage.getItem(IDS_KEY);
    const ids = raw ? (JSON.parse(raw) as { id: string; name: string }[]) : [];
    const i = ids.findIndex((x) => x.id === productId);
    if (i < 0) return { prev: null, next: null };
    return { prev: ids[i - 1] ?? null, next: ids[i + 1] ?? null };
  } catch {
    return { prev: null, next: null };
  }
}
