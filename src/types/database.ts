/** 수집 채널 */
export type Channel = 'coupang' | 'naver' | 'danawa';

/** brands 테이블 */
export interface Brand {
  id: string;
  name: string;
  created_at: string;
}

/** products 테이블 — brand_name은 brand join 결과(API 응답에만 채워짐) */
export interface Product {
  id: string;
  name: string;
  sabangnet_code: string | null;
  brand_id: string | null;
  brand_name?: string | null;
  coupang_url: string | null;
  naver_url: string | null;
  danawa_url: string | null;
  created_at: string;
  is_active: boolean;
}

/** price_logs 테이블 */
export interface PriceLog {
  id: string;
  product_id: string;
  channel: Channel;
  price: number;
  store_name: string | null;
  collected_at: string;
  is_manual: boolean;
  is_suspicious: boolean;
}

/**
 * price_daily 테이블 — 상품×채널×일(KST) 요약.
 * 원본(price_logs)은 보존 기간 후 삭제되지만 이 요약은 무기한 보존 — 장기 차트·export의 원천.
 * min_*: 그날 정상 로그의 최저가(+판매처 페어링), 정상 로그가 없으면 null.
 * latest_*: 그날 최신 로그 (정상 우선) — 대시보드 "현재가" 의미.
 */
export interface PriceDaily {
  product_id: string;
  channel: Channel;
  /** 'YYYY-MM-DD' (KST) */
  date: string;
  min_price: number | null;
  min_store_name: string | null;
  latest_price: number;
  latest_store_name: string | null;
  latest_is_suspicious: boolean;
  sample_count: number;
  updated_at: string;
}

/**
 * GET /api/prices 응답 행 — PriceLog superset.
 * 원본 보존 기간(6개월) 이전 구간은 price_daily에서 합성된 행(source='daily')로 채워진다:
 * 하루 1행(그날 정상 최저가), id는 'daily-' 접두사의 합성 키.
 */
export type PricePoint = PriceLog & { source?: 'raw' | 'daily' };

/** 채널별 가격 정보 (메인 페이지 표시용) */
export interface ChannelPrice {
  channel: Channel;
  price: number;
  store_name: string | null;
  change: number | null;
  /** 가격 이상치로 마킹된 로그를 사용한 경우. UI에서 시각적으로 구분. */
  is_suspicious?: boolean;
  /**
   * 오늘/어제 값이 없을 때(price=0)만 채워지는 마지막 수집값. 집계·필터·최저가 판정에는
   * 쓰지 않고 표시 전용이다 — price를 덮어쓰면 오래된 값이 "현재 최저가"로 둔갑한다.
   */
  last_known?: LastKnownPrice;
}

/** 표시 전용 과거 가격 — price_daily의 그날 latest_* */
export interface LastKnownPrice {
  price: number;
  store_name: string | null;
  /** KST 'YYYY-MM-DD' */
  date: string;
}

/** 채널별 URL 맵 */
export interface ProductUrls {
  coupang: string | null;
  naver: string | null;
  danawa: string | null;
}

/** 메인 페이지 표시용 — 상품별 채널 가격 + 전일 대비 변동 */
export interface PriceWithChange {
  product_id: string;
  product_name: string;
  sabangnet_code: string | null;
  brand_id: string | null;
  brand_name: string | null;
  urls: ProductUrls;
  prices: ChannelPrice[];
  warnings?: FailureWarning[];
}

/** 상품 상태 필터 */
export type ProductStatusFilter = 'all' | 'active' | 'inactive';
/** 운영 프리셋 필터 — 정리 작업이 필요한 상품 찾기 */
export type ProductOpsFilter =
  | 'none'
  | 'noUrl'
  | 'partialUrl'
  | 'noBrand'
  /** 특정 채널 URL만 비어 있는 상품 — "일부 누락" 중 어느 채널을 채울지 고를 수 있게 */
  | 'missingCoupang'
  | 'missingNaver'
  | 'missingDanawa';

export const PRODUCT_OPS_FILTERS: ProductOpsFilter[] = [
  'none',
  'noUrl',
  'partialUrl',
  'noBrand',
  'missingCoupang',
  'missingNaver',
  'missingDanawa',
];

/** ProductFacets.ops에 없는 채널별 누락 카운트 — products_facets RPC 밖에서 별도 집계 */
export interface ProductMissingByChannel {
  coupang: number;
  naver: number;
  danawa: number;
}
export type ProductSortKey = 'created' | 'name' | 'status';
export type SortDirection = 'asc' | 'desc';

/** products_facets() RPC 결과 — 관리 화면의 절대값 카운트 (필터와 무관한 전체 기준) */
export interface ProductFacets {
  status: { all: number; active: number; inactive: number };
  ops: { noUrl: number; partialUrl: number; noBrand: number };
  /** brand_id → 상품 수 */
  brands: Record<string, number>;
  uncategorized: number;
}

/** GET /api/products 응답 (서버 페이지네이션) */
export interface ProductListResponse {
  items: Product[];
  total: number;
  page: number;
  page_size: number;
  /** include_facets=true 요청 시에만 동봉 */
  facets?: ProductFacets;
  /** include_facets=true 요청 시에만 동봉 */
  missing_by_channel?: ProductMissingByChannel;
}

/** GET /api/products/ids 응답 — 필터 결과 전체 선택용 (row 없이 id만) */
export interface ProductIdsResponse {
  ids: string[];
  total: number;
}

