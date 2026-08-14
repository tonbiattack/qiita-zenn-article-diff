import assert from "node:assert/strict";
import test from "node:test";
import { compare, findSimilarityCandidates, normalizeTitle, titleSimilarity, type Article } from "../outputs/qiita-zenn-diff.ts";

function article(site: "Qiita" | "Zenn", title: string, publishedAt = "2026-01-01T00:00:00+09:00"): Article {
  return { site, title, normalizedTitle: normalizeTitle(title), publishedAt, url: `https://example.test/${site}/${title}` };
}

test("表記ゆれだけのタイトルは同一記事として扱う", () => {
  const result = compare([article("Qiita", "TypeScript  入門")], [article("Zenn", "typescript 入門")]);
  assert.equal(result.both.length, 1);
  assert.equal(result.both[0].matchedBy, "title");
  assert.equal(result.qiitaOnly.length, 0);
  assert.equal(result.zennOnly.length, 0);
});

test("指定した異なるタイトルの組み合わせを差分から除外する", () => {
  const result = compare(
    [article("Qiita", "Qiita版のタイトル")],
    [article("Zenn", "Zenn版では異なるタイトル")],
    [{ qiita: "Qiita版のタイトル", zenn: "Zenn版では異なるタイトル" }],
  );
  assert.equal(result.both.length, 1);
  assert.equal(result.both[0].matchedBy, "specified");
  assert.equal(result.qiitaOnly.length, 0);
  assert.equal(result.zennOnly.length, 0);
});

test("指定したタイトルが取得結果にない場合はエラーにする", () => {
  assert.throws(
    () => compare([article("Qiita", "存在する記事")], [], [{ qiita: "存在しない記事", zenn: "Zenn記事" }]),
    /取得結果にありません/,
  );
});

test("片側だけの重複転載を差分から除外しても、同名記事の照合を維持する", () => {
  const result = compare(
    [article("Qiita", "VueのテンプレートとReactのJSXは何が違うのか")],
    [article("Zenn", "VueのテンプレートとReactのJSXは何が違うのか"), article("Zenn", "VueのテンプレートとReactのJSXは何が違うのかVue.jsReact")],
    [],
    { zenn: ["VueのテンプレートとReactのJSXは何が違うのかVue.jsReact"] },
  );
  assert.equal(result.both.length, 1);
  assert.equal(result.zennOnly.length, 0);
});

test("差分は新しい公開日順に並ぶ", () => {
  const result = compare(
    [article("Qiita", "古い記事", "2026-01-01T00:00:00+09:00"), article("Qiita", "新しい記事", "2026-02-01T00:00:00+09:00")],
    [],
  );
  assert.deepEqual(result.qiitaOnly.map((item) => item.title), ["新しい記事", "古い記事"]);
});

test("短い転載タイトルと長いタイトルを類似候補として提案する", () => {
  const result = compare(
    [article("Qiita", "Cookie肥大化で400 Bad Request「Size of a request header field exceeds server limit」が発生したときの原因と対処")],
    [article("Zenn", "Cookie肥大化で400 Bad Request")],
  );
  const candidates = findSimilarityCandidates(result);
  assert.equal(candidates.length, 1);
  assert.ok(candidates[0].score >= 0.6);
  assert.ok(titleSimilarity("Cookie肥大化で400 Bad Request", "まったく別の記事") < 0.6);
});

test("類似候補はQiita記事ごとに指定した上位件数へ制限する", () => {
  const result = compare(
    [article("Qiita", "TypeScript 型システム入門")],
    [article("Zenn", "TypeScript 型入門"), article("Zenn", "TypeScript 型システム")],
  );
  assert.equal(findSimilarityCandidates(result, 0.6, 1).length, 1);
});
