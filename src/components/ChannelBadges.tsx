import type { Channel } from '@/types/database';

const CHANNELS: Channel[] = ['coupang', 'naver', 'danawa'];
const SHORT: Record<Channel, string> = { coupang: '쿠', naver: '네', danawa: '다' };
const FULL: Record<Channel, string> = { coupang: '쿠팡', naver: '네이버', danawa: '다나와' };
const COLORS: Record<Channel, string> = {
  coupang: '#E44232',
  naver: '#03C75A',
  danawa: '#0068B7',
};

/**
 * 채널 URL 등록 여부 — 색 점만으로는 어느 점이 어느 채널인지 범례 없이 알 수 없어
 * 채널 첫 글자를 넣고, 미등록은 회색 취소선으로 색 없이도 구분되게 한다.
 */
export default function ChannelBadges({
  urls,
}: {
  urls: Record<Channel, string | null>;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      {CHANNELS.map((ch) => {
        const has = !!urls[ch];
        return (
          <span
            key={ch}
            title={`${FULL[ch]}: ${has ? '등록됨' : '미등록'}`}
            aria-label={`${FULL[ch]} ${has ? '등록됨' : '미등록'}`}
            className={`inline-flex items-center justify-center w-5 h-5 rounded text-[11px] font-bold ${
              has ? 'text-white' : 'bg-gray-100 text-gray-400 line-through'
            }`}
            style={has ? { backgroundColor: COLORS[ch] } : undefined}
          >
            {SHORT[ch]}
          </span>
        );
      })}
    </span>
  );
}
