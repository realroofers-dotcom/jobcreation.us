// functions/api/feed.js  — JobCreation.us
//
// Aggregates outside news on the two things the Foundation exists for:
// homelessness, and where the jobs are being created.
//
// Each category lists several feeds in order. The first that returns headlines
// wins; if one is blocked or empty, the next is tried — so no single provider
// can empty the page.
//
// Headlines and links only — never article text. Everything links out to the publisher.
//
// Diagnostics:  /api/feed?debug=1   shows what each feed returned.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const PER_CATEGORY = 4;
const GN = "hl=en-US&gl=US&ceid=US:en";

function gnSearch(q) {
  return "https://news.google.com/rss/search?q=" + encodeURIComponent(q) + "&" + GN;
}
function gnTopic(t) {
  return "https://news.google.com/rss/headlines/section/topic/" + t + "?" + GN;
}

// Edit these search terms to change what the feed covers.
const SOURCES = [
  {
    category: "homelessness", categoryLabel: "Homelessness", limit: 6,
    feeds: [
      gnSearch("homelessness shelter housing crisis"),
      gnSearch("homeless services funding cities"),
      "https://feeds.npr.org/1001/rss.xml"
    ]
  },
  {
    category: "jobs", categoryLabel: "Jobs", limit: 6,
    feeds: [
      gnSearch("hiring jobs report employment"),
      gnTopic("BUSINESS"),
      "https://feeds.npr.org/1006/rss.xml"
    ]
  },
  {
    category: "trades", categoryLabel: "Trades", limit: 5,
    feeds: [
      gnSearch("skilled trades apprenticeship workforce training"),
      gnSearch("construction hiring labor shortage")
    ]
  },
  {
    category: "manufacturing", categoryLabel: "Manufacturing",
    feeds: [
      gnSearch("factory plant opening jobs manufacturing"),
      gnSearch("reshoring American manufacturing jobs")
    ]
  },
  {
    category: "energy", categoryLabel: "Energy",
    feeds: [
      gnSearch("clean energy jobs solar wind construction"),
      gnSearch("energy project hiring workers")
    ]
  },
  {
    category: "tech", categoryLabel: "Tech & AI",
    feeds: [
      gnSearch("AI data center construction jobs hiring"),
      gnSearch("semiconductor plant jobs")
    ]
  },
  {
    category: "smallbiz", categoryLabel: "Small Business",
    feeds: [
      gnSearch("small business startup owners hiring"),
      gnSearch("entrepreneur starting a business")
    ]
  }
];

// These lead every round — the Foundation's two core subjects.
const LEAD = ["homelessness", "jobs"];

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const debug = url.searchParams.has("debug");
  const only = url.searchParams.get("category"); // optional filter

  const wire = await fetchAll(debug);
  const items = only && only !== "all"
    ? wire.items.filter(i => i.category === only)
    : wire.items;

  const payload = { items, count: items.length };
  if (debug) payload.debug = wire.log;

  return new Response(JSON.stringify(payload), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": debug ? "no-store" : "public, max-age=1800" // 30 min at the edge
    }
  });
}

async function fetchAll(debug) {
  const results = await Promise.allSettled(SOURCES.map(s => fetchCategory(s)));
  const merged = [];
  const log = {};

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const name = SOURCES[i].category;
    if (r.status === "fulfilled") {
      merged.push(...r.value.items);
      if (debug) log[name] = r.value.log;
    } else if (debug) {
      log[name] = "failed: " + String(r.reason);
    }
  }

  // Drop duplicates — the same story surfaces under several searches
  const seen = new Set();
  const unique = merged.filter(item => {
    const fp = item.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 50);
    if (!fp || seen.has(fp)) return false;
    seen.add(fp);
    return true;
  });

  // Interleave by category so one busy subject can't crowd out the rest.
  // Homelessness and jobs go first in every round.
  const byCategory = {};
  for (const item of unique) {
    (byCategory[item.category] = byCategory[item.category] || []).push(item);
  }
  for (const cat in byCategory) {
    byCategory[cat].sort((a, b) => Date.parse(b.pubDate || 0) - Date.parse(a.pubDate || 0));
  }

  const order = SOURCES.map(s => s.category)
    .sort((a, b) => (LEAD.indexOf(b) - LEAD.indexOf(a)));

  const ordered = [];
  let round = 0;
  let added = true;
  while (added) {
    added = false;
    for (const cat of order) {
      const list = byCategory[cat];
      if (list && list[round]) { ordered.push(list[round]); added = true; }
    }
    round++;
    if (round > 20) break;
  }

  return { items: ordered, log };
}

