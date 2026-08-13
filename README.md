# Qiita / Zenn Article Diff

Qiita と Zenn の公開記事を比較し、プラットフォームごとの差分を公開日の新しい順で Markdown に出力する TypeScript CLI です。

```powershell
node .\outputs\qiita-zenn-diff.ts --qiita-user tonbi_attack --zenn-user tonbi_attack --out .\qiita-zenn-diff.md
```

詳細な使い方と記事判定のルールは [outputs/README.md](outputs/README.md) を参照してください。

## 出力内容

- Qiita のみにある記事
- Zenn のみにある記事
- 両方にある記事

タイトルの完全一致を基本に、Unicode 正規化・英字の大小文字・連続空白の違いだけを吸収して照合します。

## 動作環境

Node.js 25 以降（追加パッケージ不要）

## ライセンス

MIT
