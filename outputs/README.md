# Qiita / Zenn 記事差分ツール

Qiita と Zenn の公開記事を取得し、タイトルが同じ記事を突き合わせて Markdown レポートを作ります。差分一覧は公開日の新しい順です。

Node.js 25 以降では、依存パッケージなしで実行できます。

```powershell
node .\qiita-zenn-diff.ts
```

実行すると、現在のフォルダーに `qiita-zenn-diff.md` を出力します。ユーザー名・出力先は変更できます。

```powershell
node .\qiita-zenn-diff.ts --qiita-user tonbi_attack --zenn-user tonbi_attack --same-titles .\article-pairs.json --out .\report.md
```

## 類似タイトルの確認候補

差分のうち、表記が近い Qiita/Zenn 記事をレポートの「類似タイトルの確認候補」に表示します。候補は自動で同一記事にせず、内容を確認したうえで `pairs` に登録してください。

既定では類似度60%以上、Qiita の差分記事1件につき最大3件です。調整する場合は次のように指定します。

```powershell
node .\qiita-zenn-diff.ts --same-titles .\article-pairs.json --candidate-threshold 0.75 --candidate-limit 5
```

## 同一記事・除外記事を指定するコマンド

リポジトリ直下で、設定の雛形をコピーします。

```powershell
Copy-Item .\article-pairs.example.json .\article-pairs.json
```

`article-pairs.json` を編集し、`--same-titles` で渡します。

```powershell
node .\outputs\qiita-zenn-diff.ts --qiita-user tonbi_attack --zenn-user tonbi_attack --same-titles .\article-pairs.json --out .\qiita-zenn-diff.md
```

## 判定ルール

「両方」はタイトルの完全一致です。ただし Unicode 正規化、英字の大文字・小文字、連続空白は無視します。異なるタイトルでも同一記事であれば、次の JSON ファイルを作成して `--same-titles` に渡してください。

```json
{
  "pairs": [
    { "qiita": "Qiita 側の記事タイトル", "zenn": "Zenn 側の記事タイトル" }
  ],
  "ignore": { "qiita": [], "zenn": ["差分から除外する Zenn 記事タイトル"] }
}
```

`pairs` には Qiita と Zenn でタイトルが異なる同一記事を1組ずつ記載します。組み合わせは「両方にある記事」に表示され、差分から外れます。

`ignore.qiita` と `ignore.zenn` には、片側にだけある重複転載など、差分表示そのものから外す記事タイトルを記載します。指定したタイトルが取得結果にない場合はエラーになるため、設定の打ち間違いを検出できます。雛形はリポジトリ直下の `article-pairs.example.json` です。

### 実例

```json
{
  "pairs": [
    {
      "qiita": "Cookie肥大化で400 Bad Request「Size of a request header field exceeds server limit」が発生したときの原因と対処",
      "zenn": "Cookie肥大化で400 Bad Request"
    }
  ],
  "ignore": {
    "qiita": [],
    "zenn": [
      "VueのテンプレートとReactのJSXは何が違うのかVue.jsReact"
    ]
  }
}
```

取得に失敗したときは空の結果を出さず、HTTP エラーとして終了します。Qiita は公式 API、Zenn は公開サイトが利用している記事一覧 API を利用しています。後者は将来レスポンス形式が変わる可能性があります。
