#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

type Site = "Qiita" | "Zenn";

export type Article = {
  // 取得元を残しておくと、レポート用の URL と見出しを同じ型で扱える。
  site: Site;
  title: string;
  normalizedTitle: string;
  publishedAt: string;
  url: string;
};

type ArticlePair = { qiita: Article; zenn: Article; matchedBy: "title" | "specified" };

export type Comparison = {
  qiitaOnly: Article[];
  zennOnly: Article[];
  both: ArticlePair[];
};

type SameArticlePair = { qiita: string; zenn: string };
type IgnoredTitles = { qiita?: string[]; zenn?: string[] };
type ComparisonOptions = { specifiedPairs: SameArticlePair[]; ignoredTitles: IgnoredTitles };

const QIITA_PER_PAGE = 100;
const ZENN_PER_PAGE = 50;
const DEFAULT_USER = "tonbi_attack";

export function normalizeTitle(title: string): string {
  // 表記ゆれの吸収は最小限に留め、別記事を誤って「両方」と判定しない。
  return title.normalize("NFKC").toLocaleLowerCase("ja-JP").replace(/\s+/g, " ").trim();
}

async function fetchJson(url: string): Promise<unknown> {
  // ネットワーク停止で CLI が無期限に待たないよう、各 API 呼び出しに上限を設ける。
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "qiita-zenn-diff/1.0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`);
  }
  return response.json();
}

async function fetchQiita(user: string): Promise<Article[]> {
  const result: Article[] = [];
  // Qiita API は 1 ページ最大 100 件。最終ページが短くなった時点で全件取得済みと判断する。
  for (let page = 1; ; page += 1) {
    const url = `https://qiita.com/api/v2/users/${encodeURIComponent(user)}/items?page=${page}&per_page=${QIITA_PER_PAGE}`;
    const data = await fetchJson(url);
    if (!Array.isArray(data)) throw new Error("Qiita API のレスポンス形式が想定と異なります。");
    result.push(...data.map((item: any) => ({
      site: "Qiita" as const,
      title: item.title,
      normalizedTitle: normalizeTitle(item.title),
      publishedAt: item.created_at,
      url: item.url,
    })));
    if (data.length < QIITA_PER_PAGE) return result;
  }
}

async function fetchZenn(user: string): Promise<Article[]> {
  const result: Article[] = [];
  // Zenn は next_page を返すため、件数ではなくその値をページング継続条件にする。
  for (let page = 1; ; page += 1) {
    const url = `https://zenn.dev/api/articles?username=${encodeURIComponent(user)}&order=latest&page=${page}`;
    const data = await fetchJson(url) as { articles?: any[]; next_page?: number | null };
    if (!Array.isArray(data.articles)) throw new Error("Zenn API のレスポンス形式が想定と異なります。");
    result.push(...data.articles.map((item) => ({
      site: "Zenn" as const,
      title: item.title,
      normalizedTitle: normalizeTitle(item.title),
      publishedAt: item.published_at,
      url: `https://zenn.dev${item.path}`,
    })));
    if (!data.next_page) return result;
  }
}

function takeArticle(articles: Article[], title: string, site: Site): Article {
  const index = articles.findIndex((article) => article.normalizedTitle === normalizeTitle(title));
  if (index < 0) {
    throw new Error(`指定された ${site} 記事が取得結果にありません: ${title}`);
  }
  // 取り出した記事を配列から除くことで、同じ記事を複数の指定ペアに使えなくする。
  return articles.splice(index, 1)[0];
}

function removeIgnoredArticles(articles: Article[], titles: string[] | undefined, site: Site): void {
  for (const title of titles ?? []) takeArticle(articles, title, site);
}

export function compare(
  qiita: Article[],
  zenn: Article[],
  specifiedPairs: SameArticlePair[] = [],
  ignoredTitles: IgnoredTitles = {},
): Comparison {
  // 呼び出し元の配列を変更しないため、照合対象だけをコピーして消費していく。
  const remainingQiita = [...qiita];
  const remainingZenn = [...zenn];
  // 片側にだけ重複転載がある場合は、明示的に差分から外せるようにする。
  removeIgnoredArticles(remainingQiita, ignoredTitles.qiita, "Qiita");
  removeIgnoredArticles(remainingZenn, ignoredTitles.zenn, "Zenn");
  // 明示指定を先に確定させる。これにより、指定した異なるタイトルが通常のタイトル一致に影響しない。
  const both: ArticlePair[] = specifiedPairs.map((pair) => ({
    qiita: takeArticle(remainingQiita, pair.qiita, "Qiita"),
    zenn: takeArticle(remainingZenn, pair.zenn, "Zenn"),
    matchedBy: "specified",
  }));
  const zennByTitle = new Map<string, Article[]>();
  for (const article of remainingZenn) {
    // 同名記事が複数ある場合も 1 対 1 で対応付けるため、値は配列にする。
    const articles = zennByTitle.get(article.normalizedTitle) ?? [];
    articles.push(article);
    zennByTitle.set(article.normalizedTitle, articles);
  }

  const qiitaOnly: Article[] = [];
  for (const qiitaArticle of remainingQiita) {
    const candidates = zennByTitle.get(qiitaArticle.normalizedTitle);
    // shift した Zenn 記事は二度目以降の照合から消える。
    const zennArticle = candidates?.shift();
    if (zennArticle) both.push({ qiita: qiitaArticle, zenn: zennArticle, matchedBy: "title" });
    else qiitaOnly.push(qiitaArticle);
  }
  const zennOnly = [...zennByTitle.values()].flat();
  const byNewest = (a: Article, b: Article) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
  return { qiitaOnly: qiitaOnly.sort(byNewest), zennOnly: zennOnly.sort(byNewest), both: both.sort((a, b) => byNewest(a.qiita, b.qiita)) };
}

