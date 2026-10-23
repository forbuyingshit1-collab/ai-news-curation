import "server-only";

import type { ApiProvider, NormalizedSourceItem, Source, SourceStatus } from "@/lib/types";

const DEFAULT_QUERY = 'AI OR "artificial intelligence" OR automation OR agent';
const DEFAULT_LIMIT = 10;
const REQUEST_TIMEOUT_MS = 12_000;

type ApiSourceDefinition = Source & {
  requiredEnv?: string;
};

export const API_SOURCE_DEFINITIONS: ApiSourceDefinition[] = [
  {
    id: "src_api_hacker_news",
    type: "api",
    provider: "hacker_news",
    name: "Hacker News API",
    trustLevel: "medium",
    enabled: true,
    status: "ready"
  },
  {
    id: "src_api_dev_to",
    type: "api",
    provider: "dev_to",
    name: "DEV Community API",
    trustLevel: "medium",
    enabled: true,
    status: "ready"
  },
  {
    id: "src_api_newsdata",
    type: "api",
    provider: "newsdata",
    name: "NewsData.io",
    trustLevel: "medium",
    enabled: true,
    status: "needs_key",
    requiredEnv: "NEWSDATA_API_KEY"
  },
  {
    id: "src_api_the_news_api",
    type: "api",
    provider: "the_news_api",
    name: "The News API",
    trustLevel: "medium",
    enabled: true,
    status: "needs_key",
    requiredEnv: "THE_NEWS_API_TOKEN"
  },
  {
    id: "src_api_gdelt",
    type: "api",
    provider: "gdelt",
    name: "GDELT API",
    trustLevel: "medium",
    enabled: true,
    status: "ready"
  },
  {
    id: "src_api_newsapi",
    type: "api",
    provider: "newsapi",
    name: "NewsAPI.org",
    trustLevel: "medium",
    enabled: true,
    status: "needs_key",
    requiredEnv: "NEWSAPI_API_KEY"
  },
  {
    id: "src_api_gnews",
    type: "api",
    provider: "gnews",
    name: "GNews API",
    trustLevel: "medium",
    enabled: true,
    status: "needs_key",
    requiredEnv: "GNEWS_API_KEY"
  },
  {
    id: "src_api_mediastack",
    type: "api",
    provider: "mediastack",
    name: "Mediastack API",
    trustLevel: "medium",
    enabled: true,
    status: "needs_key",
    requiredEnv: "MEDIASTACK_ACCESS_KEY"
  }
];

type ApiResponse = Record<string, unknown>;

