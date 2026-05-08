import { NextResponse } from "next/server";

export const runtime = "nodejs";
// 1時間キャッシュ
export const revalidate = 3600;

type NewsItem = {
  title: string;
  link: string;
  pubDate: string;
  source: string;
};

/** 最小限のXML/RSSパーサ（依存パッケージ追加なし） */
function parseRss(xml: string, source: string, max = 15): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item[\s>][\s\S]*?<\/item>/g;
  const entryRegex = /<entry[\s>][\s\S]*?<\/entry>/g;
  const matches = xml.match(itemRegex) || xml.match(entryRegex) || [];
  for (const block of matches.slice(0, max)) {
    const title = stripCdata(extractTag(block, "title"));
    let link = stripCdata(extractTag(block, "link"));
    if (!link) {
      const hrefMatch = block.match(/<link[^>]*href=["']([^"']+)["']/);
      if (hrefMatch) link = hrefMatch[1];
    }
    const pubDate =
      stripCdata(extractTag(block, "pubDate")) ||
      stripCdata(extractTag(block, "dc:date")) ||
      stripCdata(extractTag(block, "updated")) ||
      stripCdata(extractTag(block, "published")) ||
      "";
    if (title && link) items.push({ title, link, pubDate, source });
  }
  return items;
}

function extractTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
  const m = block.match(re);
  return m ? m[1].trim() : "";
}

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

async function fetchFeed(url: string, source: string): Promise<NewsItem[]> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, {
      headers: { "User-Agent": "Sequlia-NewsAggregator/1.0" },
      signal: ctrl.signal,
      next: { revalidate: 3600 },
    });
    clearTimeout(t);
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRss(xml, source);
  } catch {
    return [];
  }
}

export async function GET() {
  // JVN(JPCERT)とJPCERT/CCを取得（日本のセキュリティ情報源）
  const [jvn, jpcert] = await Promise.all([
    fetchFeed(
      "https://jvndb.jvn.jp/myjvn?Method=getVulnOverviewList&Feed=hnd&MaxCountItem=20&LangType=ja",
      "JVN"
    ),
    fetchFeed("https://www.jpcert.or.jp/rss/jpcert.rdf", "JPCERT/CC"),
  ]);

  // 結合 → 新しい順にソート
  const all = [...jvn, ...jpcert]
    .filter((i) => i.title && i.link)
    .sort((a, b) => {
      const ta = new Date(a.pubDate).getTime() || 0;
      const tb = new Date(b.pubDate).getTime() || 0;
      return tb - ta;
    })
    .slice(0, 20);

  return NextResponse.json({ items: all }, {
    headers: {
      "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