function date(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "medium" }).format(new Date(value));
}

function articleRow(article: Article): string {
  return `| ${date(article.publishedAt)} | [${article.title}](${article.url}) |`;
}

function makeMarkdown(user: string, qiita: Article[], zenn: Article[], comparison: Comparison): string {
  const section = (title: string, articles: Article[]) => [
    `## ${title} (${articles.length}件)`,
    "",
    "| 公開日 | 記事 |",
    "| --- | --- |",
    ...articles.map(articleRow),
    "",
  ].join("\n");
  const pairedRows = comparison.both.map(({ qiita: q, zenn: z, matchedBy }) =>
    `| ${date(q.publishedAt)} / ${date(z.publishedAt)} | [Qiita](${q.url}) | [Zenn](${z.url}) | ${matchedBy === "specified" ? "指定" : "タイトル一致"} |`);
  return [
    `# Qiita / Zenn 記事差分: ${user}`,
    "",
    `取得日時: ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}（JST）`,
    "",
    `- Qiita: ${qiita.length}件`,
    `- Zenn: ${zenn.length}件`,
    `- Qiita のみ: ${comparison.qiitaOnly.length}件`,
    `- Zenn のみ: ${comparison.zennOnly.length}件`,
    `- 両方: ${comparison.both.length}件`,
    "",
    "同一記事は、タイトル一致または指定ファイルに登録した組み合わせです。各一覧は公開日の新しい順です。",
    "",
    section("Qiita のみ", comparison.qiitaOnly),
    section("Zenn のみ", comparison.zennOnly),
    "## 両方にある記事 (最新順)",
    "",
    "| Qiita / Zenn 公開日 | Qiita | Zenn | 判定 |",
    "| --- | --- | --- | --- |",
    ...pairedRows,
    "",
  ].join("\n");
}

function parseArgs(): { qiitaUser: string; zennUser: string; out: string; sameTitles: string | undefined } {
  const args = process.argv.slice(2);
  const valueOf = (flag: string, fallback: string) => {
    const index = args.indexOf(flag);
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
  };
  return {
    qiitaUser: valueOf("--qiita-user", DEFAULT_USER),
    zennUser: valueOf("--zenn-user", DEFAULT_USER),
    out: valueOf("--out", "qiita-zenn-diff.md"),
    sameTitles: args.includes("--same-titles") ? valueOf("--same-titles", "") : undefined,
  };
}

function isSameArticlePair(value: unknown): value is SameArticlePair {
  return !!value && typeof value === "object" && typeof (value as SameArticlePair).qiita === "string" && typeof (value as SameArticlePair).zenn === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

async function readComparisonOptions(path: string | undefined): Promise<ComparisonOptions> {
  if (!path) return { specifiedPairs: [], ignoredTitles: {} };
  let data: unknown;
  try {
    data = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`同一記事の指定ファイルを読めません: ${path} (${error instanceof Error ? error.message : error})`);
  }
  // 既存の配列形式も受け付け、設定追加後も以前のファイルをそのまま利用できるようにする。
  if (Array.isArray(data)) {
    if (data.some((item) => !isSameArticlePair(item))) throw new Error("同一記事の指定ファイルは { qiita, zenn } の配列である必要があります。");
    return { specifiedPairs: data, ignoredTitles: {} };
  }
  if (!data || typeof data !== "object") throw new Error("同一記事の指定ファイルは配列または設定オブジェクトである必要があります。");
  const config = data as { pairs?: unknown; ignore?: unknown };
  if (config.pairs !== undefined && (!Array.isArray(config.pairs) || config.pairs.some((item) => !isSameArticlePair(item)))) {
    throw new Error("pairs は { qiita, zenn } の配列である必要があります。");
  }
  const ignoredTitles = config.ignore as IgnoredTitles | undefined;
  if (config.ignore !== undefined && (
    !config.ignore || typeof config.ignore !== "object"
    || (ignoredTitles.qiita !== undefined && !isStringArray(ignoredTitles.qiita))
    || (ignoredTitles.zenn !== undefined && !isStringArray(ignoredTitles.zenn))
  )) {
    throw new Error("ignore は qiita と zenn の文字列配列を持つ必要があります。");
  }
  return { specifiedPairs: (config.pairs ?? []) as SameArticlePair[], ignoredTitles: (config.ignore ?? {}) as IgnoredTitles };
}

async function main(): Promise<void> {
  const { qiitaUser, zennUser, out, sameTitles } = parseArgs();
  console.log("Qiita / Zenn の記事一覧を取得しています...");
  // 取得元は独立しているため並列取得し、待ち時間を短くする。
  const [qiita, zenn] = await Promise.all([fetchQiita(qiitaUser), fetchZenn(zennUser)]);
  const { specifiedPairs, ignoredTitles } = await readComparisonOptions(sameTitles);
  const comparison = compare(qiita, zenn, specifiedPairs, ignoredTitles);
  const markdown = makeMarkdown(`${qiitaUser} / ${zennUser}`, qiita, zenn, comparison);
  const output = resolve(out);
  await mkdir(resolve(output, ".."), { recursive: true });
  await writeFile(output, markdown, "utf8");
  console.log(`完了: Qiita ${qiita.length}件, Zenn ${zenn.length}件, Qiitaのみ ${comparison.qiitaOnly.length}件, Zennのみ ${comparison.zennOnly.length}件`);
  console.log(`レポート: ${output}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // テストから import したときに CLI 本体が実行されないようにする。
  main().catch((error: unknown) => {
    console.error("失敗しました:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
