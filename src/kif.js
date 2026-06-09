// KIF形式 ⇔ 内部データ の相互変換
// 内部データ: { board:{"筋-段":{type,side,promoted}}, hands:{attacker,defender}, answerMoves:[...] }

const KAN = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const ZEN = ["", "１", "２", "３", "４", "５", "６", "７", "８", "９"];
const PROMO = { 飛: "龍", 角: "馬", 銀: "全", 桂: "圭", 香: "杏", 歩: "と" };
const PROMO_REV = { 龍: "飛", 竜: "飛", 馬: "角", 全: "銀", 圭: "桂", 杏: "香", と: "歩" };
const HAND_ORDER = ["飛", "角", "金", "銀", "桂", "香", "歩"];
const KANR = "一二三四五六七八九";
const ZENR = "０１２３４５６７８９";

const emptyH = () => ({ 飛: 0, 角: 0, 金: 0, 銀: 0, 桂: 0, 香: 0, 歩: 0 });
const promDisp = (t) => PROMO[t] || t;

// 内部move → 表示用テキスト（▲△・成・打・同）
function noteText(m, prevTo) {
  const mark = m.side === "defender" ? "△" : "▲";
  let sqs;
  if (prevTo && m.to === prevTo) sqs = "同";
  else { const [c, r] = m.to.split("-").map(Number); sqs = `${c}${KAN[r]}`; }
  const ch = m.promotedBefore ? promDisp(m.type) : m.type;
  const suf = m.drop ? "打" : m.promote ? "成" : "";
  return `${mark}${sqs}${ch}${suf}`;
}

// ============ 書き出し（内部 → KIF）============
export function toKIF(p) {
  const board = p.board || {};
  const hands = p.hands || { attacker: emptyH(), defender: emptyH() };
  const handStr = (h) => {
    const ps = HAND_ORDER.filter((k) => (h[k] || 0) > 0).map((k) => k + ((h[k] || 0) > 1 ? KAN[h[k]] : ""));
    return ps.length ? ps.join("　") + "　" : "なし";
  };
  const lines = [];
  if (p.title) lines.push("作品名：" + p.title);
  if (p.moves) lines.push("手数：" + p.moves);
  lines.push("後手の持駒：" + handStr(hands.defender || emptyH()));
  lines.push("  ９ ８ ７ ６ ５ ４ ３ ２ １");
  lines.push("+---------------------------+");
  for (let r = 1; r <= 9; r++) {
    let row = "|";
    for (let c = 9; c >= 1; c--) {
      const pc = board[`${c}-${r}`];
      if (!pc) row += " ・";
      else row += (pc.side === "defender" ? "v" : " ") + (pc.promoted ? promDisp(pc.type) : pc.type);
    }
    lines.push(row + "|" + KAN[r]);
  }
  lines.push("+---------------------------+");
  lines.push("先手の持駒：" + handStr(hands.attacker || emptyH()));
  lines.push("先手番");
  if (p.answerMoves && p.answerMoves.length) {
    lines.push("手数----指手---------消費時間--");
    let prevTo = null;
    p.answerMoves.forEach((m, i) => {
      let dest;
      if (prevTo && m.to === prevTo) dest = "同　";
      else { const [c, r] = m.to.split("-").map(Number); dest = ZEN[c] + KAN[r]; }
      const pieceCh = m.promotedBefore ? promDisp(m.type) : m.type;
      const suffix = m.drop ? "打" : m.promote ? "成" : "";
      const fromPart = m.drop ? "" : (m.from ? "(" + m.from.split("-").join("") + ")" : "");
      lines.push(`${i + 1} ${dest}${pieceCh}${suffix}${fromPart}`);
      prevTo = m.to;
    });
  }
  return lines.join("\n") + "\n";
}

// ============ 読み込み（KIF → 内部）============
function parseHandStr(s) {
  const h = emptyH();
  if (!s || s.indexOf("なし") >= 0) return h;
  const re = /([飛角金銀桂香歩])([一二三四五六七八九十]|[0-9０-９]+)?/g;
  let m;
  while ((m = re.exec(s))) {
    let n = 1;
    if (m[2]) {
      if (m[2] === "十") n = 10;
      else if (KANR.indexOf(m[2]) >= 0) n = KANR.indexOf(m[2]) + 1;
      else n = Number(m[2].replace(/[０-９]/g, (d) => "" + ZENR.indexOf(d)));
    }
    h[m[1]] = (h[m[1]] || 0) + n;
  }
  return h;
}

