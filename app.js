const MODEL = "claude-sonnet-5-5";
const FILES = { arabic:"الاضواء_عربي_1ث.pdf", history:"الامتحان_تاريخ_1ث.pdf", philosophy:"الامتحان_فلسفه_1ث.pdf",
  technology:"فائز_تكنولجيا_1ث.pdf", english:"المعاصر_انجليزي_1ث.pdf" };
const NAMES = { arabic:"اللغة العربية (الأضواء)", history:"التاريخ (الامتحان)", philosophy:"الفلسفة (الامتحان)",
  technology:"التكنولوجيا (فائز)", english:"English (المعاصر)" };
const SYSTEM = `أنت مدرّس ذكي لطلاب الصف الأول الثانوي. هتاخد مقاطع من كتبهم (نص مستخرج بـ OCR وممكن يكون فيه أخطاء).
- جاوب اعتمادًا على المقاطع، واذكر المصدر: (اسم الكتاب - صفحة X).
- لو السؤال اختيار من متعدد، اذكر الإجابة الصحيحة وبعدين اشرح ليه.
- لو الطالب قال إنه مش فاهم، اشرح بأسلوب بسيط وبأمثلة وخطوة خطوة.
- لو النص مش واضح بسبب الـ OCR قول كده، ولو الإجابة مش في المقاطع قول إنها مش في الكتب. متخترعش إجابة.
- رد بنفس لغة الطالب.`;
const $ = id => document.getElementById(id);
let pages = [], df = {}, avg = 1, history = [];

const norm = s => s.replace(/[\u064B-\u0652\u0640]/g,"").replace(/[إأآٱ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه").toLowerCase()
  .replace(/[٠-٩]/g, d => d.charCodeAt(0) - 1632);
const tok = s => norm(s).split(/[^a-z0-9\u0621-\u064A]+/).filter(w => w.length > 1).map(w => w.replace(/^(وال|بال|كال|فال|لل|ال)/,""));

function load() {
  // PAGES_DATA بييجي من data/pages.js اللي متحمّل بـ <script> عادي في index.html،
  // مش بـ fetch()، عشان fetch() بتترفض من المتصفح لو فتحت index.html مباشرة بـ file://
  pages = (typeof PAGES_DATA !== "undefined" ? PAGES_DATA : []);
  pages.forEach(p => { const t = tok(p.text); p.len = t.length; p.tf = {}; t.forEach(w => p.tf[w] = (p.tf[w]||0)+1);
    Object.keys(p.tf).forEach(w => df[w] = (df[w]||0)+1); });
  avg = pages.reduce((a,p) => a+p.len, 0) / (pages.length||1);
  // قائمة الكتب بتتبني من قائمة الكتب الحقيقية (FILES/NAMES) مش من pages بس،
  // عشان الكتاب يظهر في القائمة حتى لو استخراج نصه لسه ما خلصش.
  const books = Object.keys(FILES).map(id => [id, NAMES[id] || id]);
  $("book").innerHTML = "<option value=''>كل الكتب</option>" + books.map(([id,n]) => `<option value="${id}">${n}</option>`).join("");
  $("books").innerHTML = books.map(([id,n]) => `<button data-id="${id}">📖 ${n}</button>`).join("");
  $("books").onclick = e => { const id = e.target.dataset?.id; if (id) openBook(id, 1); };
  showTab("book");
  add("a","أهلًا! اكتب سؤالك أو سؤال الامتحان وأنا أجاوب وأشرحه من الكتب. لو مش فاهم قولي «اشرحلي» 👋");
}
const pdf = id => "pdfs/" + encodeURIComponent(FILES[id]||"");

// مكتبة pdf.js محلية في lib/ (مش من CDN) عشان الموقع ميعتمدش على إنترنت خارجي
pdfjsLib.GlobalWorkerOptions.workerSrc = "lib/pdf.worker.min.js";
let doc = null, cur = { id:null, page:1 }, zoom = 1, task = null, renderId = 0;
const docs = {};   // كاش للكتب اللي اتفتحت
function showTab(t) { $("app").className = "show-" + t; document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.t === t)); }

