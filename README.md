# Qiita / Zenn Article Diff

Qiita と Zenn の公開記事を比較し、プラットフォームごとの差分を公開日の新しい順で Markdown に出力する TypeScript CLI です。

```powershell
node .\outputs\qiita-zenn-diff.ts --qiita-user tonbi_attack --zenn-user tonbi_attack --same-titles .\article-pairs.json --out .\qiita-zenn-diff.md
```

詳細な使い方と記事判定のルールは [outputs/README.md](outputs/README.md) を参照してください。

## 出力内容

- Qiita のみにある記事
- Zenn のみにある記事
- 両方にある記事

タイトルの完全一致を基本に、Unicode 正規化・英字の大小文字・連続空白の違いだけを吸収して照合します。

完全一致しなかった記事については、レポートの「類似タイトルの確認候補」に候補を表示します。候補は自動で同一記事にせず、内容を確認してから `pairs` に登録してください。既定では類似度60%以上を表示し、Qiita の差分記事1件につき最大3件です。

```powershell
# 類似度を75%以上、Qiita記事ごとに最大5件へ変更する
node .\outputs\qiita-zenn-diff.ts --same-titles .\article-pairs.json --candidate-threshold 0.75 --candidate-limit 5
```

## 異なるタイトルの同一記事・除外記事を指定する

設定ファイルは `--same-titles` オプションで渡します。まず雛形をコピーします。

```powershell
Copy-Item .\article-pairs.example.json .\article-pairs.json
```

`article-pairs.json` を編集した後、次のコマンドで比較します。

```powershell
node .\outputs\qiita-zenn-diff.ts --qiita-user tonbi_attack --zenn-user tonbi_attack --same-titles .\article-pairs.json --out .\qiita-zenn-diff.md
```

```json
{
  "pairs": [
    { "qiita": "Qiita 側の記事タイトル", "zenn": "Zenn 側の記事タイトル" }
  ],
  "ignore": { "qiita": [], "zenn": ["差分から除外する Zenn 記事タイトル"] }
}
```

`pairs` には Qiita と Zenn でタイトルが異なる同一記事を1組ずつ記載します。組み合わせは「両方にある記事」に入り、差分から除外されます。

`ignore.qiita` と `ignore.zenn` には、片側にだけある重複転載など、差分表示そのものから外す記事タイトルを記載します。指定したタイトルが取得結果にない場合はエラーにするため、タイトルの打ち間違いを検出できます。

### 実例

タイトルが異なる Cookie 記事を同一記事として扱い、すでに同名記事がある Vue の重複転載を Zenn 側だけ除外する例です。

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

## 動作環境

Node.js 25 以降（追加パッケージ不要）

## テスト

```powershell
npm test
```

## ライセンス

MIT
