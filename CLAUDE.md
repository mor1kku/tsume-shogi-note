# CLAUDE.md — 詰将棋ノート

詰将棋の入力・データベース・閲覧・出題・解答ができる PWA。作者個人＋友人向け。
アプリストア配信はせず GitHub Pages で公開。**やりとり・コメントは日本語**で。

## 技術構成
- Vite + React（**インラインstyle**、Tailwind不使用）
- 状態は useState、永続化は **localStorage**（キー: `tsume:problems`）
- PWA: vite-plugin-pwa（オフライン対応・ホーム画面追加可）
- 公開: GitHub Actions → GitHub Pages。base path はリポジトリ名から自動設定（`vite.config.js`）
- 実装の中心は **`src/App.jsx`（単一ファイル）**、KIF変換は **`src/kif.js`**

## デザイン
- 和モダン（和紙 `#f3ecdd` / 墨 `#2a2622` / 朱 `#b1442f`）、明朝体
- 受け方の駒は 180度回転で表示

## データモデル（最重要・崩さないこと）
```
problem = {
  id, title, moves(手数), summary, createdAt,
  board: { "筋-段": { type, side, promoted } },   // 例 "5-1" = 5一。筋は右が1、段は上が1
  hands: { attacker: {飛,角,金,銀,桂,香,歩}, defender: {...} },
  answerMoves: [ { side, drop, from, to, type, promote, promotedBefore, text } ]
}
```
- `side`: `"attacker"`(先手/攻め方) | `"defender"`(後手/受け方)
- `type` は基本駒の漢字（玉王飛角金銀桂香歩）。成りは `promoted:true`（表示は 龍馬全圭杏と）
- マスのキーは常に `"筋-段"`（どちらも 1〜9）
- **取り込み時は必ず `sanitizeProblem` で検証**（壊れたJSON/KIFでクラッシュさせない）。全体は `ErrorBoundary` で保護済み。

## 実装済み機能
- 一覧/DB：書き出し（端末保存）、読み込み（JSON/KIF自動判別で**追加**取り込み、重複ID除外）、答え手順は折りたたみ
- 作成/編集：盤入力（成トグル・攻め方持駒タップ増減）／文字入力（配置リスト or KIF 切替）／解答記録（盤で指すと自動で棋譜化）
- 解く（最初は答え非表示→「答えを見る」）／見る（手順表示・自動再生は秒/分指定）
- 問題モード：**スライドショー** ／ **盤面で解く**（なぞり式＝登録手順と一致で進む）
- 共有：画像PNG / 文字 / データJSON / KIF（`navigator.share`）

## 方針・制約
- 「盤面で解く」は **A案（なぞり式）**。受け方の変化・余詰は未対応。将来 **tsshogi** で B案（合法手生成＋最善応手＋余詰検出）へ拡張予定。
- KIF は柿木仕様準拠。実データの表記ゆれが出たら要調整。
- **将棋ルールの正確性に敏感**。サンプルや判定の正しさを最優先で確認すること。
- 検証・エラー処理は必須（過去に不正JSONでクラッシュ実績あり）。

## 開発・公開
```
npm install            # package-lock.json はコミットする
npm run dev -- --host  # 同一Wi-Fiのスマホから Network URL で確認
npm run build
# main に push → GitHub Actions が自動デプロイ
```

## 関連成果物（別の場所に置く）
- `ocr-proxy/` … VPS(Docker+Caddy)に置く Gemini 中継。**ブラウザ直叩きはCORSで不可**なため必須。エンドポイント `/gemini/<model>`。
- `ocr-test/` … 画像/PDF→局面JSON のテストページ（プロキシURL対応）。
- 詳しい現状と次の手は `HANDOFF.md` を参照。