function viewerMsg(html, cls = "") { const v = $("vmsg"); v.className = cls; v.innerHTML = html; v.hidden = false; $("cv").hidden = true; }
function errText(err) {
  const n = err?.name || "";
  if (location.protocol === "file:")
    return `المتصفح بيمنع فتح ملفات الـ PDF لما الموقع يتفتح مباشرة من الجهاز (file://).<br>شغّل الموقع من سيرفر: افتح الـ Terminal جوه الفولدر واكتب <b dir="ltr">python -m http.server</b> وبعدين افتح <b dir="ltr">http://localhost:8000</b>، أو ارفعه على GitHub Pages.`;
  if (n === "MissingPDFException" || /404/.test(err?.message||""))
    return "ملف الـ PDF مش موجود على الموقع. اتأكد إن فولدر <b dir='ltr'>pdfs</b> اترفع وإن اسم الملف مطابق تمامًا.";
  if (n === "InvalidPDFException") return "الملف موجود بس مش PDF سليم (ممكن يكون الرفع ناقص أو الملف اتقطع).";
  if (n === "UnexpectedResponseException") return "السيرفر رد بخطأ وقت تحميل الكتاب. جرّب تعمل تحديث للصفحة.";
  return "حصل خطأ وقت تحميل الكتاب" + (err?.message ? `:<br><small dir="ltr">${err.message}</small>` : ".");
}

async function openBook(id, page = 1) {
  showTab("book");
  document.querySelectorAll("#books button").forEach(b => b.classList.toggle("on", b.dataset.id === id));
  const link = $("openTab"); link.href = pdf(id) + "#page=" + page; link.hidden = false;
  if (cur.id !== id || !doc) {
    if (docs[id]) { doc = docs[id]; cur.id = id; }
    else {
      viewerMsg(`<div class="spin"></div><p>جاري تحميل الكتاب... <br><small>الكتب كبيرة، أول مرة ممكن تاخد شوية وقت</small></p><progress id="prog" max="1" value="0"></progress>`);
      try {
        // rangeChunkSize + disableAutoFetch: بيحمّل الصفحات المطلوبة بس مش الملف كله (الملفات 30-70 ميجا)
        const t = pdfjsLib.getDocument({ url: pdf(id), rangeChunkSize: 1 << 18, disableAutoFetch: true, disableStream: false });
        t.onProgress = p => { const el = $("prog"); if (el && p.total) el.value = p.loaded / p.total; };
        doc = await t.promise; docs[id] = doc; cur.id = id;
      } catch (err) {
        console.error(err); doc = null; cur.id = null;
        viewerMsg(`<div class="big">⚠️</div><p>${errText(err)}</p><p style="margin-top:10px"><a href="${pdf(id)}" target="_blank" rel="noopener">فتح الملف في تبويب جديد ↗</a></p>`, "err");
        return;
      }
    }
  }
  $("vmsg").hidden = true; $("cv").hidden = false; await showPage(page);
}

async function showPage(n) {
  if (!doc) return;
  const my = ++renderId, id = cur.id;
  n = Math.min(Math.max(1, Math.floor(n) || 1), doc.numPages); cur.page = n;
  $("pn").value = n; $("pn").max = doc.numPages; $("pt").textContent = "/ " + doc.numPages;
  $("openTab").href = pdf(id) + "#page=" + n;
  try {
    const pg = await doc.getPage(n); if (my !== renderId) return;
    const wrap = $("wrap"), cv = $("cv"), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const fit = Math.max(120, wrap.clientWidth - 28) / pg.getViewport({ scale:1 }).width, vp = pg.getViewport({ scale: fit * zoom });
    if (task) { task.cancel(); try { await task.promise; } catch {} }
    if (my !== renderId) return;
    cv.width = Math.floor(vp.width * dpr); cv.height = Math.floor(vp.height * dpr);
    cv.style.width = Math.floor(vp.width) + "px"; cv.style.height = Math.floor(vp.height) + "px";
    task = pg.render({ canvasContext: cv.getContext("2d"), viewport: vp, transform: dpr !== 1 ? [dpr,0,0,dpr,0,0] : null });
    try { await task.promise; } catch {}
    if (my === renderId) wrap.scrollTop = 0;
  } catch (err) { console.error(err); if (my === renderId) viewerMsg(`<div class="big">⚠️</div><p>مقدرتش أعرض الصفحة ${n}.</p>`, "err"); }
}
$("prev").onclick = () => showPage(cur.page - 1); $("next").onclick = () => showPage(cur.page + 1);
$("pn").onchange = e => showPage(+e.target.value);
$("zi").onclick = () => { zoom = Math.min(3, zoom + .25); showPage(cur.page); }; $("zo").onclick = () => { zoom = Math.max(.5, zoom - .25); showPage(cur.page); };
document.addEventListener("keydown", e => {
  if (!doc || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  if (e.key === "ArrowLeft") showPage(cur.page + 1); else if (e.key === "ArrowRight") showPage(cur.page - 1);
});
let rz; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => doc && showPage(cur.page), 200); });
document.querySelectorAll("#tabs button").forEach(b => b.onclick = () => showTab(b.dataset.t));

