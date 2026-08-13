import assert from "node:assert/strict";
import test from "node:test";
import { compare, normalizeTitle, type Article } from "../outputs/qiita-zenn-diff.ts";

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

test("差分は新しい公開日順に並ぶ", () => {
  const result = compare(
    [article("Qiita", "古い記事", "2026-01-01T00:00:00+09:00"), article("Qiita", "新しい記事", "2026-02-01T00:00:00+09:00")],
    [],
  );
  assert.deepEqual(result.qiitaOnly.map((item) => item.title), ["新しい記事", "古い記事"]);
});
