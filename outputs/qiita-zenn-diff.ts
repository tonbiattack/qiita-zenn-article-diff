#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

type Site = "Qiita" | "Zenn";

export type Article = {
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

const QIITA_PER_PAGE = 100;
const ZENN_PER_PAGE = 50;
const DEFAULT_USER = "tonbi_attack";

export function normalizeTitle(title: string): string {
  // 表記ゆれの吸収は最小限に留め、別記事を誤って「両方」と判定しない。
  return title.normalize("NFKC").toLocaleLowerCase("ja-JP").replace(/\s+/g, " ").trim();
}

async function fetchJson(url: string): Promise<unknown> {
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
  return articles.splice(index, 1)[0];
}

export function compare(qiita: Article[], zenn: Article[], specifiedPairs: SameArticlePair[] = []): Comparison {
  const remainingQiita = [...qiita];
  const remainingZenn = [...zenn];
  const both: ArticlePair[] = specifiedPairs.map((pair) => ({
    qiita: takeArticle(remainingQiita, pair.qiita, "Qiita"),
    zenn: takeArticle(remainingZenn, pair.zenn, "Zenn"),
    matchedBy: "specified",
  }));
  const zennByTitle = new Map<string, Article[]>();
  for (const article of remainingZenn) {
    const articles = zennByTitle.get(article.normalizedTitle) ?? [];
    articles.push(article);
    zennByTitle.set(article.normalizedTitle, articles);
  }

  const qiitaOnly: Article[] = [];
  for (const qiitaArticle of remainingQiita) {
    const candidates = zennByTitle.get(qiitaArticle.normalizedTitle);
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

async function readSpecifiedPairs(path: string | undefined): Promise<SameArticlePair[]> {
  if (!path) return [];
  let data: unknown;
  try {
    data = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`同一記事の指定ファイルを読めません: ${path} (${error instanceof Error ? error.message : error})`);
  }
  if (!Array.isArray(data) || data.some((item) => !item || typeof item !== "object" || typeof item.qiita !== "string" || typeof item.zenn !== "string")) {
    throw new Error("同一記事の指定ファイルは { qiita, zenn } の配列である必要があります。");
  }
  return data as SameArticlePair[];
}

async function main(): Promise<void> {
  const { qiitaUser, zennUser, out, sameTitles } = parseArgs();
  console.log("Qiita / Zenn の記事一覧を取得しています...");
  const [qiita, zenn] = await Promise.all([fetchQiita(qiitaUser), fetchZenn(zennUser)]);
  const comparison = compare(qiita, zenn, await readSpecifiedPairs(sameTitles));
  const markdown = makeMarkdown(`${qiitaUser} / ${zennUser}`, qiita, zenn, comparison);
  const output = resolve(out);
  await mkdir(resolve(output, ".."), { recursive: true });
  await writeFile(output, markdown, "utf8");
  console.log(`完了: Qiita ${qiita.length}件, Zenn ${zenn.length}件, Qiitaのみ ${comparison.qiitaOnly.length}件, Zennのみ ${comparison.zennOnly.length}件`);
  console.log(`レポート: ${output}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error("失敗しました:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
