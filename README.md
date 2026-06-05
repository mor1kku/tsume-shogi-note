# 詰将棋ノート 🎴

詰将棋の **入力・データベース・閲覧・脳内将棋トレーニング** ができる PWA（インストール可能なWebアプリ）です。iPhone / Android のホーム画面に追加してアプリのように使えます。データは端末内に保存され、問題は画像・文字・データ（JSON）で LINE・メール・AirDrop などに共有できます。

## ✨ 機能

- **入力**
  - 盤に駒を並べる入力（攻め方/受け方、成駒、攻め方の持ち駒をタップで増減）
  - 文字入力（攻め方・受け方・持ち駒の3欄に「5一玉」などを入力）
  - 盤上で解答を再生しながら記録（▲△・成・打・同を自動で棋譜化）
- **データベース**：題名・手数・作成日・概要・解答を保存／編集／削除、バックアップ書き出し・読み込み（追加取り込み）
- **解く**：最初は答えを隠し、「答えを見る」で一手ずつ再生（盤面 / 脳内盤）
- **見る**：解答を見ながら一手進む・戻す・自動再生（秒/分指定）
- **問題モード**：手数・問題数・表示・送り間隔（秒/分）を設定してスライドショー
- **共有**：盤面画像(PNG) / 文字 / 問題データ(JSON) を共有シートで送信
- **オフライン対応**：一度開けば電波がなくても動作（Service Worker）

## 🚀 公開手順（GitHub Pages）

1. このリポジトリを GitHub に作成して push（`main` ブランチ）。
2. リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に設定。
3. push すると `.github/workflows/deploy.yml` が走り、自動で公開されます。
   - 公開URL：`https://<ユーザー名>.github.io/<リポジトリ名>/`
   - base path はリポジトリ名から自動設定されるので、リポジトリ名は自由でOK。

> ユーザーサイト（`<ユーザー名>.github.io` という名前のリポジトリ）に置く場合は、
> `vite.config.js` の `const base = ...` を `"/"` に変更してください。

## 📱 スマホへの追加（ホーム画面に追加）

- **iPhone (Safari)**：共有ボタン → 「ホーム画面に追加」
- **Android (Chrome)**：メニュー → 「アプリをインストール」/「ホーム画面に追加」

インストール後は共有メニュー（LINE・メール・AirDrop 等）や画像保存が本番動作します。

## 🛠 ローカル開発

```bash
npm install
npm run dev      # 開発サーバ
npm run build    # 本番ビルド（dist/）
npm run preview  # ビルド結果を確認
```

> 初回 `npm install` 後にできる **`package-lock.json` を必ずコミット**してください。
> CI が `npm ci` で再現性のある（＝依存改ざんに強い）ビルドを行えるようになります。

> 公開リポジトリに **自分の問題バックアップ（`tsume-backup-*.json`）をコミットしない**でください
> （その問題が全世界に公開されます）。`.gitignore` で除外済みです。

ローカルでは `vite.config.js` の base が `/tsume-shogi-note/` を指すため、
`npm run dev` のときは `http://localhost:5173/tsume-shogi-note/` を開いてください
（`base` を一時的に `"/"` にしてもOK）。

## 🗂 データ仕様（共有JSON）

1問は次の形です。配列にして共有・取り込みします。

```json
{
  "id": "p-...",
  "title": "頭金（一手詰）",
  "moves": 1,
  "summary": "...",
  "createdAt": "2026-06-03",
  "board": { "5-1": { "type": "玉", "side": "defender", "promoted": false } },
  "hands": { "attacker": { "金": 1 }, "defender": {} },
  "answerMoves": [{ "side": "attacker", "drop": true, "to": "5-2", "type": "金", "text": "▲5二金" }]
}
```

- マス目キーは `"筋-段"`（例 `5-1` は 5一）。`side` は `attacker`(攻め方) / `defender`(受け方)。

## 📍 ロードマップ

- KIF / SFEN 形式の取り込み・書き出し
- 画像・PDF からの自動読み取り（OCR）
- スワイプ（scroll-snap）での問題送り
- 共有リンク（URLに局面を埋め込み、タップで取り込み）

## 📝 ライセンス

MIT
