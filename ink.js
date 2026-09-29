// ===== الكتابة على الكتب: قلم / هايلايتر / نص / ممحاة =====
// كل صفحة ليها طبقة canvas شفافة فوق الـ PDF. الرسم بيتخزن كنسب (0..1) من حجم الصفحة
// عشان يفضل في مكانه مهما اتغير التكبير أو حجم الشاشة، وبيتحفظ في المتصفح (IndexedDB) لكل كتاب.
const INK = { tool: "select", pc: "#e11d48", hc: "#facc15", size: 2, ann: {}, bookId: null, undo: [], editing: null };
const PALETTE = ["#111827", "#e11d48", "#2563eb", "#16a34a", "#facc15", "#fb923c", "#a855f7"];
const PEN_W = [0.0016, 0.003, 0.006], HL_W = [0.012, 0.02, 0.032], TXT_S = [0.016, 0.024, 0.036];
const FONT = s => `600 ${s}px Cairo, Tahoma, Arial, sans-serif`;
const inkColor = () => INK.tool === "hl" ? INK.hc : INK.pc;

async function inkLoad(id) {
  INK.bookId = id; INK.ann = {}; INK.undo = []; INK.editing = null;
  const data = await idbGet("ann_" + id);
  if (INK.bookId !== id) return;          // الطالب غيّر الكتاب أثناء التحميل
  INK.ann = data || {};
  vis.forEach(inkDraw);
}
let saveT = 0;
function inkSave() {
  clearTimeout(saveT); const id = INK.bookId, data = INK.ann; if (!id) return;
  saveT = setTimeout(() => idbSet("ann_" + id, data), 150);
}
addEventListener("pagehide", () => { if (INK.bookId) idbSet("ann_" + INK.bookId, INK.ann); });

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy; let t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function drawItem(ctx, it, W, H) {
  if (it.t === "text") {
    ctx.save(); ctx.fillStyle = it.c; ctx.font = FONT(it.s * W); ctx.textBaseline = "top"; ctx.textAlign = "left";
    it.v.split("\n").forEach((ln, i) => { ctx.direction = /[\u0590-\u08FF]/.test(ln) ? "rtl" : "ltr"; ctx.fillText(ln, it.x * W, it.y * H + i * it.s * W * 1.35); });
    ctx.restore(); return;
  }
  const p = it.p; if (!p.length) return;
  ctx.save(); ctx.lineCap = ctx.lineJoin = "round"; ctx.strokeStyle = it.c; ctx.lineWidth = it.w * W;
  if (it.t === "hl") ctx.globalAlpha = 0.4;
  ctx.beginPath(); ctx.moveTo(p[0][0] * W, p[0][1] * H);
  if (p.length === 1) ctx.lineTo(p[0][0] * W + 0.01, p[0][1] * H);
  for (let i = 1; i < p.length - 1; i++) ctx.quadraticCurveTo(p[i][0] * W, p[i][1] * H, (p[i][0] + p[i + 1][0]) / 2 * W, (p[i][1] + p[i + 1][1]) / 2 * H);
  if (p.length > 1) ctx.lineTo(p.at(-1)[0] * W, p.at(-1)[1] * H);
  ctx.stroke(); ctx.restore();
}
function inkCanvas(el) {
  if (el._ink) return el._ink;
  const c = el._ink = document.createElement("canvas"); c.className = "ink"; el.append(c); bindInk(c, el); return c;
}
function inkDraw(el) {
  if (!el?.isConnected) return; const W = el.clientWidth, H = el.clientHeight; if (!W || !H) return;
  const c = inkCanvas(el), d = Math.min(devicePixelRatio || 1, 2), w = Math.round(W * d), h = Math.round(H * d);
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const ctx = c.getContext("2d"); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h); ctx.scale(d, d);
  (INK.ann[+el.dataset.n] || []).forEach(it => drawItem(ctx, it, W, H));
}
function inkFree(el) { if (el._ink) el._ink.width = el._ink.height = 0; }
const redraw = el => { if (el._raf) return; el._raf = requestAnimationFrame(() => { el._raf = 0; inkDraw(el); }); };

function hitItem(ctx, it, x, y, W, H, r) {
  if (it.t === "text") {
    ctx.font = FONT(it.s * W); const ls = it.v.split("\n"), wd = Math.max(...ls.map(l => ctx.measureText(l).width)), px = it.x * W, py = it.y * H;
    return x >= px - r && x <= px + wd + r && y >= py - r && y <= py + ls.length * it.s * W * 1.35 + r;
  }
  const rr = r + it.w * W / 2, p = it.p;
  for (let i = 0; i < p.length; i++) {
    if (Math.hypot(p[i][0] * W - x, p[i][1] * H - y) <= rr) return true;
    if (i && segDist(x, y, p[i - 1][0] * W, p[i - 1][1] * H, p[i][0] * W, p[i][1] * H) <= rr) return true;
  }
  return false;
}
function eraseAt(el, x, y, g) {
  const arr = INK.ann[g.n]; if (!arr?.length) return; const W = el.clientWidth, H = el.clientHeight, ctx = inkCanvas(el).getContext("2d"); let hit = false;
  for (let i = arr.length - 1; i >= 0; i--) if (hitItem(ctx, arr[i], x * W, y * H, W, H, 10)) { g.dels.push({ it: arr[i], i }); arr.splice(i, 1); hit = true; }
  if (hit) redraw(el);
}

