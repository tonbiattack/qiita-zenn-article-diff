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

タイトルの完全一致を基本に、Unicode 正規化・英字の大小文字・連続空白の違いだけを吸収して照合します。異なるタイトルでも同一記事なら、`article-pairs.example.json` をコピーして `article-pairs.json` を作り、`--same-titles` で渡してください。

```json
[
  { "qiita": "Qiita 側の記事タイトル", "zenn": "Zenn 側の記事タイトル" }
]
```

指定した組み合わせは「両方にある記事」に入り、差分から除外されます。指定したタイトルが取得結果にない場合はエラーにするため、タイトルの打ち間違いを検出できます。

## 動作環境

Node.js 25 以降（追加パッケージ不要）

## テスト

```powershell
npm test
```

## ライセンス

MIT