function asRecord(value: unknown): ApiResponse {
  return value && typeof value === "object" ? (value as ApiResponse) : {};
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function clip(value: string, max = 500) {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function url(value: unknown) {
  const candidate = asString(value);
  try {
    return new URL(candidate).toString();
  } catch {
    return "";
  }
}

function date(value: unknown) {
  const candidate = asString(value);
  return candidate && !Number.isNaN(Date.parse(candidate)) ? new Date(candidate).toISOString() : undefined;
}

function cleanItem(provider: ApiProvider, item: Omit<NormalizedSourceItem, "provider">): NormalizedSourceItem | null {
  const sourceUrl = url(item.sourceUrl);
  const title = clip(item.title, 300);
  if (!sourceUrl || !title) return null;

  return {
    provider,
    sourceUrl,
    title,
    publisher: clip(item.publisher || provider, 120),
    author: item.author ? clip(item.author, 120) : undefined,
    publishedAt: item.publishedAt,
    shortExcerpt: clip(item.shortExcerpt || title),
    language: item.language || "en"
  };
}

async function getJson(endpoint: string, headers?: HeadersInit) {
  const response = await fetch(endpoint, {
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`provider returned ${response.status}`);
  }

  return (await response.json()) as unknown;
}

function keyFor(provider: ApiProvider) {
  const keyNames: Record<ApiProvider, string | undefined> = {
    hacker_news: undefined,
    dev_to: undefined,
    newsdata: process.env.NEWSDATA_API_KEY,
    the_news_api: process.env.THE_NEWS_API_TOKEN,
    gdelt: undefined,
    newsapi: process.env.NEWSAPI_API_KEY,
    gnews: process.env.GNEWS_API_KEY,
    mediastack: process.env.MEDIASTACK_ACCESS_KEY
  };
  return keyNames[provider];
}

function queryValue(query: string) {
  return query.trim() || process.env.NEWS_QUERY?.trim() || DEFAULT_QUERY;
}

async function fetchHackerNews(limit: number, query: string) {
  const ids = asArray(await getJson("https://hacker-news.firebaseio.com/v0/topstories.json")).slice(0, limit * 4);
  const items = await Promise.all(
    ids.map(async (id) => {
      if (typeof id !== "number") return null;
      const story = asRecord(await getJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`));
      const title = asString(story.title);
      const text = asString(story.text).replace(/<[^>]+>/g, " ");

      return cleanItem("hacker_news", {
        sourceUrl: url(story.url) || `https://news.ycombinator.com/item?id=${id}`,
        title,
        publisher: "Hacker News",
        author: asString(story.by),
        publishedAt: date(typeof story.time === "number" ? story.time * 1000 : undefined),
        shortExcerpt: text || `${asString(story.score)} points on Hacker News`,
        language: "en"
      });
    })
  );
  return items.filter((item): item is NormalizedSourceItem => Boolean(item)).slice(0, limit);
}

async function fetchDevTo(limit: number) {
  const tags = ["ai", "automation", "productivity"];
  const responses = await Promise.all(
    tags.map((tag) => getJson(`https://dev.to/api/articles?tag=${tag}&top=7&per_page=${Math.max(3, Math.ceil(limit / tags.length))}`))
  );
  const seen = new Set<string>();
  return responses
    .flatMap((response) => asArray(response))
    .map((value) => {
      const article = asRecord(value);
      return cleanItem("dev_to", {
        sourceUrl: asString(article.url),
        title: asString(article.title),
        publisher: "DEV Community",
        author: asString(asRecord(article.user).name),
        publishedAt: date(article.published_at || article.created_at),
        shortExcerpt: asString(article.description),
        language: asString(article.language, "en")
      });
    })
    .filter((item): item is NormalizedSourceItem => {
      if (!item || seen.has(item.sourceUrl)) return false;
      seen.add(item.sourceUrl);
      return true;
    })
    .slice(0, limit);
}

async function fetchNewsData(limit: number, query: string) {
  const params = new URLSearchParams({
    apikey: keyFor("newsdata") || "",
    q: query,
    language: "en",
    size: String(Math.min(limit, 10)),
    removeduplicate: "1"
  });
  const data = asRecord(await getJson(`https://newsdata.io/api/1/latest?${params}`));
  return asArray(data.results).map((value) => {
    const article = asRecord(value);
    return cleanItem("newsdata", {
      sourceUrl: asString(article.link),
      title: asString(article.title),
      publisher: asString(asRecord(article.source).name || article.source_id, "NewsData.io"),
      publishedAt: date(article.pubDate),
      shortExcerpt: asString(article.description || article.content),
      language: asString(article.language, "en")
    });
  }).filter((item): item is NormalizedSourceItem => Boolean(item)).slice(0, limit);
}

async function fetchTheNewsApi(limit: number, query: string) {
  const params = new URLSearchParams({
    api_token: keyFor("the_news_api") || "",
    search: query,
    language: "en",
    limit: String(limit),
    sort: "published_at"
  });
  const data = asRecord(await getJson(`https://api.thenewsapi.com/v1/news/all?${params}`));
  return asArray(data.data).map((value) => {
    const article = asRecord(value);
    return cleanItem("the_news_api", {
      sourceUrl: asString(article.url),
      title: asString(article.title),
      publisher: asString(article.source, "The News API"),
      author: asString(article.author),
      publishedAt: date(article.published_at),
      shortExcerpt: asString(article.description),
      language: asString(article.language, "en")
    });
  }).filter((item): item is NormalizedSourceItem => Boolean(item)).slice(0, limit);
}

async function fetchGdelt(limit: number, query: string) {
  const params = new URLSearchParams({
    query,
    mode: "artlist",
    format: "json",
    maxrecords: String(limit),
    sort: "HybridRel"
  });
  const data = asRecord(await getJson(`https://api.gdeltproject.org/api/v2/doc/doc?${params}`));
  return asArray(data.articles).map((value) => {
    const article = asRecord(value);
    return cleanItem("gdelt", {
      sourceUrl: asString(article.url),
      title: asString(article.title),
      publisher: asString(article.domain, "GDELT"),
      publishedAt: date(article.seendate),
      shortExcerpt: asString(article.socialimage || article.title),
      language: asString(article.language, "en")
    });
  }).filter((item): item is NormalizedSourceItem => Boolean(item)).slice(0, limit);
}

async function fetchNewsApi(limit: number, query: string) {
  const params = new URLSearchParams({
    apiKey: keyFor("newsapi") || "",
    q: query,
    language: "en",
    pageSize: String(Math.min(limit, 100)),
    sortBy: "publishedAt"
  });
  const data = asRecord(await getJson(`https://newsapi.org/v2/everything?${params}`));
  return asArray(data.articles).map((value) => {
    const article = asRecord(value);
    return cleanItem("newsapi", {
      sourceUrl: asString(article.url),
      title: asString(article.title),
      publisher: asString(asRecord(article.source).name, "NewsAPI.org"),
      author: asString(article.author),
      publishedAt: date(article.publishedAt),
      shortExcerpt: asString(article.description || article.content),
      language: "en"
    });
  }).filter((item): item is NormalizedSourceItem => Boolean(item)).slice(0, limit);
}

async function fetchGNews(limit: number, query: string) {
  const params = new URLSearchParams({
    q: query,
    lang: "en",
    max: String(Math.min(limit, 10)),
    sortby: "publishedAt",
    apikey: keyFor("gnews") || ""
  });
  const data = asRecord(await getJson(`https://gnews.io/api/v4/search?${params}`));
  return asArray(data.articles).map((value) => {
    const article = asRecord(value);
    return cleanItem("gnews", {
      sourceUrl: asString(article.url),
      title: asString(article.title),
      publisher: asString(asRecord(article.source).name, "GNews"),
      publishedAt: date(article.publishedAt),
      shortExcerpt: asString(article.description || article.content),
      language: "en"
    });
  }).filter((item): item is NormalizedSourceItem => Boolean(item)).slice(0, limit);
}

async function fetchMediastack(limit: number, query: string) {
  const params = new URLSearchParams({
    access_key: keyFor("mediastack") || "",
    keywords: query,
    languages: "en",
    limit: String(Math.min(limit, 100)),
    sort: "published_desc"
  });
  const data = asRecord(await getJson(`https://api.mediastack.com/v1/news?${params}`));
  return asArray(data.data).map((value) => {
    const article = asRecord(value);
    return cleanItem("mediastack", {
      sourceUrl: asString(article.url),
      title: asString(article.title),
      publisher: asString(article.source, "Mediastack"),
      author: asString(article.author),
      publishedAt: date(article.published_at),
      shortExcerpt: asString(article.description),
      language: asString(article.language, "en")
    });
  }).filter((item): item is NormalizedSourceItem => Boolean(item)).slice(0, limit);
}

export type ApiFetchResult = {
  provider: ApiProvider;
  status: "fetched" | "skipped" | "failed";
  items: NormalizedSourceItem[];
  error?: string;
};

export async function fetchApiSource(provider: ApiProvider, options?: { query?: string; limit?: number }): Promise<ApiFetchResult> {
  const query = queryValue(options?.query || "");
  const limit = Math.min(Math.max(options?.limit || DEFAULT_LIMIT, 1), 25);
  const definition = API_SOURCE_DEFINITIONS.find((source) => source.provider === provider);

  if (definition?.requiredEnv && !keyFor(provider)) {
    return {
      provider,
      status: "skipped",
      items: [],
      error: `${definition?.requiredEnv || "API key"} is not configured`
    };
  }

  try {
    const items = await (provider === "hacker_news"
      ? fetchHackerNews(limit, query)
      : provider === "dev_to"
        ? fetchDevTo(limit)
        : provider === "newsdata"
          ? fetchNewsData(limit, query)
          : provider === "the_news_api"
            ? fetchTheNewsApi(limit, query)
            : provider === "gdelt"
              ? fetchGdelt(limit, query)
              : provider === "newsapi"
                ? fetchNewsApi(limit, query)
                : provider === "gnews"
                  ? fetchGNews(limit, query)
                  : fetchMediastack(limit, query));

    return { provider, status: "fetched", items };
  } catch (error) {
    return {
      provider,
      status: "failed",
      items: [],
      error: error instanceof Error ? error.message : "unknown provider error"
    };
  }
}

export function getApiSourceStatus() {
  return API_SOURCE_DEFINITIONS.map((source) => ({
    ...source,
    status: (source.requiredEnv && !process.env[source.requiredEnv] ? "needs_key" : "ready") as SourceStatus
  }));
}