async function fetchCategory(source) {
  const log = [];
  for (const feedUrl of source.feeds) {
    try {
      const res = await fetch(feedUrl, {
        headers: {
          "User-Agent": UA,
          "Accept": "application/rss+xml, application/xml, text/xml, */*"
        }
      });
      if (!res.ok) { log.push(shortUrl(feedUrl) + " HTTP " + res.status); continue; }
      const xml = await res.text();
      const items = parseFeed(xml, source).slice(0, source.limit || PER_CATEGORY);
      log.push(shortUrl(feedUrl) + " -> " + items.length);
      if (items.length) return { items, log };
    } catch (err) {
      log.push(shortUrl(feedUrl) + " error");
    }
  }
  return { items: [], log };
}

function shortUrl(u) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return String(u).slice(0, 30); }
}

// Handles both RSS (<item>) and Atom (<entry>). Workers have no DOM parser.
function parseFeed(xml, source) {
  const isAtom = xml.indexOf("<entry") > -1 && xml.indexOf("<item") === -1;
  const openTag = isAtom ? "<entry" : "<item";
  const closeTag = isAtom ? "</entry>" : "</item>";

  const items = [];
  const parts = String(xml).split(openTag).slice(1);

  for (const part of parts) {
    const chunk = part.split(closeTag)[0];
    const rawTitle = tag(chunk, "title");
    let link = tag(chunk, "link");
    if (!link) {
      const href = chunk.match(/<link[^>]*href=["']([^"']+)["']/);
      if (href) link = href[1];
    }
    if (!rawTitle || !link) continue;

    // Google News formats titles as "Headline - Publisher"
    let title = rawTitle;
    let publisher = tag(chunk, "source");
    const dashAt = title.lastIndexOf(" - ");
    if (!publisher && dashAt > 10) {
      publisher = title.slice(dashAt + 3).trim();
      title = title.slice(0, dashAt).trim();
    } else if (publisher && title.endsWith(" - " + publisher)) {
      title = title.slice(0, title.length - publisher.length - 3).trim();
    }
    if (!publisher) publisher = shortUrl(link);

    items.push({
      category: source.category,
      categoryLabel: source.categoryLabel,
      title: truncate(title, 130),
      link,
      pubDate: toIso(tag(chunk, "pubDate") || tag(chunk, "published") || tag(chunk, "updated")),
      source: publisher
    });
  }
  return items;
}

function tag(chunk, name) {
  const m = chunk.match(new RegExp("<" + name + "[^>]*>([\\s\\S]*?)</" + name + ">"));
  if (!m) return "";
  return decode(stripCdata(m[1])).trim();
}

function stripCdata(s) {
  return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function decode(s) {
  let out = String(s).replace(/<[^>]+>/g, "");
  for (let i = 0; i < 2; i++) {
    out = out
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(parseInt(d, 10)))
      .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&amp;/g, "&");
  }
  return out.replace(/\s+/g, " ");
}

function toIso(dateStr) {
  if (!dateStr) return new Date().toISOString();
  const d = new Date(dateStr);
  return isNaN(d) ? new Date().toISOString() : d.toISOString();
}

function truncate(str, maxLen) {
  str = String(str);
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen).trim() + "…";
}