/** 상품 등록 입력 — brand_name 우선(없으면 brand_id 그대로). 신규 브랜드는 서버에서 upsert */
export interface CreateProductInput {
  name: string;
  sabangnet_code?: string | null;
  brand_name?: string | null;
  brand_id?: string | null;
  coupang_url?: string | null;
  naver_url?: string | null;
  danawa_url?: string | null;
}

/** 상품 수정 입력 */
export interface UpdateProductInput {
  name?: string;
  sabangnet_code?: string | null;
  brand_name?: string | null;
  brand_id?: string | null;
  coupang_url?: string | null;
  naver_url?: string | null;
  danawa_url?: string | null;
  is_active?: boolean;
}

/** 단일 채널 수집 결과 */
export interface CollectResult {
  product_id: string;
  channel: Channel;
  success: boolean;
  price?: number;
  store_name?: string | null;
  error?: string;
}

/** scrape_errors 테이블 — 수집 실패 로그 */
export interface ScrapeError {
  id: string;
  product_id: string;
  channel: Channel;
  error_message: string;
  created_at: string;
}

/** 연속 실패 경고 정보 */
export interface FailureWarning {
  product_id: string;
  channel: Channel;
  consecutive_failures: number;
  /** 가장 최근 실패 사유 (scrape_errors.error_message). 없으면 빈 문자열 */
  last_failure_message: string;
  /** 가장 최근 실패 시각 (ISO). 없으면 빈 문자열 */
  last_failure_at: string;
}

/** 전체 KPI 집계 (대시보드 SummaryCards) */
export interface SummaryStats {
  totalProducts: number;
  changedProducts: number;
  averageChangePct: number | null;
  failedChannels: number;
}

/** 메인 목록 변동 필터 */
export type ChangeFilterKey =
  | 'all'
  | 'changed'
  | 'bigDrop'
  | 'failed'
  | 'drops'
  | 'rises'
  | 'missing';

/**
 * 메인 목록 정렬 — 서버가 필터 결과 "전체"를 정렬한 뒤 페이지를 자른다.
 * (클라이언트 정렬은 50개 페이지 안에서만 섞여 "가장 많이 떨어진 상품"을 놓친다)
 * default: 등록 최신순 / drop: 하락률 큰 순 / rise: 상승률 큰 순
 */
export type DashboardSortKey = 'default' | 'drop' | 'rise' | 'price_asc' | 'price_desc' | 'name';

export interface PanelEntry {
  item: PriceWithChange;
  pct: number;
}

/** ActionPanels 4-패널 서버 집계 — Top N + 전체 카운트 */
export interface PanelGroups {
  drops: PanelEntry[];
  rises: PanelEntry[];
  failed: PriceWithChange[];
  missing: PriceWithChange[];
  counts: {
    drops: number;
    rises: number;
    failed: number;
    missing: number;
    /** missing 중 URL이 하나도 없는 상품 — 할 일: URL 등록 */
    missing_no_url: number;
    /** missing 중 URL은 있는데 현재가가 없는 상품 — 할 일: 수집 확인 */
    missing_not_collected: number;
  };
}

/**
 * GET /api/dashboard 응답 (v2 — 서버 필터/페이지네이션).
 * items는 요청한 페이지 슬라이스, 나머지 집계(summary/filter_counts/panel/brand_counts)는
 * 검색·브랜드 필터가 적용된 "전체" 기준. sparklines는 페이지 내 상품만.
 */
export interface DashboardResponse {
  items: PriceWithChange[];
  sparklines: Record<string, number[]>;
  total: number;
  page: number;
  page_size: number;
  summary: SummaryStats;
  filter_counts: { all: number; changed: number; bigDrop: number; failed: number };
  panel: PanelGroups;
  brand_counts: { byId: Record<string, number>; uncategorized: number };
  lastCollectedAt: string | null;
}

/** 수집 상태 등급 — ok: 정상 / delayed: 지연 / stopped: 중단 / unknown: 수집 이력 없음 */
export type CollectionHealthStatus = 'ok' | 'delayed' | 'stopped' | 'unknown';

/** 수집이 멈춘 것으로 의심되는 원인 1건 */
export interface CollectionHealthCause {
  code:
    | 'workflow_disabled'
    | 'last_request_failed'
    | 'brightdata_invalid_token'
    | 'brightdata_no_balance'
    | 'brightdata_unreachable';
  message: string;
  /** 사용자가 원인을 확인·조치할 수 있는 위치 (내부 경로 또는 외부 URL) */
  href?: string;
}

/** GET /api/collect/health 응답 */
export interface CollectionHealth {
  status: CollectionHealthStatus;
  /** price_logs 최신 collected_at */
  last_collected_at: string | null;
  /** 성공·실패를 합친 마지막 수집 시도 (price_logs·scrape_errors 중 최신) */
  last_attempt_at: string | null;
  /** last_collected_at 기준 경과 시간(시간 단위, 소수 버림). 이력 없으면 null */
  hours_since_collected: number | null;
  causes: CollectionHealthCause[];
  checked_at: string;
}

/** POST /api/export 요청 body — 대량 product_ids도 URL 한도 없이 전달 */
export interface ExportRequest {
  start_date: string;
  end_date: string;
  product_ids?: string[];
  brand_ids?: string[];
  /** raw: price_logs 원본 (보존 기간 내만) / daily: price_daily 요약 (기간 무제한) */
  mode: 'raw' | 'daily';
  include_suspicious?: boolean;
  count_only?: boolean;
}

/** Export 응답 1행 (xlsx 시트 행) */
export interface ExportRow {
  date: string;
  productName: string;
  sabangnetCode: string | null;
  brandName: string | null;
  channel: string;
  price: number;
  storeName: string | null;
}