function parseMoveCore(line) {
  const s = line.trim();
  const re = /(?:^\d+\s*)?([▲△])?\s*(同\s*|[１-９][一二三四五六七八九])\s*(成銀|成桂|成香|[玉王飛龍竜角馬金銀桂香歩と全圭杏])(成|打)?(?:\(([1-9][1-9])\))?/;
  const m = s.match(re);
  if (!m) return null;
  const sideMark = m[1];
  const destTok = m[2];
  const pieceTok = m[3];
  const deco = m[4];
  const fromTok = m[5];

  let to = null, sameAsPrev = false;
  if (/同/.test(destTok)) sameAsPrev = true;
  else {
    const c = ZENR.indexOf(destTok[0]);
    const r = KANR.indexOf(destTok[1]) + 1;
    if (c < 1 || r < 1) return null;
    to = `${c}-${r}`;
  }

  let type, promotedBefore = false;
  if (pieceTok.length === 2) { type = pieceTok[1]; promotedBefore = true; } // 成銀/成桂/成香
  else if (PROMO_REV[pieceTok]) { type = PROMO_REV[pieceTok]; promotedBefore = true; }
  else type = pieceTok;

  const drop = deco === "打";
  const promote = deco === "成";
  const from = (!drop && fromTok) ? `${fromTok[0]}-${fromTok[1]}` : null;

  return { sideMark, to, sameAsPrev, type, promotedBefore, promote, drop, from };
}

export function parseKIF(text) {
  const board = {};
  const hands = { attacker: emptyH(), defender: emptyH() };
  const answerMoves = [];
  const lines = (text || "").replace(/\r/g, "").split("\n");
  let prevTo = null;
  let title = "", moves = 0;

  for (const line of lines) {
    if (/^後手の持駒[:：]/.test(line)) { hands.defender = parseHandStr(line.split(/[:：]/).slice(1).join("：")); continue; }
    if (/^先手の持駒[:：]/.test(line)) { hands.attacker = parseHandStr(line.split(/[:：]/).slice(1).join("：")); continue; }
    if (/^(作品名|表題)[:：]/.test(line)) { title = line.split(/[:：]/).slice(1).join("：").trim(); continue; }
    if (/^手数[:：]/.test(line)) { moves = Number((line.split(/[:：]/)[1] || "").replace(/[^0-9]/g, "")) || 0; continue; }

    const rowm = line.match(/^\|(.+)\|([一二三四五六七八九])/);
    if (rowm) {
      const r = KANR.indexOf(rowm[2]) + 1;
      const cells = rowm[1];
      for (let j = 0; j < 9; j++) {
        const cell = cells.substr(j * 2, 2);
        if (!cell || cell.length < 2) continue;
        const pre = cell[0];
        const ch = cell[1];
        if (ch === "・" || ch === " " || ch === "　") continue;
        const c = 9 - j;
        let type = ch, promoted = false;
        if (PROMO_REV[ch]) { type = PROMO_REV[ch]; promoted = true; }
        board[`${c}-${r}`] = { type, side: pre === "v" ? "defender" : "attacker", promoted };
      }
      continue;
    }

    if (/^[#*&+]/.test(line)) continue;
    if (/^\s*(先手|後手|上手|下手)[:：]/.test(line)) continue;
    if (/^\s*手合割[:：]/.test(line)) continue;
    if (/^\s*手数----/.test(line)) continue;
    if (/(中断|投了|詰み|不詰|持将棋|千日手|切れ負け|反則)/.test(line)) continue;

    const core = parseMoveCore(line);
    if (core) {
      const side = core.sideMark ? (core.sideMark === "▲" ? "attacker" : "defender")
        : (answerMoves.length % 2 === 0 ? "attacker" : "defender");
      const to = core.sameAsPrev ? prevTo : core.to;
      if (!to) continue;
      const m = { side, drop: core.drop, from: core.from, to, type: core.type, promote: core.promote, promotedBefore: core.promotedBefore, text: "" };
      m.text = noteText(m, prevTo);
      answerMoves.push(m);
      prevTo = to;
    }
  }
  return { board, hands, answerMoves, title, moves };
}

// 文字列がKIFっぽいか（取り込み時の自動判別用）
export function looksLikeKIF(text) {
  const t = (text || "").trim();
  if (t.startsWith("[") || t.startsWith("{")) return false; // JSON
  return /持駒|持ち駒|^\s*\|.*[一二三四五六七八九]|手合割|手数----|作品名/m.test(t);
}
