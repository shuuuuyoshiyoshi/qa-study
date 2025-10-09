# 一問一答 学習アプリ（GitHub Pages）
CSV（用語,説明[,タグ]）からカードを生成し、SM-2で復習します。

- 配置: `docs/data/勉強用.csv`（UTF-8推奨）
- 進捗保存: ブラウザの localStorage（端末ごと）
- 公開: GitHub Pages（main / docs）

## 開発メモ
ローカル直開きだと `fetch` がブロックされます。VS Codeの「Live Server」などで `docs/` をルートにすると楽です。a