function search(q, book) {
  const qt = tok(q), n = pages.length;
  return pages.filter(p => !book || p.id === book).map(p => {
    let s = 0;
    for (const w of qt) { const f = p.tf[w]; if (!f) continue; const d = df[w];
      s += Math.log(1 + (n-d+.5)/(d+.5)) * f * 2.2 / (f + 1.2*(.25 + .75*p.len/avg)); }
    return [p,s];
  }).filter(x => x[1] > 0).sort((a,b) => b[1]-a[1]).slice(0,6).map(x => x[0]);
}

function add(cls, text, hits) {
  const d = document.createElement("div"); d.className = "m " + cls; d.textContent = text;
  if (hits?.length) { const s = document.createElement("div"); s.className = "src";
    hits.forEach(p => { const a = document.createElement("a"); a.href = "#"; a.onclick = e => { e.preventDefault(); openBook(p.id, p.page); };
      a.textContent = `${p.book} - ص${p.page}`; s.append(a); }); d.append(s); }
  $("chat").append(d); $("chat").scrollTop = 1e9; return d;
}

async function ask(q, hits) {
  const key = localStorage.getItem("key");
  if (!key) { $("settings").hidden = false; return "⚠️ ضع مفتاح API في الإعدادات (⚙️) الأول."; }
  const ctx = hits.map(p => `[${p.book} - صفحة ${p.page}]\n${p.text.slice(0,2000)}`).join("\n\n---\n\n") || "(مفيش مقاطع مطابقة)";
  const messages = [...history.slice(-6), { role:"user", content:`المقاطع من الكتب:\n${ctx}\n\nسؤال الطالب: ${q}` }];
  const r = await fetch("https://api.anthropic.com/v1/messages", { method:"POST",
    headers:{ "content-type":"application/json", "x-api-key":key, "anthropic-version":"2023-06-01",
      "anthropic-dangerous-direct-browser-access":"true" },
    body: JSON.stringify({ model:MODEL, max_tokens:1500, system:SYSTEM, messages }) });
  const j = await r.json();
  if (!r.ok) return "حصل خطأ من الـ API: " + (j.error?.message || r.status);
  const a = j.content.map(c => c.text||"").join("");
  history.push({ role:"user", content:q }, { role:"assistant", content:a });
  return a;
}

$("form").onsubmit = async e => {
  e.preventDefault(); const q = $("q").value.trim(); if (!q) return;
  $("q").value = ""; add("u", q); const btn = e.target.querySelector("button"); btn.disabled = true;
  const wait = add("a","بفكر...‏"); wait.classList.add("typing");
  try { const hits = search(q + " " + (history.at(-2)?.content||""), $("book").value); const a = await ask(q, hits);
    wait.remove(); add("a", a, hits); }
  catch (err) { wait.remove(); add("a","خطأ: " + err.message); }
  btn.disabled = false;
};
$("settingsBtn").onclick = () => { $("settings").hidden = !$("settings").hidden; $("key").value = localStorage.getItem("key")||""; };
$("saveKey").onclick = () => { localStorage.setItem("key", $("key").value.trim()); $("settings").hidden = true; };
$("q").onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("form").requestSubmit(); } };
load();
