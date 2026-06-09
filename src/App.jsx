import React, { useState, useEffect, useMemo, useRef } from "react";
import { toKIF, parseKIF, looksLikeKIF } from "./kif.js";

// 端末ローカル保存（localStorage）。将来 IndexedDB に差し替え可。
const store = {
  get: async (k) => { try { const v = localStorage.getItem(k); return v == null ? null : { value: v }; } catch { return null; } },
  set: async (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

/* =========================================================
   詰将棋 入力・データベース・閲覧アプリ (Phase 1.1)
   ========================================================= */

const KAN = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const PROMO = { 飛: "龍", 角: "馬", 銀: "全", 桂: "圭", 香: "杏", 歩: "と" };
const PROMOTABLE = ["飛", "角", "銀", "桂", "香", "歩"];
const HAND_ORDER = ["飛", "角", "金", "銀", "桂", "香", "歩"];
const PALETTE = ["玉", "王", "飛", "角", "金", "銀", "桂", "香", "歩"];

const C = {
  washi: "#f3ecdd", paper: "#faf6ec", ink: "#2a2622", inkSoft: "#6b6358",
  board: "#e7c98a", boardLine: "#9b7b46", vermilion: "#b1442f", line: "#d8cdb4",
};
const FONT = '"Hiragino Mincho ProN","Yu Mincho",YuMincho,"Noto Serif JP",serif';

const emptyHands = () => ({
  attacker: { 飛: 0, 角: 0, 金: 0, 銀: 0, 桂: 0, 香: 0, 歩: 0 },
  defender: { 飛: 0, 角: 0, 金: 0, 銀: 0, 桂: 0, 香: 0, 歩: 0 },
});
const cloneHands = (h) => ({ attacker: { ...h.attacker }, defender: { ...h.defender } });
const sq = (c, r) => `${c}-${r}`;
const pieceDisp = (p) => (p.promoted && PROMO[p.type] ? PROMO[p.type] : p.type);

function applyMove(boardIn, handsIn, m) {
  const board = { ...boardIn };
  const hands = cloneHands(handsIn);
  if (m.drop) {
    board[m.to] = { type: m.type, side: m.side, promoted: false };
    hands[m.side][m.type] = Math.max(0, (hands[m.side][m.type] || 0) - 1);
  } else {
    const p = board[m.from];
    if (!p) return { board, hands };
    delete board[m.from];
    const cap = board[m.to];
    if (cap) hands[m.side][cap.type] = (hands[m.side][cap.type] || 0) + 1;
    board[m.to] = { type: p.type, side: m.side, promoted: p.promoted || m.promote };
  }
  return { board, hands };
}
function buildStates(initBoard, initHands, moves) {
  const states = [{ board: { ...initBoard }, hands: cloneHands(initHands), text: "開始局面" }];
  let b = { ...initBoard }, h = cloneHands(initHands);
  (moves || []).forEach((m) => { const r = applyMove(b, h, m); b = r.board; h = r.hands; states.push({ board: b, hands: h, text: m.text }); });
  return states;
}
const inPromoZone = (side, row) => (side === "attacker" ? row <= 3 : row >= 7);

function moveNotation(m, prevTo) {
  const mark = m.side === "attacker" ? "▲" : "△";
  let s;
  if (prevTo && m.to === prevTo) s = "同";
  else { const [c, r] = m.to.split("-").map(Number); s = `${c}${KAN[r]}`; }
  const ch = m.promotedBefore ? PROMO[m.type] || m.type : m.type;
  const suf = m.drop ? "打" : m.promote ? "成" : "";
  return `${mark}${s}${ch}${suf}`;
}
function positionToText(board, hands) {
  const att = [], def = [];
  Object.entries(board).forEach(([k, p]) => {
    const [c, r] = k.split("-").map(Number);
    const item = { c, r, s: `${c}${KAN[r]}${pieceDisp(p)}` };
    (p.side === "attacker" ? att : def).push(item);
  });
  const sorter = (a, b) => a.r - b.r || b.c - a.c; att.sort(sorter); def.sort(sorter);
  const handStr = (h) => { const parts = HAND_ORDER.filter((k) => h[k] > 0).map((k) => (h[k] > 1 ? k + KAN[h[k]] : k)); return parts.length ? parts.join("　") : "なし"; };
  return {
    attacker: att.map((x) => x.s).join("　") || "なし",
    defender: def.map((x) => x.s).join("　") || "なし",
    attHand: handStr(hands.attacker), defHand: handStr(hands.defender),
  };
}
function decodePiece(s) {
  if (s.startsWith("成")) return { type: s[1], promoted: true };
  const map = { 龍: "飛", 竜: "飛", 馬: "角", 全: "銀", 圭: "桂", 杏: "香", と: "歩" };
  if (map[s]) return { type: map[s], promoted: true };
  return { type: s, promoted: false };
}
function parsePlacements(str, side) {
  const out = {};
  const norm = (str || "").replace(/[０-９]/g, (d) => "" + "０１２３４５６７８９".indexOf(d));
  const re = /([1-9])([一二三四五六七八九])(成[銀桂香]|[龍竜馬全圭杏と]|[玉王飛角金銀桂香歩])/g;
  let m;
  while ((m = re.exec(norm)) !== null) {
    const col = Number(m[1]); const row = "一二三四五六七八九".indexOf(m[2]) + 1;
    const d = decodePiece(m[3]); out[sq(col, row)] = { type: d.type, side, promoted: d.promoted };
  }
  return out;
}
function parseHand(str) {
  const hand = { 飛: 0, 角: 0, 金: 0, 銀: 0, 桂: 0, 香: 0, 歩: 0 };
  const N = "一二三四五六七八九";
  const re = /([飛角金銀桂香歩])([一二三四五六七八九十]|[0-9０-９]+)?/g;
  let m;
  while ((m = re.exec(str || "")) !== null) {
    let cnt = 1;
    if (m[2]) {
      if (m[2] === "十") cnt = 10;
      else if (N.includes(m[2])) cnt = N.indexOf(m[2]) + 1;
      else cnt = Number(m[2].replace(/[０-９]/g, (d) => "" + "０１２３４５６７８９".indexOf(d)));
    }
    hand[m[1]] += cnt;
  }
  return hand;
}
const toMs = (val, unit) => Math.max(200, (Number(val) || 0) * (unit === "min" ? 60000 : 1000));

const SAMPLE = [{
  id: "sample-1", title: "頭金（一手詰）", moves: 1,
  summary: "初歩の一手詰",
  createdAt: "2026-06-03",
  board: {
    "5-1": { type: "玉", side: "defender", promoted: false },
    "2-2": { type: "飛", side: "attacker", promoted: false },
  },
  hands: { attacker: { 飛: 0, 角: 0, 金: 1, 銀: 0, 桂: 0, 香: 0, 歩: 0 }, defender: { 飛: 0, 角: 0, 金: 0, 銀: 0, 桂: 0, 香: 0, 歩: 0 } },
  answerMoves: [{ side: "attacker", drop: true, to: "5-2", type: "金", promote: false, promotedBefore: false, text: "▲5二金" }],
}];

// ---- style helpers ----
const btn = (primary) => ({ fontFamily: FONT, fontSize: 15, padding: "9px 16px", borderRadius: 8, cursor: "pointer", border: `1px solid ${primary ? C.vermilion : C.line}`, background: primary ? C.vermilion : C.paper, color: primary ? "#fff" : C.ink });
const ghost = { ...btn(false), background: "transparent" };
const lbl = { display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: C.inkSoft };
const inp = { fontFamily: FONT, fontSize: 15, padding: "8px 10px", border: `1px solid ${C.line}`, borderRadius: 6, background: "#fff", color: C.ink };
const ta = { width: "100%", height: 140, fontFamily: "monospace", fontSize: 12, border: `1px solid ${C.line}`, borderRadius: 6, padding: 8, boxSizing: "border-box", background: "#fff" };
const ioBox = { border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, background: C.paper, marginBottom: 10 };
const modalWrap = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 };
const modalCard = { background: C.paper, padding: 24, borderRadius: 12, textAlign: "center", fontFamily: FONT };
const card = { border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, background: C.paper };

// ---- 取り込みデータの検証（他人由来の壊れたJSONでクラッシュさせない） ----
function sanitizeProblem(p) {
  if (!p || typeof p !== "object") return null;
  const sqRe = /^[1-9]-[1-9]$/;
  const board = {};
  if (p.board && typeof p.board === "object") {
    for (const [k, v] of Object.entries(p.board)) {
      if (sqRe.test(k) && v && typeof v === "object" && typeof v.type === "string" && v.type) {
        board[k] = { type: v.type.slice(0, 2), side: v.side === "defender" ? "defender" : "attacker", promoted: !!v.promoted };
      }
    }
  }
  const hands = emptyHands();
  if (p.hands && typeof p.hands === "object") {
    ["attacker", "defender"].forEach((s) => {
      if (p.hands[s] && typeof p.hands[s] === "object") {
        HAND_ORDER.forEach((k) => { const n = Math.floor(Number(p.hands[s][k])); if (n > 0) hands[s][k] = Math.min(18, n); });
      }
    });
  }
  const answerMoves = Array.isArray(p.answerMoves)
    ? p.answerMoves.filter((m) => m && typeof m === "object" && sqRe.test(m.to || "") && typeof m.type === "string")
        .map((m) => ({
          side: m.side === "defender" ? "defender" : "attacker",
          drop: !!m.drop,
          from: typeof m.from === "string" && sqRe.test(m.from) ? m.from : null,
          to: m.to, type: m.type.slice(0, 2), promote: !!m.promote, promotedBefore: !!m.promotedBefore,
          text: typeof m.text === "string" ? m.text.slice(0, 24) : "",
        }))
    : [];
  return {
    id: typeof p.id === "string" && p.id.trim() ? p.id.trim() : `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: typeof p.title === "string" ? p.title.slice(0, 120) : "（無題）",
    moves: Number(p.moves) || answerMoves.length || 1,
    summary: typeof p.summary === "string" ? p.summary.slice(0, 500) : "",
    createdAt: typeof p.createdAt === "string" ? p.createdAt.slice(0, 20) : new Date().toISOString().slice(0, 10),
    board, hands, answerMoves,
  };
}

// ---- 画面サイズに追従する盤サイズ（小型端末で盤がはみ出さないように） ----
function useViewportWidth() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 375);
  useEffect(() => {
    const f = () => setW(window.innerWidth);
    window.addEventListener("resize", f);
    window.addEventListener("orientationchange", f);
    return () => { window.removeEventListener("resize", f); window.removeEventListener("orientationchange", f); };
  }, []);
  return w;
}
const boardSizeFor = (vw, max = 330) => Math.max(200, Math.min(max, vw - 72));

// ---- 想定外のエラーで画面全体が白くならないように ----
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error("App error:", err, info); }
  render() {
    if (this.state.err) {
      return (
        <div style={{ maxWidth: 520, margin: "40px auto", padding: 20, fontFamily: FONT, color: C.ink }}>
          <h2 style={{ fontSize: 18 }}>表示中に問題が発生しました</h2>
          <p style={{ fontSize: 14, color: C.inkSoft }}>保存データが壊れている可能性があります。まずバックアップを書き出してから、必要ならデータを初期化してください。</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <button style={btn(false)} onClick={() => { try { const raw = localStorage.getItem("tsume:problems") || "[]"; download(new Blob([raw], { type: "application/json" }), "tsume-rescue.json"); } catch (e) {} }}>バックアップを書き出す</button>
            <button style={btn(true)} onClick={() => window.location.reload()}>再読み込み</button>
            <button style={{ ...ghost, color: C.vermilion }} onClick={() => { if (confirm("保存データを消して初期化します。よろしいですか？")) { try { localStorage.removeItem("tsume:problems"); } catch (e) {} window.location.reload(); } }}>データを消して初期化</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---- share / image helpers ----
function makeBoardCanvas(board, hands, title) {
  const cell = 54, pad = 18, rlab = 22, colH = 24;
  const titleH = title ? 34 : 8;
  const boardPx = cell * 9, handH = 64;
  const W = pad + boardPx + rlab + pad;
  const H = pad + titleH + colH + boardPx + handH + pad;
  const cv = document.createElement("canvas");
  const sc = 2; cv.width = W * sc; cv.height = H * sc;
  const ctx = cv.getContext("2d"); ctx.scale(sc, sc);
  ctx.fillStyle = C.washi; ctx.fillRect(0, 0, W, H);
  const t = positionToText(board, hands);
  let y = pad;
  if (title) { ctx.fillStyle = C.ink; ctx.font = "bold 20px " + FONT; ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText(title, pad, y); y += titleH; }
  const bx = pad, by = y + colH;
  const cols = [9, 8, 7, 6, 5, 4, 3, 2, 1];
  ctx.fillStyle = C.inkSoft; ctx.font = "13px " + FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  cols.forEach((c, i) => ctx.fillText(c, bx + i * cell + cell / 2, y + colH / 2));
  ctx.fillStyle = C.board; ctx.fillRect(bx, by, boardPx, boardPx);
  ctx.strokeStyle = C.boardLine; ctx.lineWidth = 1;
  for (let i = 0; i <= 9; i++) { ctx.beginPath(); ctx.moveTo(bx + i * cell, by); ctx.lineTo(bx + i * cell, by + boardPx); ctx.stroke(); ctx.beginPath(); ctx.moveTo(bx, by + i * cell); ctx.lineTo(bx + boardPx, by + i * cell); ctx.stroke(); }
  ctx.lineWidth = 2; ctx.strokeRect(bx, by, boardPx, boardPx);
  ctx.fillStyle = C.inkSoft; ctx.font = "13px " + FONT;
  for (let r = 1; r <= 9; r++) ctx.fillText(KAN[r], bx + boardPx + rlab / 2, by + (r - 1) * cell + cell / 2);
  const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  rows.forEach((r) => cols.forEach((c, ci) => {
    const p = board[sq(c, r)]; if (!p) return;
    const cx = bx + ci * cell + cell / 2, cy = by + (r - 1) * cell + cell / 2;
    ctx.save(); ctx.translate(cx, cy); if (p.side === "defender") ctx.rotate(Math.PI);
    ctx.fillStyle = p.promoted ? C.vermilion : C.ink; ctx.font = "bold " + Math.round(cell * 0.62) + "px " + FONT; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(pieceDisp(p), 0, 1); ctx.restore();
  }));
  ctx.fillStyle = C.ink; ctx.font = "15px " + FONT; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  const hy = by + boardPx + 22;
  ctx.fillText("攻め方 持駒：" + t.attHand, pad, hy);
  ctx.fillText("受け方：" + t.defender, pad, hy + 26);
  return cv;
}
function download(blob, name) { try { const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 1500); } catch (e) {} }
function copyText(s) { try { navigator.clipboard && navigator.clipboard.writeText(s); } catch (e) {} }
async function tryShareFiles(files, text, title) { try { if (navigator.canShare && navigator.canShare({ files })) { await navigator.share({ files, text, title }); return true; } } catch (e) { if (e && e.name === "AbortError") return true; } try { if (navigator.share) { await navigator.share({ text, title }); return true; } } catch (e) {} return false; }
async function tryShareText(text, title) { try { if (navigator.share) { await navigator.share({ text, title }); return true; } } catch (e) { if (e && e.name === "AbortError") return true; } return false; }

function ShareSheet({ problem, board, hands, onClose }) {
  const [tab, setTab] = useState("image");
  const [imgUrl, setImgUrl] = useState(null);
  const cvRef = useRef(null);
  const title = problem ? `${problem.title}（${problem.moves}手詰）` : "詰将棋";
  const t = positionToText(board, hands);
  const textPayload = `${problem ? problem.title + "\n" : ""}攻め方：${t.attacker}${t.attHand !== "なし" ? "　持駒 " + t.attHand : ""}\n受け方：${t.defender}` + (problem?.answerMoves?.length ? "\n解答：" + problem.answerMoves.map((m, i) => `${i + 1}.${m.text}`).join(" ") : "");
  const dataPayload = problem ? JSON.stringify([problem], null, 2) : "";
  const kifPayload = problem ? toKIF(problem) : "";

  useEffect(() => { if (tab === "image") { const cv = makeBoardCanvas(board, hands, title); cvRef.current = cv; setImgUrl(cv.toDataURL("image/png")); } }, [tab]);

  const shareImage = () => { const cv = cvRef.current; if (!cv) return; cv.toBlob(async (blob) => { const f = new File([blob], "tsume.png", { type: "image/png" }); const ok = await tryShareFiles([f], title, title); if (!ok) download(blob, "tsume.png"); }, "image/png"); };
  const shareData = async () => { const blob = new Blob([dataPayload], { type: "application/json" }); const f = new File([blob], "tsume-data.json", { type: "application/json" }); const ok = await tryShareFiles([f], title, title); if (!ok) download(blob, "tsume-data.json"); };
  const shareKif = async () => { const blob = new Blob([kifPayload], { type: "text/plain" }); const f = new File([blob], "tsume.kif", { type: "text/plain" }); const ok = await tryShareFiles([f], title, title); if (!ok) download(blob, "tsume.kif"); };

  return (
    <div style={modalWrap} onClick={onClose}>
      <div style={{ ...modalCard, textAlign: "left", width: "min(92vw, 460px)", maxHeight: "86vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <button style={tab === "image" ? btn(true) : ghost} onClick={() => setTab("image")}>画像</button>
          <button style={tab === "text" ? btn(true) : ghost} onClick={() => setTab("text")}>文字</button>
          {problem && <button style={tab === "data" ? btn(true) : ghost} onClick={() => setTab("data")}>データ</button>}
          {problem && <button style={tab === "kif" ? btn(true) : ghost} onClick={() => setTab("kif")}>KIF</button>}
          <button style={{ ...ghost, marginLeft: "auto" }} onClick={onClose}>×</button>
        </div>

        {tab === "image" && <div>
          {imgUrl && <img src={imgUrl} alt="board" style={{ width: "100%", border: `1px solid ${C.line}`, borderRadius: 8 }} />}
          <div style={{ fontSize: 12, color: C.inkSoft, margin: "8px 0" }}>画像を長押しでも保存・送信できます。</div>
          <button style={btn(true)} onClick={shareImage}>送る / 保存</button>
        </div>}

        {tab === "text" && <div>
          <textarea readOnly value={textPayload} style={{ ...ta, height: 120 }} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}><button style={btn(true)} onClick={() => tryShareText(textPayload, title)}>送る</button><button style={ghost} onClick={() => copyText(textPayload)}>コピー</button></div>
        </div>}

        {tab === "data" && problem && <div>
          <div style={{ fontSize: 12, color: C.inkSoft, marginBottom: 6 }}>このデータを相手に送り、相手は「読み込み」で取り込めます。</div>
          <textarea readOnly value={dataPayload} style={{ ...ta, height: 120 }} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}><button style={btn(true)} onClick={shareData}>ファイルで送る</button><button style={ghost} onClick={() => copyText(dataPayload)}>コピー</button></div>
        </div>}

        {tab === "kif" && problem && <div>
          <div style={{ fontSize: 12, color: C.inkSoft, marginBottom: 6 }}>KIF形式。将棋ソフト（ShogiGUI・Kifu for 等）に読み込めます。</div>
          <textarea readOnly value={kifPayload} style={{ ...ta, height: 160 }} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}><button style={btn(true)} onClick={shareKif}>.kifで送る</button><button style={ghost} onClick={() => copyText(kifPayload)}>コピー</button></div>
        </div>}

        <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 12 }}>※ホーム画面に追加したアプリでは LINE・メール・AirDrop などの共有メニューが開きます（このプレビューでは制限される場合があります）。</div>
      </div>
    </div>
  );
}

// ---- Board ----
function Board({ board, onCellClick, selected, lastTo, size = 360 }) {
  const cell = size / 9;
  const cols = [9, 8, 7, 6, 5, 4, 3, 2, 1];
  const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  return (
    <div style={{ display: "inline-block", fontFamily: FONT }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(9, ${cell}px)` }}>
        {cols.map((c) => <div key={c} style={{ textAlign: "center", fontSize: cell * 0.34, color: C.inkSoft, height: cell * 0.5, lineHeight: `${cell * 0.5}px` }}>{c}</div>)}
      </div>
      <div style={{ display: "flex" }}>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(9, ${cell}px)`, gridTemplateRows: `repeat(9, ${cell}px)`, background: C.board, border: `2px solid ${C.boardLine}`, boxShadow: "0 6px 18px rgba(60,40,20,0.25)" }}>
          {rows.map((r) => cols.map((c) => {
            const key = sq(c, r); const p = board[key];
            const isSel = selected === key; const isLast = lastTo === key;
            return (
              <div key={key} onClick={() => onCellClick && onCellClick(c, r)} style={{ width: cell, height: cell, borderRight: `1px solid ${C.boardLine}`, borderBottom: `1px solid ${C.boardLine}`, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", cursor: onCellClick ? "pointer" : "default", background: isSel ? "rgba(177,68,47,0.30)" : isLast ? "rgba(177,68,47,0.13)" : "transparent" }}>
                {p && <div style={{ transform: p.side === "defender" ? "rotate(180deg)" : "none", fontSize: cell * 0.62, fontWeight: 600, lineHeight: 1, color: p.promoted ? C.vermilion : C.ink, userSelect: "none" }}>{pieceDisp(p)}</div>}
              </div>
            );
          }))}
        </div>
        <div style={{ display: "grid", gridTemplateRows: `repeat(9, ${cell}px)`, marginLeft: 4 }}>
          {rows.map((r) => <div key={r} style={{ width: cell * 0.5, textAlign: "center", fontSize: cell * 0.34, color: C.inkSoft, lineHeight: `${cell}px` }}>{KAN[r]}</div>)}
        </div>
      </div>
    </div>
  );
}

// read-only hand strip
function HandView({ label, hand }) {
  const parts = HAND_ORDER.filter((k) => hand[k] > 0);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT, fontSize: 15, margin: "4px 0" }}>
      <span style={{ width: 70, color: C.inkSoft, fontSize: 13 }}>{label}</span>
      {parts.length ? parts.map((k) => <span key={k}>{k}{hand[k] > 1 ? KAN[hand[k]] : ""}</span>) : <span style={{ color: C.inkSoft }}>なし</span>}
    </div>
  );
}

// =========================================================
export default function App() {
  const [screen, setScreen] = useState("list");
  const [problems, setProblems] = useState(SAMPLE);
  const [loaded, setLoaded] = useState(false);
  const [editId, setEditId] = useState(null);
  const [viewIdx, setViewIdx] = useState(0);
  const [solveMode, setSolveMode] = useState(true);

  useEffect(() => { (async () => { try { const r = await store.get("tsume:problems"); if (r && r.value) setProblems(JSON.parse(r.value)); } catch (e) {} setLoaded(true); })(); }, []);
  useEffect(() => { if (!loaded) return; (async () => { try { await store.set("tsume:problems", JSON.stringify(problems)); } catch (e) {} })(); }, [problems, loaded]);

  const saveProblem = (p) => setProblems((prev) => (prev.some((x) => x.id === p.id) ? prev.map((x) => (x.id === p.id ? p : x)) : [p, ...prev]));
  const deleteProblem = (id) => setProblems((prev) => prev.filter((x) => x.id !== id));
  const importAppend = (arr) => {
    const list = Array.isArray(arr) ? arr : [];
    const cleaned = list.map(sanitizeProblem).filter(Boolean);
    if (cleaned.length === 0) { alert("取り込めるデータがありませんでした（形式を確認してください）"); return; }
    let added = 0, skipped = 0;
    setProblems((prev) => {
      const seen = new Set(prev.map((x) => x.id));
      const fresh = [];
      for (const c of cleaned) { if (seen.has(c.id)) { skipped++; continue; } seen.add(c.id); fresh.push(c); added++; }
      return [...fresh, ...prev];
    });
    if (skipped > 0) setTimeout(() => alert(`${added}件を追加、${skipped}件は重複のためスキップしました`), 0);
  };

  return (
    <div style={{ minHeight: "100vh", background: C.washi, color: C.ink, fontFamily: FONT }}>
      <header style={{ borderBottom: `1px solid ${C.line}`, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, background: C.paper, flexWrap: "wrap" }}>
        <div style={{ width: 30, height: 30, background: C.vermilion, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, fontWeight: 700 }}>詰</div>
        <h1 style={{ fontSize: 19, margin: 0, letterSpacing: 1 }}>詰将棋ノート</h1>
        <nav style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button style={screen === "list" ? btn(true) : ghost} onClick={() => setScreen("list")}>一覧</button>
          <button style={screen === "quiz" ? btn(true) : ghost} onClick={() => setScreen("quiz")}>問題モード</button>
          <button style={ghost} onClick={() => { setEditId(null); setScreen("edit"); }}>＋作成</button>
        </nav>
      </header>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: 18 }}>
        <ErrorBoundary>
        {screen === "list" && (
          <ListScreen problems={problems}
            onPlay={(idx, solve) => { setViewIdx(idx); setSolveMode(solve); setScreen("play"); }}
            onEdit={(id) => { setEditId(id); setScreen("edit"); }}
            onDelete={deleteProblem} onImport={importAppend} />
        )}
        {screen === "edit" && (
          <EditScreen initial={problems.find((p) => p.id === editId)} onCancel={() => setScreen("list")} onSave={(p) => { saveProblem(p); setScreen("list"); }} />
        )}
        {screen === "play" && problems[viewIdx] && (
          <PlayScreen problems={problems} idx={viewIdx} setIdx={setViewIdx} solve={solveMode} onBack={() => setScreen("list")} />
        )}
        {screen === "quiz" && <QuizScreen problems={problems} onExit={() => setScreen("list")} />}
        </ErrorBoundary>
      </main>
    </div>
  );
}

// ---- List ----
function ListScreen({ problems, onPlay, onEdit, onDelete, onImport }) {
  const [io, setIo] = useState(null);
  const [importText, setImportText] = useState("");
  const [shareTarget, setShareTarget] = useState(null);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>データベース</h2>
        <span style={{ color: C.inkSoft, fontSize: 13 }}>{problems.length} 問</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button style={ghost} onClick={() => download(new Blob([JSON.stringify(problems, null, 2)], { type: "application/json" }), `tsume-backup-${new Date().toISOString().slice(0, 10)}.json`)}>端末に保存</button>
          <button style={ghost} onClick={() => setIo(io === "import" ? null : "import")}>読み込み</button>
        </div>
      </div>
      <div style={{ fontSize: 12, color: C.inkSoft, marginBottom: 8 }}>データはこの端末内に自動保存されます。「端末に保存」で全問題をバックアップ（.json）として書き出せます。</div>
      {io === "export" && <div style={ioBox}><div style={{ fontSize: 13, color: C.inkSoft, marginBottom: 6 }}>このJSONをコピーして保存・共有できます。</div><textarea readOnly value={JSON.stringify(problems, null, 2)} style={ta} /></div>}
      {io === "import" && <div style={ioBox}><div style={{ fontSize: 13, color: C.inkSoft, marginBottom: 6 }}>JSON でも KIF でも貼り付けOK（自動判別）。既存に追加で取り込みます。</div><textarea value={importText} onChange={(e) => setImportText(e.target.value)} style={ta} placeholder='[{...}] か、KIF（後手の持駒：… 盤面図 …）' /><button style={{ ...btn(true), marginTop: 8 }} onClick={() => {
        const t = importText.trim();
        if (!t) { alert("内容が空です"); return; }
        try {
          if (looksLikeKIF(t)) {
            const k = parseKIF(t);
            if (Object.keys(k.board).length === 0) { alert("KIFの盤面を読み取れませんでした"); return; }
            onImport([{ title: k.title || "KIF取り込み", moves: k.moves || k.answerMoves.length || 1, summary: "", createdAt: new Date().toISOString().slice(0, 10), board: k.board, hands: k.hands, answerMoves: k.answerMoves }]);
          } else {
            const a = JSON.parse(t);
            if (!Array.isArray(a)) { alert("配列のJSONを貼り付けてください"); return; }
            onImport(a);
          }
          setIo(null); setImportText("");
        } catch (e) { alert("読み取れませんでした（JSON/KIFの形式を確認してください）"); }
      }}>取り込む</button></div>}

      <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
        {problems.map((p, idx) => {
          const t = positionToText(p.board, p.hands || emptyHands());
          return (
            <div key={p.id} style={card}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <h3 style={{ margin: 0, fontSize: 17 }}>{p.title || "（無題）"}</h3>
                <span style={{ fontSize: 12, color: "#fff", background: C.vermilion, padding: "1px 8px", borderRadius: 20 }}>{p.moves || "?"}手詰</span>
                <span style={{ marginLeft: "auto", fontSize: 12, color: C.inkSoft }}>{p.createdAt}</span>
              </div>
              {p.summary && <p style={{ margin: "6px 0", fontSize: 13, color: C.inkSoft }}>{p.summary}</p>}
              <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                <div>攻め方：{t.attacker}{t.attHand !== "なし" && `　持駒 ${t.attHand}`}</div>
                <div>受け方：{t.defender}</div>
              </div>
              <details style={{ marginTop: 6 }}>
                <summary style={{ cursor: "pointer", fontSize: 13, color: C.vermilion }}>答え（手順）を見る</summary>
                <div style={{ fontSize: 14, lineHeight: 1.9, marginTop: 4 }}>
                  {(p.answerMoves && p.answerMoves.length)
                    ? p.answerMoves.map((m, i) => <span key={i} style={{ marginRight: 8 }}>{i + 1}.{m.text}</span>)
                    : <span style={{ color: C.inkSoft }}>解答は未登録です</span>}
                </div>
              </details>
              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                <button style={btn(true)} onClick={() => onPlay(idx, true)}>解く</button>
                <button style={btn(false)} onClick={() => onPlay(idx, false)}>見る</button>
                <button style={ghost} onClick={() => onEdit(p.id)}>編集</button>
                <button style={ghost} onClick={() => setShareTarget(p)}>共有</button>
                <button style={{ ...ghost, marginLeft: "auto", color: C.vermilion }} onClick={() => { if (confirm("削除しますか？")) onDelete(p.id); }}>削除</button>
              </div>
            </div>
          );
        })}
        {problems.length === 0 && <p style={{ color: C.inkSoft }}>まだ問題がありません。「＋作成」から登録してください。</p>}
      </div>
      {shareTarget && <ShareSheet problem={shareTarget} board={shareTarget.board} hands={shareTarget.hands || emptyHands()} onClose={() => setShareTarget(null)} />}
    </div>
  );
}

// ---- Editor ----
function EditScreen({ initial, onCancel, onSave }) {
  const [tab, setTab] = useState("board");
  const [title, setTitle] = useState(initial?.title || "");
  const [summary, setSummary] = useState(initial?.summary || "");
  const [moves, setMoves] = useState(initial?.moves || "");
  const [board, setBoard] = useState(initial?.board ? { ...initial.board } : {});
  const [hands, setHands] = useState(initial?.hands ? cloneHands(initial.hands) : emptyHands());
  const [answer, setAnswer] = useState(initial?.answerMoves ? [...initial.answerMoves] : []);

  const [palSide, setPalSide] = useState("attacker");
  const [palPiece, setPalPiece] = useState("歩");
  const [palPromo, setPalPromo] = useState(false);
  const eraser = palPiece === "消";

  // text fields (3)
  const [fAtt, setFAtt] = useState("");
  const [fDef, setFDef] = useState("");
  const [fHand, setFHand] = useState("");
  const [inFmt, setInFmt] = useState("list"); // list | kif
  const [fKif, setFKif] = useState("");

  const [recording, setRecording] = useState(false);
  const [sel, setSel] = useState(null);
  const [promo, setPromo] = useState(null);

  const recStates = useMemo(() => buildStates(board, hands, answer), [board, hands, answer]);
  const recCur = recStates[recStates.length - 1];
  const recSide = answer.length % 2 === 0 ? "attacker" : "defender";
  const vw = useViewportWidth();
  const bsize = boardSizeFor(vw, 324);

  const goText = () => {
    const t = positionToText(board, hands);
    setFAtt(t.attacker === "なし" ? "" : t.attacker.replace(/　/g, " "));
    setFDef(t.defender === "なし" ? "" : t.defender.replace(/　/g, " "));
    setFHand(t.attHand === "なし" ? "" : t.attHand.replace(/　/g, " "));
    setFKif(toKIF({ title, moves, board, hands, answerMoves: answer }));
    setTab("text");
  };
  const applyText = () => {
    const b = { ...parsePlacements(fAtt, "attacker"), ...parsePlacements(fDef, "defender") };
    if (Object.keys(b).length === 0) { alert("駒が読み取れませんでした。例：受け方欄に「5一玉 4二歩」"); return; }
    const hh = emptyHands(); hh.attacker = parseHand(fHand);
    setBoard(b); setHands(hh); setTab("board");
  };
  const applyKif = () => {
    const k = parseKIF(fKif);
    if (Object.keys(k.board).length === 0) { alert("KIFの盤面を読み取れませんでした"); return; }
    setBoard(k.board); setHands(k.hands);
    if (k.answerMoves && k.answerMoves.length) setAnswer(k.answerMoves);
    if (k.title) setTitle((t) => t || k.title);
    if (k.moves) setMoves((m) => m || String(k.moves));
    setTab("board");
  };

  const onCell = (c, r) => {
    const key = sq(c, r);
    if (!recording) {
      if (eraser) { setBoard((b) => { const n = { ...b }; delete n[key]; return n; }); return; }
      const promoted = palPromo && PROMOTABLE.includes(palPiece);
      setBoard((b) => ({ ...b, [key]: { type: palPiece, side: palSide, promoted } }));
      return;
    }
    const cur = recCur.board;
    if (sel?.kind === "hand") { if (!cur[key]) finalize({ drop: true, to: key, type: sel.piece }); setSel(null); return; }
    if (sel?.kind === "board") {
      if (sel.key === key) { setSel(null); return; }
      const p = cur[sel.key];
      const canP = PROMOTABLE.includes(p.type) && !p.promoted && (inPromoZone(recSide, r) || inPromoZone(recSide, Number(sel.key.split("-")[1])));
      if (canP) { setPromo({ from: sel.key, to: key, type: p.type }); setSel(null); }
      else { finalize({ from: sel.key, to: key, type: p.type, promotedBefore: p.promoted }); setSel(null); }
      return;
    }
    const p = cur[key];
    if (p && p.side === recSide) setSel({ kind: "board", key });
  };
  const finalize = ({ drop, from, to, type, promote = false, promotedBefore = false }) => {
    const prevTo = answer.length ? answer[answer.length - 1].to : null;
    const m = { side: recSide, drop: !!drop, from: from || null, to, type, promote, promotedBefore, text: "" };
    m.text = moveNotation(m, prevTo);
    setAnswer((a) => [...a, m]);
  };

  const tapHand = (k) => setHands((h) => { const n = cloneHands(h); n.attacker[k] = eraser ? Math.max(0, n.attacker[k] - 1) : Math.min(18, n.attacker[k] + 1); return n; });

  const save = () => onSave({
    id: initial?.id || `p-${Date.now()}`, title: title.trim() || "（無題）", moves: Number(moves) || answer.length || 1,
    summary: summary.trim(), createdAt: initial?.createdAt || new Date().toISOString().slice(0, 10), board, hands, answerMoves: answer,
  });

  const t = positionToText(recCur.board, recCur.hands);

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        <button style={tab === "board" ? btn(true) : ghost} onClick={() => setTab("board")}>盤で入力</button>
        <button style={tab === "text" ? btn(true) : ghost} onClick={goText}>文字で入力</button>
        <button style={{ ...ghost, marginLeft: "auto" }} onClick={onCancel}>戻る</button>
      </div>

      {tab === "text" && (
        <div style={{ marginBottom: 16, display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <button style={inFmt === "list" ? btn(true) : ghost} onClick={() => setInFmt("list")}>配置リスト</button>
            <button style={inFmt === "kif" ? btn(true) : ghost} onClick={() => setInFmt("kif")}>KIF</button>
          </div>
          {inFmt === "list" ? (
            <>
              <div style={{ fontSize: 13, color: C.inkSoft }}>各欄に局面の文字だけ入力（例「5一玉 4二歩」）。区切りは空白でも読点でもOK。</div>
              <label style={lbl}>攻め方<input value={fAtt} onChange={(e) => setFAtt(e.target.value)} style={inp} placeholder="5九飛 …" /></label>
              <label style={lbl}>受け方<input value={fDef} onChange={(e) => setFDef(e.target.value)} style={inp} placeholder="5一玉 4二歩 6二歩 …" /></label>
              <label style={lbl}>攻め方 持ち駒<input value={fHand} onChange={(e) => setFHand(e.target.value)} style={inp} placeholder="金 銀二 …" /></label>
              <button style={btn(true)} onClick={applyText}>盤に反映</button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, color: C.inkSoft }}>KIF（盤面図＋指し手）を貼り付け／編集できます。他ソフトとやり取り可能。</div>
              <textarea value={fKif} onChange={(e) => setFKif(e.target.value)} style={{ ...ta, height: 230 }} placeholder={"後手の持駒：…\n  ９ ８ ７ …\n+--…--+\n| … |一\n…"} />
              <button style={btn(true)} onClick={applyKif}>KIFを盤に反映</button>
            </>
          )}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
        <Board board={recording ? recCur.board : board} onCellClick={onCell} selected={sel?.kind === "board" ? sel.key : null} lastTo={recording && answer.length ? answer[answer.length - 1].to : null} size={bsize} />

        <div style={{ flex: 1, minWidth: 260 }}>
          {!recording ? (
            <>
              <div style={{ fontSize: 14, color: C.inkSoft, marginBottom: 6 }}>配置する駒を選んで盤をタップ</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
                <button style={palSide === "attacker" ? btn(true) : ghost} onClick={() => setPalSide("attacker")}>攻め方</button>
                <button style={palSide === "defender" ? btn(true) : ghost} onClick={() => setPalSide("defender")}>受け方</button>
                <button style={{ ...(palPromo ? btn(true) : ghost), marginLeft: "auto" }} onClick={() => setPalPromo((v) => !v)}>成 {palPromo ? "ON" : "OFF"}</button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                {PALETTE.map((k) => {
                  const showProm = palPromo && PROMOTABLE.includes(k);
                  return <button key={k} onClick={() => setPalPiece(k)} style={{ ...ghost, fontSize: 18, padding: "6px 12px", borderColor: palPiece === k ? C.vermilion : C.line, background: palPiece === k ? "rgba(177,68,47,0.1)" : "transparent", color: showProm ? C.vermilion : C.ink }}>{showProm ? PROMO[k] : k}</button>;
                })}
                <button onClick={() => setPalPiece("消")} style={{ ...ghost, fontSize: 14, borderColor: eraser ? C.vermilion : C.line, background: eraser ? "rgba(177,68,47,0.1)" : "transparent" }}>消しゴム</button>
              </div>

              <div style={{ fontSize: 14, color: C.inkSoft, marginBottom: 4 }}>攻め方 持ち駒（タップで＋1／消しゴム中タップで−1）</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                {HAND_ORDER.map((k) => (
                  <button key={k} onClick={() => tapHand(k)} style={{ ...ghost, fontSize: 17, padding: "6px 10px", borderColor: hands.attacker[k] > 0 ? C.vermilion : C.line }}>
                    {k}{hands.attacker[k] > 0 ? <b style={{ color: C.vermilion }}> {hands.attacker[k]}</b> : ""}
                  </button>
                ))}
              </div>

              <div>
                <button style={btn(false)} onClick={() => { setRecording(true); setSel(null); }}>解答を記録する ▶</button>
                <button style={{ ...ghost, marginLeft: 6 }} onClick={() => { setBoard({}); setHands(emptyHands()); setAnswer([]); }}>盤をクリア</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 14, color: C.inkSoft, marginBottom: 6 }}>記録中：手番は<b style={{ color: recSide === "attacker" ? C.ink : C.vermilion }}>{recSide === "attacker" ? "攻め方" : "受け方"}</b>。自分の駒→移動先、または持駒→打つ場所をタップ。</div>
              {["attacker", "defender"].map((s) => {
                const has = HAND_ORDER.some((k) => recCur.hands[s][k] > 0);
                if (!has) return null;
                return <div key={s} style={{ display: "flex", gap: 6, alignItems: "center", margin: "4px 0", opacity: recSide === s ? 1 : 0.5 }}>
                  <span style={{ width: 60, fontSize: 13, color: C.inkSoft }}>{s === "attacker" ? "攻め持駒" : "受け持駒"}</span>
                  {HAND_ORDER.filter((k) => recCur.hands[s][k] > 0).map((k) => <button key={k} disabled={recSide !== s} onClick={() => setSel({ kind: "hand", piece: k })} style={{ ...ghost, padding: "3px 8px", fontSize: 16, borderColor: sel?.kind === "hand" && sel.piece === k ? C.vermilion : C.line }}>{k}{recCur.hands[s][k] > 1 ? recCur.hands[s][k] : ""}</button>)}
                </div>;
              })}
              <div style={{ marginTop: 10, ...card, minHeight: 60 }}>
                <div style={{ fontSize: 13, color: C.inkSoft, marginBottom: 4 }}>解答手順（{answer.length}手）</div>
                <div style={{ fontSize: 15, lineHeight: 1.8 }}>{answer.map((m, i) => <span key={i} style={{ marginRight: 8 }}>{i + 1}.{m.text}</span>)}{answer.length === 0 && <span style={{ color: C.inkSoft }}>まだありません</span>}</div>
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
                <button style={ghost} onClick={() => { setAnswer((a) => a.slice(0, -1)); setSel(null); }}>一手戻す</button>
                <button style={btn(true)} onClick={() => { setRecording(false); setSel(null); setMoves(String(answer.length)); }}>記録終了</button>
              </div>
            </>
          )}
        </div>
      </div>

      {promo && <div style={modalWrap}><div style={modalCard}><div style={{ marginBottom: 12 }}>成りますか？</div><button style={btn(true)} onClick={() => { finalize({ from: promo.from, to: promo.to, type: promo.type, promote: true }); setPromo(null); }}>成る</button><button style={{ ...ghost, marginLeft: 8 }} onClick={() => { finalize({ from: promo.from, to: promo.to, type: promo.type, promote: false }); setPromo(null); }}>不成</button></div></div>}

      <div style={{ marginTop: 20, borderTop: `1px solid ${C.line}`, paddingTop: 16, display: "grid", gap: 10 }}>
        <label style={lbl}>題名<input value={title} onChange={(e) => setTitle(e.target.value)} style={inp} placeholder="例：七色詰将棋 No.1" /></label>
        <label style={lbl}>手数<input value={moves} onChange={(e) => setMoves(e.target.value.replace(/[^0-9]/g, ""))} style={inp} placeholder="自動 or 手入力" /></label>
        <label style={lbl}>概要<textarea value={summary} onChange={(e) => setSummary(e.target.value)} style={{ ...inp, height: 56 }} placeholder="七色詰、煙詰、など" /></label>
        <div style={{ display: "flex", gap: 8 }}><button style={btn(true)} onClick={save}>保存</button><button style={ghost} onClick={onCancel}>キャンセル</button></div>
        <div style={{ fontSize: 13, color: C.inkSoft }}>現在の局面：攻め方 {t.attacker}　持駒 {t.attHand}／受け方 {t.defender}</div>
      </div>
    </div>
  );
}

// ---- Play (解く / 見る) ----
function PlayScreen({ problems, idx, setIdx, solve, onBack }) {
  const p = problems[idx];
  const [mode, setMode] = useState("board");
  const [step, setStep] = useState(0);
  const [revealed, setRevealed] = useState(!solve);
  const [auto, setAuto] = useState(false);
  const [tval, setTval] = useState(2);
  const [tunit, setTunit] = useState("sec");
  const timer = useRef(null);
  const [share, setShare] = useState(false);
  const [txtFmt, setTxtFmt] = useState("list"); // list | kif

  const states = useMemo(() => buildStates(p.board, p.hands || emptyHands(), p.answerMoves || []), [p]);
  const maxStep = states.length - 1;
  const vw = useViewportWidth();
  const bsize = boardSizeFor(vw, 330);

  // 問題が変わったら手順と表示はリセット（自動再生の状態は維持＝連続再生できる）
  useEffect(() => { setStep(0); setRevealed(!solve); }, [idx]);
  // 解く/見るの切替時は自動再生を止めて初期化
  useEffect(() => { setStep(0); setRevealed(!solve); setAuto(false); }, [solve]);

  useEffect(() => {
    if (!auto || !revealed) { clearTimeout(timer.current); return; }
    timer.current = setTimeout(() => {
      if (step < maxStep) setStep((s) => s + 1);
      else if (idx < problems.length - 1) setIdx(idx + 1);
      else setAuto(false);
    }, toMs(tval, tunit));
    return () => clearTimeout(timer.current);
  }, [auto, revealed, step, maxStep, tval, tunit, idx, problems.length, setIdx]);

  const cur = states[step];
  const initText = positionToText(p.board, p.hands || emptyHands());
  const lastTo = step > 0 ? p.answerMoves[step - 1]?.to : null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <button style={ghost} onClick={onBack}>← 一覧</button>
        <div style={{ marginLeft: 4 }}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>{p.title} <span style={{ fontSize: 12, color: C.vermilion }}>{solve ? "［解く］" : "［見る］"}</span></div>
          <div style={{ fontSize: 12, color: C.inkSoft }}>{p.moves}手詰{p.summary ? `・${p.summary}` : ""}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button style={mode === "board" ? btn(true) : ghost} onClick={() => setMode("board")}>盤面</button>
          <button style={mode === "text" ? btn(true) : ghost} onClick={() => setMode("text")}>脳内盤</button>
          <button style={ghost} onClick={() => setShare(true)}>共有</button>
        </div>
      </div>

      {mode === "board" ? (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div>
            <HandView label="受け方 持駒" hand={cur.hands.defender} />
            <Board board={revealed ? cur.board : p.board} lastTo={revealed ? lastTo : null} size={bsize} />
            <HandView label="攻め方 持駒" hand={cur.hands.attacker} />
          </div>
        </div>
      ) : (
        <div style={{ ...card, fontSize: 17, lineHeight: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: C.inkSoft }}>脳内盤（文字表示）</span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button style={{ ...(txtFmt === "list" ? btn(true) : ghost), padding: "4px 10px", fontSize: 13 }} onClick={() => setTxtFmt("list")}>配置</button>
              <button style={{ ...(txtFmt === "kif" ? btn(true) : ghost), padding: "4px 10px", fontSize: 13 }} onClick={() => setTxtFmt("kif")}>KIF盤面</button>
            </div>
          </div>
          {txtFmt === "list" ? (
            <>
              <div>攻め方：{initText.attacker}{initText.attHand !== "なし" && `　持駒 ${initText.attHand}`}</div>
              <div>受け方：{initText.defender}</div>
            </>
          ) : (
            <pre style={{ fontFamily: "monospace", fontSize: 13, lineHeight: 1.5, whiteSpace: "pre", overflowX: "auto", margin: 0 }}>{toKIF({ board: revealed ? cur.board : p.board, hands: revealed ? cur.hands : (p.hands || emptyHands()) })}</pre>
          )}
          {revealed && <>
            <div style={{ borderTop: `1px dashed ${C.line}`, margin: "12px 0" }} />
            <div style={{ fontSize: 12, color: C.inkSoft, marginBottom: 6 }}>手順</div>
            {(p.answerMoves || []).map((m, i) => <span key={i} style={{ marginRight: 10, opacity: i < step ? 1 : 0.22, color: i === step - 1 ? C.vermilion : C.ink, fontWeight: i === step - 1 ? 700 : 400 }}>{i + 1}.{m.text}</span>)}
            {(!p.answerMoves || p.answerMoves.length === 0) && <span style={{ color: C.inkSoft }}>解答未登録</span>}
          </>}
        </div>
      )}

      {!revealed ? (
        <div style={{ textAlign: "center", margin: "18px 0" }}>
          <button style={btn(true)} onClick={() => setRevealed(true)}>答えを見る</button>
        </div>
      ) : (
        <>
          <div style={{ textAlign: "center", margin: "10px 0", fontSize: 15, color: C.vermilion, minHeight: 22 }}>{step === 0 ? "開始局面" : `${step}手目：${cur.text}`}</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
            <button style={ghost} onClick={() => setStep(0)} disabled={step === 0}>⏮</button>
            <button style={btn(false)} onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>◀ 戻す</button>
            <button style={btn(true)} onClick={() => setStep((s) => Math.min(maxStep, s + 1))} disabled={step === maxStep}>進む ▶</button>
            <button style={ghost} onClick={() => setStep(maxStep)} disabled={step === maxStep}>⏭</button>
            <button style={auto ? btn(true) : ghost} onClick={() => setAuto((a) => !a)}>{auto ? "■停止" : "▶自動"}</button>
          </div>
          <input type="range" min={0} max={maxStep} value={step} onChange={(e) => setStep(Number(e.target.value))} style={{ width: "100%", marginTop: 12, accentColor: C.vermilion }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8, fontSize: 13, color: C.inkSoft }}>
            自動再生の間隔 <input type="number" min={1} value={tval} onChange={(e) => setTval(e.target.value)} style={{ ...inp, width: 60, padding: "4px 6px" }} />
            <select value={tunit} onChange={(e) => setTunit(e.target.value)} style={{ ...inp, padding: "4px 6px" }}><option value="sec">秒</option><option value="min">分</option></select>
          </div>
        </>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
        <button style={ghost} onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0}>← 前の問題</button>
        <span style={{ alignSelf: "center", fontSize: 13, color: C.inkSoft }}>{idx + 1} / {problems.length}</span>
        <button style={btn(false)} onClick={() => setIdx(Math.min(problems.length - 1, idx + 1))} disabled={idx === problems.length - 1}>次の問題 →</button>
      </div>
      {share && <ShareSheet problem={p} board={revealed ? cur.board : p.board} hands={revealed ? cur.hands : (p.hands || emptyHands())} onClose={() => setShare(false)} />}
    </div>
  );
}

// ---- Quiz (問題モード / スライドショー) ----
// ---- 盤面で解く（なぞり式：記録手順と一致判定）----
function BoardSolver({ problem, index, total, onPrev, onNext, onExit }) {
  const moves = problem.answerMoves || [];
  const states = useMemo(() => buildStates(problem.board, problem.hands || emptyHands(), moves), [problem]);
  const vw = useViewportWidth();
  const bsize = boardSizeFor(vw, 330);
  const [ply, setPly] = useState(0);
  const [sel, setSel] = useState(null);
  const [promo, setPromo] = useState(null);
  const [msg, setMsg] = useState("");
  const [hint, setHint] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => { setPly(0); setSel(null); setPromo(null); setMsg(""); setHint(false); setGaveUp(false); }, [problem]);

  const solved = moves.length > 0 && ply >= moves.length;
  const cur = states[Math.min(ply, states.length - 1)];
  const recMove = moves[ply];
  const lastTo = ply > 0 ? moves[ply - 1]?.to : null;

  const tryUserMove = (um) => {
    const rec = moves[ply];
    if (!rec) return;
    const ok = rec.drop === um.drop && rec.to === um.to &&
      (rec.drop ? rec.type === um.type : (rec.from === um.from && !!rec.promote === !!um.promote));
    if (ok) {
      let np = ply + 1;
      if (moves[np] && moves[np].side === "defender") np += 1; // 受け方の手を自動
      setPly(np); setSel(null); setHint(false);
      setMsg(np >= moves.length ? "正解！詰みです 🎉" : "正解！　次の手を指してください");
    } else {
      setSel(null);
      setMsg("その手は正解手順と違います。もう一度どうぞ。");
    }
  };

  const onCell = (c, r) => {
    if (solved || gaveUp || !recMove) return;
    const key = sq(c, r);
    const board = cur.board;
    if (sel?.kind === "hand") { if (!board[key]) tryUserMove({ drop: true, from: null, to: key, type: sel.piece, promote: false }); setSel(null); return; }
    if (sel?.kind === "board") {
      if (sel.key === key) { setSel(null); return; }
      const pc = board[sel.key];
      const canP = PROMOTABLE.includes(pc.type) && !pc.promoted && (inPromoZone("attacker", r) || inPromoZone("attacker", Number(sel.key.split("-")[1])));
      if (canP) { setPromo({ from: sel.key, to: key }); setSel(null); }
      else { tryUserMove({ drop: false, from: sel.key, to: key, type: pc.type, promote: false }); setSel(null); }
      return;
    }
    const pc = board[key];
    if (pc && pc.side === "attacker") { setSel({ kind: "board", key }); setMsg(""); }
  };

  const showHint = () => {
    if (!recMove) return;
    setHint(true);
    if (recMove.drop) setMsg(`ヒント：持ち駒の「${recMove.type}」を打ちます`);
    else { const [c, r] = recMove.from.split("-").map(Number); setMsg(`ヒント：${c}${KAN[r]} の駒を動かします`); }
  };
  const giveUp = () => { setGaveUp(true); setPly(moves.length); setSel(null); setMsg("解答を表示しました"); };
  const reset = () => { setPly(0); setSel(null); setMsg(""); setHint(false); setGaveUp(false); };

  const hintFrom = hint && recMove && !recMove.drop ? recMove.from : null;
  const noAnswer = moves.length === 0;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <button style={ghost} onClick={onExit}>← 設定</button>
        <span style={{ marginLeft: "auto", fontSize: 13, color: C.inkSoft }}>{index + 1} / {total}・{problem.moves}手詰</span>
      </div>
      <div style={{ textAlign: "center", fontSize: 16, fontWeight: 600 }}>{problem.title}</div>
      <div style={{ textAlign: "center", fontSize: 13, color: C.inkSoft, marginBottom: 8 }}>攻め方（先手）を動かして詰ましてください</div>

      <div style={{ display: "flex", justifyContent: "center" }}>
        <div>
          <HandView label="受け方 持駒" hand={cur.hands.defender} />
          <Board board={cur.board} onCellClick={onCell} selected={sel?.kind === "board" ? sel.key : hintFrom} lastTo={lastTo} size={bsize} />
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", margin: "6px 0" }}>
            <span style={{ width: 70, fontSize: 13, color: C.inkSoft }}>攻め方 持駒</span>
            {HAND_ORDER.filter((k) => cur.hands.attacker[k] > 0).map((k) => (
              <button key={k} onClick={() => { if (!solved && !gaveUp && cur.hands.attacker[k] > 0) { setSel({ kind: "hand", piece: k }); setMsg(""); } }} style={{ ...ghost, padding: "3px 8px", fontSize: 16, borderColor: sel?.kind === "hand" && sel.piece === k ? C.vermilion : C.line }}>{k}{cur.hands.attacker[k] > 1 ? cur.hands.attacker[k] : ""}</button>
            ))}
            {HAND_ORDER.every((k) => cur.hands.attacker[k] === 0) && <span style={{ color: C.inkSoft, fontSize: 13 }}>なし</span>}
          </div>
        </div>
      </div>

      <div style={{ textAlign: "center", minHeight: 24, margin: "8px 0", fontSize: 15, color: solved ? "#2e7d32" : C.vermilion }}>
        {noAnswer ? "この問題は解答が未登録です（編集で記録できます）" : (msg || (ply === 0 ? "初手を指してください" : `${ply}手目まで正解`))}
      </div>

      {(solved || gaveUp) && (
        <div style={{ ...card, marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: C.inkSoft, marginBottom: 4 }}>手順</div>
          <div style={{ fontSize: 16, lineHeight: 1.9 }}>{moves.map((m, i) => <span key={i} style={{ marginRight: 8 }}>{i + 1}.{m.text}</span>)}</div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
        <button style={ghost} onClick={showHint} disabled={solved || gaveUp || noAnswer}>ヒント</button>
        <button style={ghost} onClick={giveUp} disabled={solved || gaveUp || noAnswer}>答えを見る</button>
        <button style={ghost} onClick={reset} disabled={ply === 0 && !gaveUp}>やり直し</button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
        <button style={ghost} onClick={onPrev} disabled={index === 0}>← 前の問題</button>
        <button style={btn(true)} onClick={onNext} disabled={index === total - 1}>次の問題 →</button>
      </div>

      {promo && <div style={modalWrap}><div style={modalCard}>
        <div style={{ marginBottom: 12 }}>成りますか？</div>
        <button style={btn(true)} onClick={() => { const pc = cur.board[promo.from]; tryUserMove({ drop: false, from: promo.from, to: promo.to, type: pc.type, promote: true }); setPromo(null); }}>成る</button>
        <button style={{ ...ghost, marginLeft: 8 }} onClick={() => { const pc = cur.board[promo.from]; tryUserMove({ drop: false, from: promo.from, to: promo.to, type: pc.type, promote: false }); setPromo(null); }}>不成</button>
      </div></div>}
    </div>
  );
}

function QuizScreen({ problems, onExit }) {
  const movesOptions = useMemo(() => Array.from(new Set(problems.map((p) => p.moves).filter(Boolean))).sort((a, b) => a - b), [problems]);
  const [movesSel, setMovesSel] = useState("all");
  const [count, setCount] = useState(Math.min(10, problems.length || 1));
  const [display, setDisplay] = useState("board");
  const [mode, setMode] = useState("slideshow"); // slideshow | solve
  const [random, setRandom] = useState(true);
  const [tval, setTval] = useState(10);
  const [tunit, setTunit] = useState("sec");

  const [running, setRunning] = useState(false);
  const [list, setList] = useState([]);
  const [q, setQ] = useState(0);
  const [auto, setAuto] = useState(true);
  const [peek, setPeek] = useState(false);
  const timer = useRef(null);
  const vw = useViewportWidth();
  const bsize = boardSizeFor(vw, 330);

  const start = () => {
    let pool = problems.filter((p) => movesSel === "all" || p.moves === Number(movesSel));
    if (random) pool = [...pool].sort(() => Math.random() - 0.5);
    pool = pool.slice(0, Math.max(1, Number(count) || 1));
    if (pool.length === 0) { alert("条件に合う問題がありません"); return; }
    setList(pool); setQ(0); setPeek(false); setAuto(mode === "slideshow"); setRunning(true);
  };

  useEffect(() => {
    if (!running || !auto) { clearTimeout(timer.current); return; }
    timer.current = setTimeout(() => { setPeek(false); setQ((i) => (i < list.length - 1 ? i + 1 : i)); if (q >= list.length - 1) setAuto(false); }, toMs(tval, tunit));
    return () => clearTimeout(timer.current);
  }, [running, auto, q, list.length, tval, tunit]);

  if (!running) {
    return (
      <div>
        <h2 style={{ fontSize: 16 }}>問題モード</h2>
        <div style={{ ...card, display: "grid", gap: 12, maxWidth: 420 }}>
          <div style={lbl}>形式
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <button style={mode === "slideshow" ? btn(true) : ghost} onClick={() => setMode("slideshow")}>スライドショー</button>
              <button style={mode === "solve" ? btn(true) : ghost} onClick={() => setMode("solve")}>盤面で解く</button>
            </div>
          </div>
          <label style={lbl}>手数
            <select value={movesSel} onChange={(e) => setMovesSel(e.target.value)} style={inp}>
              <option value="all">すべて</option>
              {movesOptions.map((m) => <option key={m} value={m}>{m}手詰</option>)}
            </select>
          </label>
          <label style={lbl}>問題数<input type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} style={inp} /></label>
          {mode === "slideshow" && <>
            <label style={lbl}>表示
              <select value={display} onChange={(e) => setDisplay(e.target.value)} style={inp}>
                <option value="board">盤面</option>
                <option value="text">脳内盤（配置の文字）</option>
                <option value="kif">脳内盤（KIF盤面図）</option>
              </select>
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: C.inkSoft }}>次に進む間隔</span>
              <input type="number" min={1} value={tval} onChange={(e) => setTval(e.target.value)} style={{ ...inp, width: 70 }} />
              <select value={tunit} onChange={(e) => setTunit(e.target.value)} style={inp}><option value="sec">秒</option><option value="min">分</option></select>
            </div>
          </>}
          {mode === "solve" && <div style={{ fontSize: 12, color: C.inkSoft }}>盤面で攻め方を動かして詰ますモードです（なぞり式：登録した正解手順と一致で進みます）。</div>}
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}><input type="checkbox" checked={random} onChange={(e) => setRandom(e.target.checked)} /> ランダム順</label>
          <div style={{ display: "flex", gap: 8 }}><button style={btn(true)} onClick={start}>開始</button><button style={ghost} onClick={onExit}>戻る</button></div>
        </div>
      </div>
    );
  }

  if (mode === "solve") {
    return (
      <BoardSolver
        problem={list[q]}
        index={q}
        total={list.length}
        onPrev={() => setQ((i) => Math.max(0, i - 1))}
        onNext={() => setQ((i) => Math.min(list.length - 1, i + 1))}
        onExit={() => setRunning(false)}
      />
    );
  }

  const p = list[q];
  const t = positionToText(p.board, p.hands || emptyHands());
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <button style={ghost} onClick={() => setRunning(false)}>← 設定</button>
        <span style={{ marginLeft: "auto", fontSize: 13, color: C.inkSoft }}>{q + 1} / {list.length}・{p.moves}手詰</span>
      </div>
      <div style={{ textAlign: "center", fontSize: 16, fontWeight: 600, marginBottom: 10 }}>{p.title}</div>

      {display === "board" ? (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div><HandView label="受け方 持駒" hand={(p.hands || emptyHands()).defender} /><Board board={p.board} size={bsize} /><HandView label="攻め方 持駒" hand={(p.hands || emptyHands()).attacker} /></div>
        </div>
      ) : display === "kif" ? (
        <div style={{ ...card }}>
          <pre style={{ fontFamily: "monospace", fontSize: 13, lineHeight: 1.5, whiteSpace: "pre", overflowX: "auto", margin: 0 }}>{toKIF({ board: p.board, hands: p.hands || emptyHands() })}</pre>
        </div>
      ) : (
        <div style={{ ...card, fontSize: 18, lineHeight: 2 }}>
          <div>攻め方：{t.attacker}{t.attHand !== "なし" && `　持駒 ${t.attHand}`}</div>
          <div>受け方：{t.defender}</div>
        </div>
      )}

      {peek && (
        <div style={{ ...card, marginTop: 10 }}>
          <div style={{ fontSize: 12, color: C.inkSoft, marginBottom: 4 }}>解答</div>
          <div style={{ fontSize: 16, lineHeight: 1.9 }}>{(p.answerMoves || []).map((m, i) => <span key={i} style={{ marginRight: 8 }}>{i + 1}.{m.text}</span>)}{(!p.answerMoves || !p.answerMoves.length) && <span style={{ color: C.inkSoft }}>未登録</span>}</div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <button style={ghost} onClick={() => { setPeek(false); setQ((i) => Math.max(0, i - 1)); }} disabled={q === 0}>◀ 前</button>
        <button style={auto ? btn(true) : ghost} onClick={() => setAuto((a) => !a)}>{auto ? "■一時停止" : "▶再生"}</button>
        <button style={peek ? btn(true) : ghost} onClick={() => setPeek((v) => !v)}>答え</button>
        <button style={ghost} onClick={() => { setPeek(false); setQ((i) => Math.min(list.length - 1, i + 1)); }} disabled={q === list.length - 1}>次 ▶</button>
      </div>
      {q === list.length - 1 && !auto && <div style={{ textAlign: "center", marginTop: 14, color: C.vermilion }}>最後の問題です</div>}
    </div>
  );
}
