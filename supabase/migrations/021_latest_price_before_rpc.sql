-- 대시보드 "마지막으로 알려진 가격" 조회 RPC.
--
-- 배경: 대시보드 현재가는 price_daily의 오늘/어제 2일 슬라이스만 본다. 수집이 며칠 멈추면
-- 이력이 있는 상품도 전부 "데이터 없음"으로 보여, 수집 중단과 미등록 상품이 구분되지 않는다.
-- 그래서 오늘/어제 값이 없는 (상품×채널)에 한해 p_before 이전의 가장 최근 일자 1행을 돌려준다.
--
-- DISTINCT ON 대신 (상품×채널)별 LATERAL LIMIT 1을 쓰는 이유: price_daily는 무기한 보존이라
-- DISTINCT ON은 상품의 전 이력을 훑는다. LATERAL은 PK(product_id, channel, date) 역방향
-- 인덱스 스캔 1회로 끝나 이력 길이와 무관하다.
--
-- 호출측은 PostgREST 1,000행 상한 아래로 유지하려고 상품 300개 이하 청크로 호출한다(≤ 900행).
CREATE OR REPLACE FUNCTION latest_price_before(
  p_product_ids uuid[],
  p_before date
)
RETURNS TABLE(
  product_id uuid,
  channel text,
  date date,
  latest_price integer,
  latest_store_name text,
  latest_is_suspicious boolean
)
LANGUAGE sql
STABLE
AS $$
  SELECT x.product_id, x.channel, x.date, x.latest_price, x.latest_store_name, x.latest_is_suspicious
  FROM unnest(p_product_ids) AS pid
  CROSS JOIN (VALUES ('coupang'), ('naver'), ('danawa')) AS c(ch)
  CROSS JOIN LATERAL (
    SELECT d.product_id, d.channel, d.date, d.latest_price, d.latest_store_name, d.latest_is_suspicious
    FROM price_daily d
    WHERE d.product_id = pid
      AND d.channel = c.ch
      AND d.date < p_before
      -- 정상 로그가 있던 날만 — min_price가 NULL이면 그날 latest_*는 이상치 로그다
      AND d.min_price IS NOT NULL
    ORDER BY d.date DESC
    LIMIT 1
  ) AS x
  ORDER BY x.product_id, x.channel;
$$;
