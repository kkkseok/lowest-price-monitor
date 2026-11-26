"""일반 HTTP vs Scrapling Fetcher(curl_cffi TLS 위장) 직접 호출 비교 — Bright Data 미경유.

저장소가 공개라 Actions 로그도 공개된다. 그래서 URL·가격은 출력하지 않고
상태코드·바이트·소요시간·판정만 남긴다.

usage: python -I scrapling_probe.py <urls.json> <channel...>
  channel: coupang | naver | danawa
종료코드: 0 항상 (판정은 로그의 SUMMARY 라인으로 한다)
"""
import json
import re
import sys
import time
import urllib.error
import urllib.request

from scrapling.fetchers import Fetcher

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
HEADERS = {"User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9",
           "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"}
MIN_BYTES = 5_000


def coupang_ok(html):
    for m in re.finditer(r'<script[^>]*type="application/ld\+json"[^>]*>([\s\S]*?)</script>', html):
        try:
            d = json.loads(m.group(1))
        except ValueError:
            continue
        if isinstance(d, dict) and d.get("@type") == "Product" and (d.get("offers") or {}).get("price"):
            return "ok"
    return "parse_fail"


def naver_ok(html):
    # 요약 블록 최저가와 판매처 리스트 최저가 행이 같은지까지 본다 (가격·스토어 페어링 점검)
    i = html.find('id="catalog_summary_info"')
    summary = None
    if i >= 0:
        m = re.search(r'class="catalogLowestPrice_num__[^"]*"[^>]*>([\d,]+)<', html[i:i + 20000])
        summary = m.group(1) if m else None
    j = html.find("product_is_lowest_price__")
    row = None
    if j >= 0:
        m = re.search(r'class="product_num__[^"]*"[^>]*>([^<]+)<', html[j:j + 3000])
        row = re.sub(r"\D", "", m.group(1)) if m else None
    if not summary and not row:
        return "parse_fail"
    if summary and row:
        return "ok" if summary.replace(",", "") == row else "ok_mismatch"
    return "ok_partial"


def danawa_ok(html):
    for row in html.split('<li class="list-item"')[1:]:
        if ("box__logo" in row and "text__num" in row
                and re.search(r"class=[\"']box__price lowest", row)
                and re.search(r"class=[\"']text__num[\"'][^>]*>[\d,]+<", row)
                and re.search(r"class=[\"']image[\"'][^>]*alt=[\"'][^\"']+[\"']", row)):
            return "ok"
    return "parse_fail"


CHANNELS = {
    "coupang": ("coupang_url", coupang_ok, ["차단된 접근", "Access Denied"]),
    "naver": ("naver_url", naver_ok, ["접속이 일시적으로 제한"]),
    "danawa": ("danawa_url", danawa_ok, []),
}


def fetch_plain(url):
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode("utf-8", "replace"), r.geturl()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace"), url


def fetch_scrapling(url):
    r = Fetcher.get(url, impersonate="chrome", stealthy_headers=True, timeout=30,
                    headers={"Accept-Language": "ko-KR,ko;q=0.9"})
    return r.status, r.html_content or "", r.url


def classify(channel, status, html, final_url):
    _, parser, block_markers = CHANNELS[channel]
    if channel == "danawa" and ("construction.danawa.com" in final_url or
                                (len(html) < MIN_BYTES and "점검" in html)):
        return "maintenance"
    if any(m in html for m in block_markers) or status in (403, 418, 429):
        return "blocked"
    if status == 404:
        return "not_found"
    if status != 200:
        return f"http_{status}"
    if len(html.encode()) < MIN_BYTES:
        return "small_body"
    return parser(html)


def main():
    urls = json.load(open(sys.argv[1], encoding="utf-8"))
    for channel in sys.argv[2:]:
        col = CHANNELS[channel][0]
        for mode, fn in (("plain", fetch_plain), ("scrapling", fetch_scrapling)):
            tally = {}
            for idx, url in enumerate(urls.get(col, [])):
                t0 = time.time()
                try:
                    status, html, final = fn(url)
                    outcome = classify(channel, status, html, final)
                    nbytes = len(html.encode())
                except Exception as e:  # 네트워크 예외도 판정 대상이라 집계에 남긴다
                    status, nbytes, outcome = 0, 0, f"exc_{type(e).__name__}"
                ms = int((time.time() - t0) * 1000)
                tally[outcome] = tally.get(outcome, 0) + 1
                print(f"{channel:7} {mode:9} #{idx:<2} status={status:<3} bytes={nbytes:<7} {ms:>6}ms {outcome}",
                      flush=True)
                time.sleep(2)
            ok = sum(v for k, v in tally.items() if k.startswith("ok"))
            total = sum(tally.values())
            print(f"SUMMARY {channel} {mode}: ok={ok}/{total} {json.dumps(tally)}", flush=True)


if __name__ == "__main__":
    main()