function bindInk(c, el) {
  let g = null;
  const pt = e => { const r = c.getBoundingClientRect(); return [clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1)]; };
  c.addEventListener("pointerdown", e => {
    e.stopPropagation(); e.preventDefault(); if (e.pointerType === "mouse" && e.button !== 0) return;
    pending = 0; const n = +el.dataset.n; cur.page = n; $("pn").value = n; const [x, y] = pt(e);
    if (INK.tool === "text") { startText(el, x, y); return; }
    c.setPointerCapture?.(e.pointerId);
    if (INK.tool === "eraser") { g = { n, erase: true, dels: [] }; eraseAt(el, x, y, g); return; }
    const hl = INK.tool === "hl", it = { t: hl ? "hl" : "pen", c: inkColor(), w: (hl ? HL_W : PEN_W)[INK.size - 1], p: [[x, y]] };
    (INK.ann[n] ||= []).push(it); g = { n, it }; redraw(el);
  });
  c.addEventListener("pointermove", e => {
    e.stopPropagation(); if (!g) return;
    const co = e.getCoalescedEvents?.();
    for (const ev of (co && co.length ? co : [e])) {
      const [x, y] = pt(ev);
      if (g.erase) eraseAt(el, x, y, g);
      else { const l = g.it.p.at(-1); if (Math.hypot((x - l[0]) * el.clientWidth, (y - l[1]) * el.clientHeight) > 1.2) g.it.p.push([x, y]); }
    }
    if (!g.erase) redraw(el);
  });
  const end = e => {
    e.stopPropagation(); if (!g) return;
    if (g.erase) { if (g.dels.length) INK.undo.push({ type: "del", n: g.n, items: g.dels }); }
    else INK.undo.push({ type: "add", n: g.n, it: g.it });
    g = null; inkSave();
  };
  c.addEventListener("pointerup", end); c.addEventListener("pointercancel", end);
}

// ----- نص مكتوب بالكيبورد -----
function startText(el, x, y) {
  finishText();
  const W = el.clientWidth, H = el.clientHeight, s = TXT_S[INK.size - 1], t = document.createElement("div");
  t.className = "ink-text"; t.contentEditable = "true"; t.spellcheck = false; t.setAttribute("dir", "auto");
  Object.assign(t.style, { left: x * W + "px", top: y * H + "px", fontSize: s * W + "px", color: INK.pc });
  ["pointerdown", "pointermove", "pointerup"].forEach(ev => t.addEventListener(ev, e => e.stopPropagation()));
  t.onkeydown = e => { if (e.key === "Escape") { t.textContent = ""; t.blur(); } };
  t.onblur = finishText; el.append(t); INK.editing = { el, t, x, y, s, c: INK.pc, book: INK.bookId }; t.focus();
}
function finishText() {
  const E = INK.editing; if (!E) return; INK.editing = null;
  const v = E.t.innerText.replace(/\u00a0/g, " ").replace(/\s+$/, ""); E.t.remove();
  if (!v.trim() || E.book !== INK.bookId) return;
  const n = +E.el.dataset.n, it = { t: "text", c: E.c, s: E.s, x: E.x, y: E.y, v };
  (INK.ann[n] ||= []).push(it); INK.undo.push({ type: "add", n, it }); inkSave(); inkDraw(E.el);
}

// ----- تراجع / مسح الصفحة -----
function inkUndo() {
  finishText(); const a = INK.undo.pop(); if (!a) return; let arr = INK.ann[a.n] ||= [];
  if (a.type === "add") { const i = arr.indexOf(a.it); if (i > -1) arr.splice(i, 1); }
  else if (a.type === "del") a.items.slice().reverse().forEach(({ it, i }) => arr.splice(Math.min(i, arr.length), 0, it));
  else if (a.type === "clear") INK.ann[a.n] = a.items;
  inkSave(); if (Math.abs(a.n - cur.page) > 0 && !vis.has(pageEl(a.n))) gotoPage(a.n); inkDraw(pageEl(a.n));
}
function inkClear() {
  finishText(); const n = cur.page, arr = INK.ann[n]; if (!arr?.length) return;
  if (!confirm("تمسح كل الكتابة اللي على صفحة " + n + "؟")) return;
  INK.undo.push({ type: "clear", n, items: arr }); INK.ann[n] = []; inkSave(); inkDraw(pageEl(n));
}

// ----- شريط الأدوات -----
function syncColors() { const c = inkColor(); document.querySelectorAll("#colors .cdot").forEach(d => d.classList.toggle("on", d.dataset.c === c)); }
function setTool(t) {
  finishText(); INK.tool = t; document.body.dataset.tool = t; clearPin();
  document.querySelectorAll("#tools [data-tool]").forEach(b => b.classList.toggle("on", b.dataset.tool === t)); syncColors();
}
$("colors").innerHTML = PALETTE.map(c => `<button type="button" class="cdot" data-c="${c}" style="background:${c}" aria-label="لون"></button>`).join("");
$("colors").onclick = e => {
  const c = e.target.dataset?.c; if (!c) return;
  if (INK.tool === "select" || INK.tool === "eraser") setTool("pen");
  if (INK.tool === "hl") INK.hc = c; else INK.pc = c; syncColors();
};
document.querySelectorAll("#tools [data-tool]").forEach(b => b.onclick = () => setTool(b.dataset.tool));
$("sz").oninput = e => { INK.size = +e.target.value; };
$("undo").onclick = inkUndo; $("clr").onclick = inkClear;
document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable) { e.preventDefault(); inkUndo(); }
});
setTool("select");
