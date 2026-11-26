import type { CollectionHealthStatus } from '@/types/database';

/**
 * 수집 상태 판정 기준(시간). 크론은 하루 1회(08:00 KST)라 정상이어도 최대 ~24시간 공백이 생긴다.
 * 크론 지연·1회 누락을 감안해 36시간까지는 정상, 72시간(크론 3회 연속 누락)부터 중단으로 본다.
 */
export const HEALTH_DELAYED_HOURS = 36;
export const HEALTH_STOPPED_HOURS = 72;

export function classifyHealth(hoursSinceCollected: number | null): CollectionHealthStatus {
  if (hoursSinceCollected === null) return 'unknown';
  if (hoursSinceCollected >= HEALTH_STOPPED_HOURS) return 'stopped';
  if (hoursSinceCollected >= HEALTH_DELAYED_HOURS) return 'delayed';
  return 'ok';
}

/** "N시간" / "N일" — 배너·배지 공용 */
export function formatElapsedHours(hours: number): string {
  if (hours < 48) return `${hours}시간`;
  return `${Math.floor(hours / 24)}일`;
}
