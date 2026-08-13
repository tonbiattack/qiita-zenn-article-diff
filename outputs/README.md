# Qiita / Zenn 記事差分ツール

Qiita と Zenn の公開記事を取得し、タイトルが同じ記事を突き合わせて Markdown レポートを作ります。差分一覧は公開日の新しい順です。

Node.js 25 以降では、依存パッケージなしで実行できます。

```powershell
node .\qiita-zenn-diff.ts
```

実行すると、現在のフォルダーに `qiita-zenn-diff.md` を出力します。ユーザー名・出力先は変更できます。

```powershell
node .\qiita-zenn-diff.ts --qiita-user tonbi_attack --zenn-user tonbi_attack --out .\report.md
```

## 判定ルール

「両方」はタイトルの完全一致です。ただし Unicode 正規化、英字の大文字・小文字、連続空白は無視します。誤判定を避けるため、意味が似ているだけの記事を自動で同一記事にはしません。

取得に失敗したときは空の結果を出さず、HTTP エラーとして終了します。Qiita は公式 API、Zenn は公開サイトが利用している記事一覧 API を利用しています。後者は将来レスポンス形式が変わる可能性があります。
