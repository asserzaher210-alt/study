// ===== صوت الـ AI: قراءة الردود + محادثة صوتية بدون إيدين =====
// بيستخدم أصوات المتصفح نفسه (speechSynthesis) والتعرف على الكلام (SpeechRecognition) — من غير أي مفتاح إضافي.
const HAS_TTS = "speechSynthesis" in window;
const VC = { on: false, speaking: false, waiting: false, rec: null, tok: 0, btn: null, hinted: false };
Object.defineProperty(window, "voiceOn", { get: () => VC.on });
window.VOICE_NOTE = "\n\nإنت دلوقتي في مكالمة صوتية مع الطالب، وكلامك هيتقرأ بصوت عالي. اتكلم زي مدرس صاحبه قاعد جنبه بيحكيله:\n- جمل قصيرة بالمصري الطبيعي، من ٢ لـ ٤ جمل بس في الدور الواحد، وفكرة واحدة كل مرة.\n- ادخل في المفيد على طول، ونوّع بدايات ردودك ومتبدأش كل مرة بـ «أكيد» أو «بالطبع».\n- بعد ما تشرح نقطة، اسأله أحيانًا سؤال قصير يتأكد بيه إنه فاهم، أو اسأله لو عايزك تكمّل. سؤال واحد بس في الرد.\n- لو رد بكلمة قصيرة (أيوه، كمّل، ماشي، تمام، لا، تاني) كمّل الكلام من آخر نقطة وصلتلها في المحادثة بدل ما تبدأ من الأول. ولو قال مش فاهم اشرحها بطريقة تانية ومثال جديد أبسط.\n- اتكلم زي إنسان حقيقي مش زي روبوت: جمل بتتنفس، وممكن تبدأ بـ «طب» أو «بص» أو «شوف» أو «تمام»، وعلّق على إحساس الطالب (فرحان، تعبان، مش فاهم) بحس، واستخدم «يعني» و«أصلها» بشكل طبيعي، وابعد عن الجمل الرسمية والمقالية.\n- افتكر اللي اتقال قبل كده في المحادثة وابني عليه.\n- كلام الطالب جاي من التعرف على الصوت فممكن فيه كلمات غلط أو ناقصة: خمّن قصده من سياق المذاكرة وجاوب من غير ما تقوله إن فيه غلط. لو مفهمتش خالص اسأله سؤال واحد قصير.\n- من غير قوايم ولا جداول ولا رموز ولا ترقيم ولا ماركداون، وبدون ذكر رقم الصفحة. الكلمات الإنجليزي سيبها زي ما هي وشرحها بالعربي.";
const svg = d => '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
const SPK = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>';
const ICO = { on: svg(SPK + '<path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>'), off: svg(SPK + '<line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>'), stop: svg('<rect x="6" y="6" width="12" height="12" rx="2"/>'), spin: '<span class="dot"></span>' };
const autoSpeak = () => localStorage.getItem("autospeak") === "1";

function setStatus(s) { $("vstatus").hidden = !s; if (s) $("vtext").textContent = s; }

// ----- تنضيف النص قبل القراءة -----
function cleanForSpeech(t) {
  return String(t)
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\([^)]*(?:صفحة|ص\s?\d|page|p\.)[^)]*\)/gi, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
    .replace(/^\s*[-•]\s+/gm, "").replace(/^\s*---+\s*$/gm, "")
    .replace(/\/[^\/\s][^\/]{1,30}\//g, "")
    .replace(/\(\s*(?:n|v|adj|adv|prep|conj|pron)\b[^)]*\)/gi, "")
    .replace(/\s[-–—]\s/g, "، ").replace(/[«»“”"]/g, "")
    .replace(/[*_`#>|~]/g, "")
    .replace(/\s*\n+\s*/g, ". ").replace(/\.\s*\./g, ".").replace(/\s{2,}/g, " ").trim();
}
// المتصفحات بتقطع الجمل الطويلة، فبنقسم الكلام لأجزاء صغيرة
function splitChunks(t, max = 170) {
  const parts = t.match(/[^.!?؟…:]+[.!?؟…:]*\s*/g) || [t], out = []; let buf = "";
  const push = s => { s = s.trim(); if (s) out.push(s); };
  for (let p of parts) {
    while (p.length > max) { let i = p.lastIndexOf("،", max); if (i < 40) i = p.lastIndexOf(" ", max); if (i < 40) i = max; if (buf) { push(buf); buf = ""; } push(p.slice(0, i + 1)); p = p.slice(i + 1); }
    if ((buf + p).length > max) { push(buf); buf = p; } else buf += p;
  }
  push(buf); return out;
}

// ----- محركات الصوت -----
// ١) Gemini TTS: أصوات طبيعية بجودة عالية وبتدعم العربي المصري (بنفس مفتاح Gemini المجاني).
// ٢) أصوات المتصفح: احتياطي لو مفيش مفتاح أو حصل خطأ.
const G_VOICES = [["Kore","حازم"],["Puck","مرح"],["Zephyr","مشرق"],["Charon","معلوماتي"],["Fenrir","متحمس"],["Leda","شبابي"],["Orus","حازم"],["Aoede","خفيف"],
  ["Callirrhoe","هادئ"],["Autonoe","مشرق"],["Enceladus","هامس"],["Iapetus","واضح"],["Umbriel","هادئ"],["Algieba","ناعم"],["Despina","ناعم"],["Erinome","واضح"],
  ["Algenib","خشن"],["Rasalgethi","معلوماتي"],["Laomedeia","مرح"],["Achernar","ناعم"],["Alnilam","حازم"],["Schedar","متزن"],["Gacrux","ناضج"],["Pulcherrima","مباشر"],
  ["Achird","ودود"],["Zubenelgenubi","عفوي"],["Vindemiatrix","لطيف"],["Sadachbia","حيوي"],["Sadaltager","واسع المعرفة"],["Sulafat","دافئ"]];
const G_STYLE = "speak like a real Egyptian person having a relaxed friendly chat with a student: natural Egyptian Arabic accent, warm and expressive, varied intonation, small natural pauses between ideas, never robotic and never like reading a script";
const G_PREFIX = "Say in a natural, warm, conversational Egyptian voice, like a friendly teacher talking to a student: ";
const gKey = () => localStorage.getItem("gkey") || "";
if (!localStorage.getItem("voicemig3")) { localStorage.setItem("voicemig3", "1"); localStorage.setItem("voice", ""); }   // نقل مرة واحدة للصوت المحلي
const AUD = new Audio(), tcache = new Map();
let egVoices = []; try { egVoices = JSON.parse(localStorage.getItem("egvoices") || "[]"); } catch {}

// أصوات محلية (نفس الموديل بس بنغيّر طبقة الصوت بنسبة معينة عشان نطلع صوت رجالي/حريمي مختلف)
const L_VOICES = [["kareem","👨 كريم — صوت رجالي محلي (Piper، الأطبع)",1,"m"],["mms","👩 صوت أنثوي محلي (MMS، احتياطي)",1,"f"]];
let pBad = false;   // لو Piper فشل مرة، بنكمّل بـ MMS لحد ما الصفحة تتقفل
const lEng = n => n === "kareem" && !pBad ? "piper" : "mms";
const G_MALE = new Set(["Puck","Charon","Fenrir","Orus","Enceladus","Iapetus","Umbriel","Algieba","Algenib","Rasalgethi","Alnilam","Schedar","Achird","Zubenelgenubi","Sadachbia","Sadaltager"]);
const AR_NAMES = { salma:"سلمى", shakir:"شاكر", hamed:"حامد", zariyah:"زارية", fatima:"فاطمة", hamdan:"حمدان", sana:"سناء", taim:"تايم", layla:"ليلى", rami:"رامي", noura:"نورة", fahed:"فهد", amal:"أمل", moaz:"معاذ", ali:"علي", laila:"ليلى", abdullah:"عبد الله", aysha:"عائشة", bassel:"باسل", rana:"رنا", maryam:"مريم", saleh:"صالح", amany:"أماني", laith:"ليث", ismael:"إسماعيل", amina:"أمينة", jamal:"جمال", mouna:"منى", hedi:"الهادي", reem:"ريم", omar:"عمر", iman:"إيمان", hoda:"هدى", naayf:"نايف" };
const DIAL = { EG:"مصر", SA:"السعودية", AE:"الإمارات", JO:"الأردن", LB:"لبنان", KW:"الكويت", QA:"قطر", BH:"البحرين", OM:"عُمان", IQ:"العراق", YE:"اليمن", SY:"سوريا", DZ:"الجزائر", MA:"المغرب", TN:"تونس", LY:"ليبيا" };
const MALE_RE = /\b(shakir|hamed|hamdan|taim|rami|fahed|moaz|ali|abdullah|bassel|saleh|laith|ismael|jamal|hedi|omar|naayf|guy|ryan|davis|andrew|brian|christopher|eric|roger|steffan|mark|david|george|james|daniel|thomas|oliver|alex|fred|male)\b/i;
const FEMALE_RE = /\b(salma|zariyah|fatima|sana|layla|laila|noura|amal|aysha|rana|maryam|amany|amina|mouna|reem|iman|hoda|aria|jenny|michelle|emma|ava|sonia|libby|samantha|karen|zira|susan|hazel|female|zoe|nora)\b/i;
const gender = v => MALE_RE.test(v.name) ? "m" : FEMALE_RE.test(v.name) ? "f" : "?";
const firstName = v => (v.name.match(/(?:Microsoft|Google)?\s*([A-Za-z]+)\s*(?:Online|\(|-|$)/i) || [])[1] || "";
function bLabel(v) {
  const g = { m: "👨 ", f: "👩 " }[gender(v)] || "", star = isNat(v) ? "⭐ " : "";
  if (/^ar/i.test(v.lang)) { const nm = AR_NAMES[firstName(v).toLowerCase()], d = DIAL[(vlang(v).split("-")[1] || "").toUpperCase()]; if (nm) return `${star}${g}${nm}${d ? " — " + d : ""} (${firstName(v)})`; }
  const short = v.name.replace(/^Microsoft\s+/i, "").replace(/\s*Online \(Natural\)\s*-\s*/i, " — ");
  return `${star}${g}${short}`;
}
const uMix = () => localStorage.getItem("vmix") || "split";
const uRate = () => +(localStorage.getItem("vrate") || 1) || 1;
function bestAr(g) {
  if (!HAS_TTS) return null;
  return speechSynthesis.getVoices().filter(v => /^ar/i.test(v.lang) && gender(v) === g).sort((a, b) => vscore(b, true) - vscore(a, true))[0] || null;
}
function voiceSel() {
  const v = localStorage.getItem("voice") || "";
  if (v.startsWith("p:")) return { engine: "p", name: v.slice(2) };
  if (v.startsWith("g:")) return { engine: "g", name: v.slice(2) };
  if (v.startsWith("b:")) return { engine: "b", name: v.slice(2) };
  if (v.startsWith("l:")) return { engine: "l", name: v.slice(2) };
  if (v.startsWith("t:")) return { engine: "t", name: v.slice(2), gen: "f" };
  if (v.startsWith("auto:")) { const g = v.slice(5), b = bestAr(g); return b ? { engine: "b", name: b.name, gen: g } : { engine: "t", name: "g", gen: g }; }
  if (v) return { engine: "b", name: v };                       // قيمة قديمة
  if (pOK() && location.protocol !== "file:") return { engine: "p", name: localStorage.getItem("pvoice") || "Kore" };   // بعد أول تسجيل دخول: صوت Gemini المجاني هو الافتراضي
  if (HAS_TTS) { const nb = speechSynthesis.getVoices().filter(x => /^ar/i.test(x.lang) && isNat(x)).sort((a, b) => vscore(b, true) - vscore(a, true))[0]; if (nb) return { engine: "b", name: nb.name }; }
  return { engine: "t", name: "g", gen: "f" };
}
function genPref(sel) {
  if (sel.gen) return sel.gen;
  if (sel.engine === "b" && HAS_TTS) { const v = speechSynthesis.getVoices().find(x => x.name === sel.name), g = v && gender(v); return g === "?" ? undefined : g; }
  if (sel.engine === "t") return "f";
  if (sel.engine === "l") return (L_VOICES.find(x => x[0] === sel.name) || [])[3];
}

// ----- أصوات المتصفح -----
const vlang = v => v.lang.replace("_", "-");
// ترتيب الأصوات: Natural/Neural (Edge) أول، بعدين Premium/Enhanced (iPhone وMac)، بعدين Google، وبعدين الباقي. واللهجة المصرية لها أفضلية.
function vscore(v, ar) {
  const n = v.name, l = vlang(v);
  let s = 0;
  if (/natural|neural|online/i.test(n)) s += 12;
  if (/premium|enhanced|siri/i.test(n)) s += 8;
  if (/google/i.test(n)) s += 5;
  if (/compact|espeak|robot/i.test(n)) s -= 6;
  if (/(salma|shakir|hoda|naayf|zariyah|hamed|laila|maged|majed|tarik|mariam|amira)/i.test(n)) s += 1;
  if (ar) s += /-EG/i.test(l) ? 5 : /-(SA|AE|JO|LB|KW|QA)/i.test(l) ? 2 : 0;
  else s += /en-US/i.test(l) ? 3 : /en-GB/i.test(l) ? 2 : 0;
  if (!v.localService) s += 1;
  return s;
}
const isNat = v => /natural|neural|online|premium|enhanced/i.test(v.name);
function pickVoice(ar) {
  const vs = speechSynthesis.getVoices(), pool = vs.filter(v => (ar ? /^ar/i : /^en/i).test(v.lang)); if (!pool.length) return null;
  const chosen = pool.find(v => v.name === voiceSel().name && voiceSel().engine === "b"); if (chosen) return chosen;
  return pool.sort((a, b) => vscore(b, ar) - vscore(a, ar))[0];
}
function pickEn(gen) {
  if (!HAS_TTS) return null;
  const pool = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)); if (!pool.length) return null;
  const sc = v => vscore(v, false) + (gen && gender(v) === gen ? 20 : 0) - (gen && gender(v) !== "?" && gender(v) !== gen ? 10 : 0);
  return pool.sort((a, b) => sc(b) - sc(a))[0];
}
function fillVoices() {
  const sel = $("vsel"), cur0 = localStorage.getItem("voice") || "", vs = HAS_TTS ? speechSynthesis.getVoices() : [];
  sel.innerHTML = "";
  const og = (label, opts) => { if (!opts.length) return; const g = document.createElement("optgroup"); g.label = label; opts.forEach(([v, t]) => g.append(new Option(t, v))); sel.append(g); };
  const bm = bestAr("m"), bf = bestAr("f"), nm = v => v ? " — " + (AR_NAMES[firstName(v).toLowerCase()] || firstName(v)) : " — مش متاح على جهازك";
  sel.append(new Option("تلقائي (الأفضل المتاح)", ""));
  if (location.protocol !== "file:") og("✨ صوت Gemini مجاني (الأقرب للإنسان — بيطلب تسجيل دخول Puter مجاني مرة واحدة)", G_VOICES.map(([id, d]) => ["p:" + id, (G_MALE.has(id) ? "👨 " : "👩 ") + id + " — " + d]));
  og("⚡ اختيار سريع", [["auto:m", "👨 أحسن صوت رجالي" + nm(bm)], ["auto:f", "👩 أحسن صوت نسائي" + nm(bf)]]);
  og("🌐 صوت جوجل (سريع جدًا، محتاج إنترنت)", [["t:g", "👩 جوجل عربي (بيبدأ في أقل من ثانية)"]]);
  og("🧠 صوت محلي (بلا حد، من غير إنترنت بعد أول تحميل)", L_VOICES.map(([id, n]) => ["l:" + id, n]));
  if (gKey()) {   // أصوات Gemini من غير مفتاح مش بتشتغل، فبنخفيها عشان الاختيار ميبقاش وهمي
    og("🇪🇬 أصوات مصرية (Gemini)", egVoices.map(v => ["g:" + v.id, v.name + (v.desc ? " — " + v.desc : "")]));
    og("✨ أصوات Gemini", G_VOICES.map(([id, d]) => ["g:" + id, (G_MALE.has(id) ? "👨 " : "👩 ") + id + " — " + d]));
  }
  const srt = (re, ar) => vs.filter(v => re.test(v.lang)).sort((a, b) => vscore(b, ar) - vscore(a, ar));
  og("🖥️ أصوات المتصفح (⭐ = الأحسن)", [...srt(/^ar/i, true), ...srt(/^en/i, false)].map(v => ["b:" + v.name, bLabel(v)]));
  sel.value = [...sel.options].some(o => o.value === cur0) ? cur0 : (cur0 && !cur0.includes(":") ? "b:" + cur0 : "");
  showNow();
}
function showNow() {
  const el = $("vnow"); if (!el) return; const s = voiceSel(); let ar = "";
  if (s.engine === "b") { const v = HAS_TTS && speechSynthesis.getVoices().find(x => x.name === s.name); ar = v ? bLabel(v) : s.name; }
  else if (s.engine === "l") ar = s.name === "kareem" ? "كريم (صوت محلي Piper)" : "صوت عربي محلي (MMS)";
  else if (s.engine === "t") ar = "جوجل";
  else if (s.engine === "p") ar = "Gemini المجاني (Puter) — " + s.name;
  else ar = "Gemini — " + s.name;
  const en = HAS_TTS ? pickEn(genPref(s)) : null;
  el.textContent = "الشغال دلوقتي ← عربي: " + ar + (s.engine === "g" || s.engine === "t" || s.engine === "p" ? "" : " | إنجليزي: " + (en ? bLabel(en) : "مفيش"));
}
async function loadEgVoices() {
  const key = gKey(); if (!key || egVoices.length || sessionStorage.getItem("egtry")) return; sessionStorage.setItem("egtry", "1");
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/voices?language_code=ar-EG&page_size=50", { headers: { "x-goog-api-key": key } });
    if (!r.ok) return; const j = await r.json();
    egVoices = (j.voices || []).filter(v => v.id).map(v => ({ id: v.id, name: v.displayName || v.display_name || v.id, desc: v.description || "" })).slice(0, 30);
    localStorage.setItem("egvoices", JSON.stringify(egVoices)); fillVoices();
  } catch {}
}

// ----- Gemini TTS -----
async function ttsModel(key) {
  let m = localStorage.getItem("ttsmodel"); if (m) return m;
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": key } }), j = await r.json();
    if (r.ok) {
      const ok = (j.models || []).filter(x => x.supportedGenerationMethods?.includes("generateContent")).map(x => x.name.replace("models/", "")).filter(n => /tts/.test(n));
      const ver = n => +((n.match(/(\d+(?:\.\d+)?)/) || [0, 0])[1]), rank = n => ver(n) * 10 + (/preview/.test(n) ? 0 : 5) + (/lite/.test(n) ? 1 : 0);
      m = ok.sort((a, b) => rank(b) - rank(a))[0];
    } else if (r.status === 400 || r.status === 403) throw new Error("مفتاح Gemini غلط أو مش شغال.");
  } catch (e) { if (/مفتاح/.test(e.message)) throw e; }
  m = m || "gemini-3.8-flash-lite-tts"; localStorage.setItem("ttsmodel", m); return m;
}
function wavFromPCM(pcm, rate = 24000) {
  const h = new DataView(new ArrayBuffer(44)), w = (o, s) => [...s].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); h.setUint32(4, 36 + pcm.byteLength, true); w(8, "WAVEfmt "); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true);
  h.setUint32(24, rate, true); h.setUint32(28, rate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true); w(36, "data"); h.setUint32(40, pcm.byteLength, true);
  return new Blob([h, pcm], { type: "audio/wav" });
}
function b64bytes(b64) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
async function gTTS(text, voice) {
  const key = gKey(); if (!key) throw new Error("NOKEY");
  const model = await ttsModel(key), ck = model + "|" + voice + "|" + text; if (tcache.has(ck)) return tcache.get(ck);
  const isNew = +((model.match(/(\d+(?:\.\d+)?)/) || [0, 0])[1]) >= 3.8, prebuilt = G_VOICES.some(v => v[0] === voice);
  const body = nw => ({ contents: [{ role: "user", parts: [nw ? { text, speech_metadata: { style: G_STYLE } } : { text: G_PREFIX + text }] }],
    generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: nw ? { voice } : { prebuiltVoiceConfig: { voiceName: prebuilt ? voice : "Kore" } } } } });
  const call = nw => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body(nw)) });
  let r = await call(isNew);
  if (r.status === 400) { const r2 = await call(!isNew); if (r2.ok) r = r2; }        // لو شكل الطلب اتغير جرّب الشكل التاني
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 404) localStorage.removeItem("ttsmodel");
    throw new Error(r.status === 429 ? "وصلت للحد المجاني للصوت الطبيعي دلوقتي. استنى شوية." : (j.error?.message || "خطأ " + r.status));
  }
  const part = (j.candidates?.[0]?.content?.parts || []).find(p => p.inlineData || p.inline_data), d = part?.inlineData || part?.inline_data;
  if (!d?.data) throw new Error("مفيش صوت رجع من Gemini");
  const bytes = b64bytes(d.data), mime = d.mimeType || d.mime_type || "";
  const blob = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" ? new Blob([bytes], { type: "audio/wav" }) : wavFromPCM(bytes, +((mime.match(/rate=(\d+)/) || [0, 24000])[1]));
  const url = URL.createObjectURL(blob); tcache.set(ck, url);
  if (tcache.size > 40) { const k = tcache.keys().next().value; URL.revokeObjectURL(tcache.get(k)); tcache.delete(k); }
  return url;
}
// أول جزء صغير عشان الصوت يبدأ بسرعة، والباقي أجزاء أكبر عشان مانستهلكش طلبات كتير
function gChunks(t) {
  const parts = t.match(/[^.!?؟…]+[.!?؟…]*\s*/g) || [t], out = []; let buf = "";
  for (const p of parts) { const lim = out.length ? 420 : 130; if (buf && (buf + p).length > lim) { out.push(buf.trim()); buf = p; } else buf += p; }
  if (buf.trim()) out.push(buf.trim()); return out;
}
function playUrl(url) {
  return new Promise((res, rej) => {
    AUD.src = url; AUD.defaultPlaybackRate = AUD.playbackRate = AUD._noRate ? 1 : uRate(); AUD._stop = res;
    AUD.onended = () => { AUD._stop = null; res(); };
    AUD.onerror = () => { AUD._stop = null; rej(new Error("مقدرتش أشغّل الصوت")); };
    AUD.play().catch(e => { AUD._stop = null; rej(e); });
  });
}
async function gSpeak(clean, voice, tok, onplay) {
  const chunks = gChunks(clean.replace(/<[^>]*>/g, " ")), reqs = new Array(chunks.length);
  const get = i => reqs[i] ||= gTTS(chunks[i], voice).catch(e => { e.i = i; throw e; });
  get(0);
  for (let i = 0; i < chunks.length; i++) {
    let url; try { url = await get(i); } catch (e) { e.rest = chunks.slice(i).join(" "); throw e; }
    if (tok !== VC.tok) return false;
    if (i + 1 < chunks.length) get(i + 1).catch(() => {});
    onplay?.();
    try { await playUrl(url); } catch (e) { e.rest = i ? chunks.slice(i).join(" ") : clean; throw e; }
    if (tok !== VC.tok) return false;
  }
  return true;
}
// ----- صوت Gemini المجاني عن طريق Puter (بلا مفتاح: حساب Puter مجاني بيتعمل مرة واحدة) -----
const P_MODELS = ["gemini-2.5-flash-preview-tts", "gemini-3.1-flash-tts-preview"];
const pOK = () => localStorage.getItem("psigned") === "1";
async function pReady(interactive) {
  await ensurePuter();
  if (!window.puter?.ai || !window.puter?.auth) throw new Error("مكتبة Puter مش متحمّلة (محتاج نت)");
  let ok = false; try { ok = await puter.auth.isSignedIn(); } catch {}
  if (!ok) { if (!interactive) throw new Error("PSIGN"); await puter.auth.signIn(); }
  localStorage.setItem("psigned", "1");
}
async function pTTS(text, voice) {
  const ck = "p|" + voice + "|" + text; if (tcache.has(ck)) return tcache.get(ck);
  let lastE, a;
  for (const model of P_MODELS) {
    try { a = await puter.ai.txt2speech(text, { provider: "gemini", model, voice, instructions: G_STYLE }); if (a?.src) break; }
    catch (e) { lastE = e; if (/auth|sign|401|token/i.test(String(e?.message || e?.error?.message || e))) { localStorage.removeItem("psigned"); throw new Error("PSIGN"); } }
  }
  if (!a?.src) throw new Error(lastE?.error?.message || lastE?.message || "الصوت مرجعش");
  tcache.set(ck, a.src); if (tcache.size > 40) tcache.delete(tcache.keys().next().value);
  return a.src;
}
async function pSpeak(clean, voice, tok, onplay, interactive) {
  await pReady(interactive);
  const chunks = gChunks(clean.replace(/<[^>]*>/g, " ")), reqs = new Array(chunks.length);
  const get = i => reqs[i] ||= pTTS(chunks[i], voice).catch(e => { e.i = i; throw e; });
  get(0);
  for (let i = 0; i < chunks.length; i++) {
    let url; try { url = await get(i); } catch (e) { e.rest = chunks.slice(i).join(" "); throw e; }
    if (tok !== VC.tok) return false;
    if (i + 1 < chunks.length) get(i + 1).catch(() => {});
    onplay?.();
    try { await playUrl(url); } catch (e) { e.rest = i ? chunks.slice(i).join(" ") : clean; throw e; }
    if (tok !== VC.tok) return false;
  }
  return true;
}
// تقسيم الكلام لأجزاء عربي / إنجليزي / أرقام، وكل جزء يتقرأ بالصوت المناسب
function segs(text) {
  const out = [], re = /[A-Za-z][A-Za-z0-9'’&.\-]*(?:[\s,]+[A-Za-z][A-Za-z0-9'’&.\-]*)*/g; let last = 0, m;
  const add = (l, t) => { if (/[\u0600-\u06FF]/.test(t)) out.push({ l: "ar", t }); else if (/[0-9\u0660-\u0669]/.test(t)) out.push({ l: "num", t }); };
  while ((m = re.exec(text))) { if (m.index > last) add("x", text.slice(last, m.index)); out.push({ l: "en", t: m[0] }); last = m.index + m[0].length; }
  if (last < text.length) add("x", text.slice(last));
  return out;
}
const plan = (text, max) => splitChunks(text, max).flatMap(segs);
// أول جزء قصير عشان الصوت يبدأ بسرعة، والباقي أجزاء عادية
function planFast(text, max, first) {
  const ch = splitChunks(text, max); if (ch[0] && ch[0].length > first + 15) ch.splice(0, 1, ...splitChunks(ch[0], first));
  return ch.flatMap(segs);
}
let BU = [];                                                    // مرجع للـ utterances عشان كروم ميمسحهاش
function browserSpeak(clean, tok, done) {
  if (!HAS_TTS) { done(); return; }
  const vs = speechSynthesis.getVoices();
  if (/[\u0600-\u06FF]/.test(clean) && vs.length && !vs.some(v => /^ar/i.test(v.lang)) && !VC.hinted) {
    VC.hinted = true; add("a", "ℹ️ جهازك مفيهوش صوت عربي. على أندرويد نزّل «Google Speech Services» وصوت العربي، وعلى ويندوز استخدم Edge (فيه سلمى وشاكر المصريين)، أو اختار صوت محلي 🧠 من الإعدادات.");
  }
  const list = uMix() === "single" ? splitChunks(clean, 170).map(t => ({ l: /[\u0600-\u06FF]/.test(t) ? "ar" : "en", t })) : plan(clean, 170); if (!list.length) { done(); return; }
  const gen = genPref(voiceSel()); BU = [];
  list.forEach((sg, i) => {
    const en = sg.l === "en", v = en ? pickEn(gen) : pickVoice(true), u = new SpeechSynthesisUtterance(sg.t);
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = en ? "en-US" : "ar-EG";
    const jit = () => (Math.random() - 0.5) * 0.07, qn = /[?؟]\s*$/.test(sg.t);   // تغيير بسيط في السرعة والنغمة بين الجمل عشان الكلام ميبقاش رتيب
    u.rate = (isNat(v || { name: "" }) ? 1 : en ? 0.95 : 0.9) * uRate() * (1 + jit()); u.pitch = Math.min(1.3, Math.max(0.8, 1 + jit() + (qn ? 0.07 : 0)));
    const fin = () => { if (i === list.length - 1 && tok === VC.tok) done(); };
    u.onend = fin; u.onerror = fin; BU.push(u); speechSynthesis.speak(u);
  });
}

// ----- الصوت المحلي (موديل مفتوح المصدر شغال جوه المتصفح: بلا حد ولا مفتاح) -----
// Xenova/mms-tts-ara عن طريق transformers.js. بيتحمّل مرة واحدة ويتخزن في كاش المتصفح.
const WORKER_SRC = `
let P = null;
const load = () => P ||= (async () => {
  const { pipeline, env } = await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3/+esm");
  try { env.backends.onnx.wasm.numThreads = 1; env.backends.onnx.wasm.proxy = false; } catch (e) {}
  const opt = { progress_callback: p => postMessage({ t: "prog", p: p.status === "progress" ? p.progress : null }) };
  try { return await pipeline("text-to-speech", "Xenova/mms-tts-ara", { ...opt, dtype: "q8" }); }
  catch (e) { return await pipeline("text-to-speech", "Xenova/mms-tts-ara", opt); }
})().catch(e => { P = null; throw e; });
let PP = null;
const loadP = () => PP ||= import("https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web@1.0.4/+esm").catch(e => { PP = null; throw e; });
const piper = async (text) => {
  const m = await loadP(), api = m.predict ? m : m.default;
  return api.predict({ text, voiceId: "ar_JO-kareem-medium" }, p => { if (p && p.total) postMessage({ t: "prog", p: 100 * p.loaded / p.total }); });
};
onmessage = async e => {
  if (e.data.warm) { try { if (e.data.eng === "piper") await piper("مرحبا بك"); else { const tts = await load(); await tts("مرحبا بك"); } postMessage({ t: "warm", eng: e.data.eng }); } catch (err) {} return; }
  if (e.data.eng === "piper") { const { id, text } = e.data; try { const blob = await piper(text); postMessage({ t: "pdone", id, blob }); } catch (err) { postMessage({ t: "err", id, msg: String(err && err.message || err) }); } return; }
  const { id, text } = e.data;
  try { const tts = await load(), o = await tts(text), a = o.audio; postMessage({ t: "done", id, audio: a, sr: o.sampling_rate || 16000 }, [a.buffer]); }
  catch (err) { postMessage({ t: "err", id, msg: String(err && err.message || err) }); }
};`;
let LW = null, LID = 0; const LP = new Map();
function lWorker() {
  if (LW) return LW;
  LW = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" })));
  LW.onmessage = e => {
    const m = e.data;
    if (m.t === "prog") { if (m.p != null && VC.btn && VC.btn.classList.contains("ld")) VC.btn.innerHTML = ICO.spin + " تحميل الصوت " + Math.round(m.p) + "%"; return; }
    if (m.t === "warm") { localStorage.setItem("lok_" + m.eng, "1"); return; }
    const r = LP.get(m.id); if (!r) return; LP.delete(m.id);
    if (m.t !== "err") localStorage.setItem("lok_" + (m.t === "pdone" ? "piper" : "mms"), "1");
    m.t === "done" || m.t === "pdone" ? r.res(m) : r.rej(new Error("الصوت المحلي فشل (" + m.msg + ")"));
  };
  LW.onerror = e => { const err = new Error("الصوت المحلي وقع (" + (e.message || "worker") + ")"); LP.forEach(r => r.rej(err)); LP.clear(); try { LW.terminate(); } catch {} LW = null; };
  return LW;
}
const lWarmed = {};
function lWarm(name) { const eng = lEng(name || "kareem"); if (lWarmed[eng]) return; lWarmed[eng] = true; try { lWorker().postMessage({ warm: true, eng }); } catch { lWarmed[eng] = false; } }
const lGen = (text, eng) => new Promise((res, rej) => { const id = ++LID; LP.set(id, { res, rej }); try { lWorker().postMessage({ id, text, eng }); } catch (e) { LP.delete(id); rej(e); } });
async function lTTS(text, fac = 1, name = "mms") {
  const eng = lEng(name), ck = "l|" + eng + "|" + fac + "|" + text; if (tcache.has(ck)) return tcache.get(ck);
  if (eng === "piper") {
    const m = await lGen(text, "piper"), url = URL.createObjectURL(m.blob); tcache.set(ck, url);
    if (tcache.size > 40) { const k = tcache.keys().next().value; URL.revokeObjectURL(tcache.get(k)); tcache.delete(k); }
    return url;
  }
  const m = await lGen(text, "mms"), a = m.audio;
  let peak = 0; for (let i = 0; i < a.length; i++) peak = Math.max(peak, Math.abs(a[i]));
  const g = peak > 0 ? 0.9 / peak : 1, pcm = new Int16Array(a.length);
  for (let i = 0; i < a.length; i++) pcm[i] = Math.max(-1, Math.min(1, a[i] * g)) * 32767;
  const url = URL.createObjectURL(wavFromPCM(pcm, Math.round(m.sr * fac))); tcache.set(ck, url);   // تغيير معدل العينة = طبقة صوت أعمق (رجالي) أو أخف
  if (tcache.size > 40) { const k = tcache.keys().next().value; URL.revokeObjectURL(tcache.get(k)); tcache.delete(k); }
  return url;
}
function utter(text, v, rate = 1) {
  return new Promise(res => {
    if (!HAS_TTS) return res();
    const u = new SpeechSynthesisUtterance(text); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-US";
    u.rate = rate * uRate(); u.onend = u.onerror = () => res(); BU = [u]; speechSynthesis.speak(u);
  });
}
async function lSpeak(clean, tok, onplay, name, gen0) {
  try { return await lSpeak1(clean, tok, onplay, name, gen0); }
  catch (e) {   // Piper فشل؟ نكمّل بـ MMS من نفس المكان بدل ما نقع على صوت المتصفح
    if (name === "kareem" && !pBad && tok === VC.tok) { pBad = true; add("a", "ℹ️ صوت كريم مشتغلش (" + e.message + ")، هكمّل بالصوت المحلي الاحتياطي."); return lSpeak1(e.rest || clean, tok, onplay, "mms", "f"); }
    throw e;
  }
}
async function lSpeak1(clean, tok, onplay, name, gen0) {
  const list = planFast(clean, 120, 55), fac = (L_VOICES.find(x => x[0] === name) || L_VOICES[0])[2], gen = gen0 || genPref({ engine: "l", name }), reqs = [];
  const get = i => reqs[i] ||= lTTS(list[i].t, fac, name);
  const prefetch = from => { let n = 0; for (let j = from; j < list.length && n < 3; j++) if (list[j].l === "ar") { get(j).catch(() => {}); n++; } };
  prefetch(0);
  for (let i = 0; i < list.length; i++) {
    if (tok !== VC.tok) return false;
    const sg = list[i];
    if (sg.l !== "ar") { onplay?.(); await utter(sg.t, sg.l === "en" ? pickEn(gen) : pickVoice(true), sg.l === "en" ? 0.95 : 0.9); continue; }
    let url; try { url = await get(i); } catch (e) { e.rest = list.slice(i).map(x => x.t).join(" "); throw e; }
    if (tok !== VC.tok) return false;
    prefetch(i + 1); onplay?.();
    try { await playUrl(url); } catch (e) { e.rest = list.slice(i).map(x => x.t).join(" "); throw e; }
  }
  return tok === VC.tok;
}

// ----- صوت جوجل (سريع): ملف صوت جاهز من غير توليد -----
const tUrl = (t, l) => "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=" + l + "&q=" + encodeURIComponent(t);
async function tSpeak(clean, tok, onplay) {
  const list = plan(clean, 170).filter(x => x.t.trim()), lg = x => x.l === "en" ? "en" : "ar";
  const pre = i => { if (list[i]) { const a = new Audio(); a.preload = "auto"; a.src = tUrl(list[i].t, lg(list[i])); } };
  pre(1);
  for (let i = 0; i < list.length; i++) {
    if (tok !== VC.tok) return false;
    pre(i + 1); onplay?.();
    try { await playUrl(tUrl(list[i].t, lg(list[i]))); } catch (e) { e.rest = list.slice(i).map(x => x.t).join(" "); throw e; }
  }
  return tok === VC.tok;
}

// ----- القراءة -----
function setBtn(b, st) { if (!b) return; b.classList.toggle("on", st !== "idle"); b.classList.toggle("ld", st === "load"); b.innerHTML = st === "load" ? ICO.spin + " بجهّز الصوت..." : st === "play" ? ICO.stop + " إيقاف" : ICO.on + " اسمع"; }
function stopSpeak() {
  VC.tok++; VC.speaking = false; if (VC.btn) { setBtn(VC.btn, "idle"); VC.btn = null; }
  try { AUD.pause(); } catch {} const s = AUD._stop; AUD._stop = null; s?.();
  if (HAS_TTS) speechSynthesis.cancel();
}
let lastErr = "";
function localThenBrowser(text, tok, done, btn) {
  lSpeak(text, tok, () => setBtn(btn, "play"), voiceSel().engine === "l" ? voiceSel().name : "mms", voiceSel().gen).then(ok => { if (ok) done(); }).catch(e => {
    if (tok !== VC.tok) return;
    if (e.message !== lastErr) { lastErr = e.message; add("a", "⚠️ الصوت المحلي مشتغلش (" + e.message + "). هقرأ بصوت المتصفح."); }
    browserSpeak(e.rest || text, tok, done);
  });
}
function speak(text, { btn, onend } = {}) {
  stopSpeak(); const clean = cleanForSpeech(text);
  if (localStorage.getItem("voice") === "auto:m" && !bestAr("m") && !VC.hintedM) { VC.hintedM = true; add("a", "ℹ️ مفيش صوت عربي رجالي على جهازك، فهقرأ بالصوت المتاح. أحسن حل: افتح الموقع من Edge على ويندوز (فيه «شاكر» المصري)، أو اختار صوت رجالي من أصوات Gemini (Puck / Charon / Fenrir) لو مفتاحك شغال."); } if (!clean) { onend?.(); return; }
  const tok = ++VC.tok, sel = voiceSel(); VC.speaking = true; if (btn) { VC.btn = btn; setBtn(btn, "load"); }
  if (VC.on) setStatus("🔊 بتكلم...");
  const done = () => { if (tok !== VC.tok) return; VC.speaking = false; if (btn) { setBtn(btn, "idle"); if (VC.btn === btn) VC.btn = null; } onend?.(); };
  if (sel.engine === "l") {
    lSpeak(clean, tok, () => setBtn(btn, "play"), sel.name, sel.gen).then(ok => { if (ok) done(); }).catch(e => {
      if (tok !== VC.tok) return;
      if (e.message !== lastErr) { lastErr = e.message; add("a", "⚠️ الصوت المحلي مشتغلش (" + e.message + "). هقرأ بصوت المتصفح."); }
      setBtn(btn, "play"); browserSpeak(e.rest || clean, tok, done);
    });
  } else if (sel.engine === "t") {
    tSpeak(clean, tok, () => setBtn(btn, "play")).then(ok => { if (ok) done(); }).catch(e => {
      if (tok !== VC.tok) return;
      if (e.message !== lastErr) { lastErr = e.message; add("a", "⚠️ صوت جوجل مشتغلش (" + e.message + "). هقرأ بصوت المتصفح."); }
      setBtn(btn, "play"); browserSpeak(e.rest || clean, tok, done);
    });
  } else if (sel.engine === "p") {
    pSpeak(clean, sel.name, tok, () => setBtn(btn, "play"), !!btn || !!window.PSPEAK_GESTURE).then(ok => { if (ok) done(); }).catch(e => {
      if (tok !== VC.tok) return;
      if (e.message === "PSIGN") { if (!VC.pHint) { VC.pHint = true; add("a", "ℹ️ عشان الصوت الطبيعي المجاني يشتغل: من ⚙️ اختار صوت «✨ Gemini مجاني» وسجّل دخول Puter (حساب مجاني، مرة واحدة). دلوقتي هقرأ بصوت المتصفح."); } }
      else if (e.message !== lastErr) { lastErr = e.message; add("a", "⚠️ صوت Gemini المجاني مشتغلش (" + e.message + "). هقرأ بصوت المتصفح."); }
      setBtn(btn, "play"); localThenBrowser(e.rest || clean, tok, done, btn);
    });
  } else if (sel.engine === "g" && (gKey() || !HAS_TTS)) {
    gSpeak(clean, sel.name, tok, () => setBtn(btn, "play")).then(ok => { if (ok) done(); }).catch(e => {
      if (tok !== VC.tok) return;
      if (e.message !== "NOKEY" && e.message !== lastErr) { lastErr = e.message; add("a", "⚠️ الصوت الطبيعي مشتغلش (" + e.message + "). هقرأ بصوت المتصفح."); }
      setBtn(btn, "play"); localThenBrowser(e.rest || clean, tok, done, btn);
    });
  } else { setBtn(btn, "play"); browserSpeak(clean, tok, done); }
}
function stopBtn(b) { setBtn(b, "idle"); if (VC.btn === b) VC.btn = null; }

window.voiceSpeak = (t, o) => speak(t, o);
// زرار 🔊 تحت كل رد
window.voiceDecorate = (d, text) => {
  if (!text) return;
  const b = document.createElement("button"); b.type = "button"; b.className = "spk"; b.innerHTML = ICO.on + " اسمع"; b.title = "اسمع الرد بصوت عالي";
  b.onclick = () => { if (b.classList.contains("on")) stopSpeak(); else speak(text, { btn: b }); };
  d.append(b); d._spk = b;
};

// ----- بعد ما الرد يجهز -----
window.voiceAfter = (a, node) => {
  const resume = () => { VC.waiting = false; if (VC.on) listen(); };
  if (!a) { resume(); return; }
  if (/^(⚠️|حصل خطأ|خطأ)/.test(a)) { if (VC.on) talkStop(); return; }
  if (VC.on || autoSpeak()) speak(a, { btn: VC.on ? null : node?._spk, onend: resume }); else VC.waiting = false;
};

// ----- محادثة صوتية بدون إيدين -----
function listen() {
  if (!VC.on || VC.speaking || VC.waiting || VC.rec) return;
  const r = new SR(); VC.rec = r; r.lang = micLang; r.interimResults = true; r.continuous = false; let fin = "";
  setStatus("🎙️ سامعك... اتكلم");
  r.onresult = e => { let f = "", t = ""; for (const x of e.results) { t += x[0].transcript; if (x.isFinal) f += x[0].transcript; } fin = f; $("q").value = t; };
  r.onerror = e => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") { talkStop(); add("a", "⚠️ اسمح للمتصفح باستخدام الميكروفون من أيقونة القفل جنب الرابط."); }
  };
  r.onend = () => {
    VC.rec = null; if (!VC.on) return; const t = (fin || $("q").value).trim();
    if (t) { VC.waiting = true; setStatus("🤔 بفكر..."); $("q").value = t; $("form").requestSubmit(); }
    else setTimeout(listen, 250);
  };
  try { r.start(); } catch { VC.rec = null; setTimeout(listen, 500); }
}
function talkStart() {
  if (!SR) return; stopSpeak(); VC.on = true; VC.waiting = false; $("talk").classList.add("rec"); if (innerWidth <= 800) showTab("chat");
  if (listening) rec?.stop(); listen();
}
function talkStop() {
  VC.on = false; VC.waiting = false; stopSpeak(); try { VC.rec?.abort(); } catch {} VC.rec = null; $("talk").classList.remove("rec"); setStatus("");
}
$("talk").onclick = () => VC.on ? talkStop() : talkStart();
$("vstop").onclick = talkStop;
if (!SR) $("talk").hidden = true;

// ----- زرار القراءة التلقائية + إعدادات الصوت -----
const syncSpk = () => { const on = autoSpeak(); $("spk").classList.toggle("on", on); $("spk").innerHTML = on ? ICO.on : ICO.off; $("spk").title = on ? "القراءة التلقائية شغالة (اضغط لإيقافها)" : "شغّل القراءة التلقائية للردود"; };
$("spk").onclick = () => { localStorage.setItem("autospeak", autoSpeak() ? "0" : "1"); if (!autoSpeak()) stopSpeak(); syncSpk(); };
{ const r = $("vrate"), m = $("vmix");
  if (r) { r.value = String(uRate()); if (![...r.options].some(o => o.value === r.value)) r.value = "1"; r.onchange = () => localStorage.setItem("vrate", r.value); }
  if (m) { m.value = uMix(); m.onchange = () => localStorage.setItem("vmix", m.value); } }
$("vsel").onchange = async e => {
  localStorage.setItem("voice", e.target.value); showNow();
  if (e.target.value.startsWith("p:")) {   // التسجيل لازم يتعمل من لمسة المستخدم عشان المتصفح ميمنعش النافذة
    localStorage.setItem("pvoice", e.target.value.slice(2)); const el = $("vnow"); if (el) el.textContent = "بفتح تسجيل دخول Puter (مجاني)...";
    try { await pReady(true); showNow(); speak("أهلًا! أنا صوت جيميني المجاني. ازيك، جاهز نذاكر سوا؟"); } catch (err) { if (el) el.textContent = "⚠️ " + (err?.message || err?.error?.message || "التسجيل ماتمش") + " — هيتقرأ بصوت المتصفح."; }
  }
};
$("vtest").onclick = () => { window.PSPEAK_GESTURE = true; try { speak("أهلًا! أنا مساعد المذاكرة. تقدر تكلمني في أي وقت، وأشرحلك أي درس خطوة خطوة. Hello, I can also speak English."); } finally { window.PSPEAK_GESTURE = false; } };
const syncGk = () => { $("gkRow").hidden = !(localStorage.getItem("provider") === "claude" && !gKey()); };
$("gkSave").onclick = () => { const k = $("gk").value.trim(); if (!k) return; localStorage.setItem("gkey", k); localStorage.removeItem("ttsmodel"); sessionStorage.removeItem("egtry"); $("gk").value = ""; syncGk(); fillVoices(); loadEgVoices(); };
$("prov").addEventListener("change", syncGk); $("settingsBtn").addEventListener("click", () => { syncGk(); loadEgVoices(); showNow(); });
$("saveKey").addEventListener("click", () => { localStorage.removeItem("ttsmodel"); sessionStorage.removeItem("egtry"); setTimeout(() => { syncGk(); fillVoices(); loadEgVoices(); }, 0); });
fillVoices(); if (HAS_TTS) speechSynthesis.onvoiceschanged = fillVoices; syncSpk(); syncGk(); loadEgVoices();
if (!HAS_TTS && !gKey()) { /* الصوت الطبيعي لسه ممكن يشتغل بعد إدخال المفتاح */ }
// المتصفحات (خصوصًا iPhone) بتمنع الصوت لحد أول لمسة من المستخدم، فبنفتحه بلمسة أولى
document.addEventListener("pointerdown", () => {
  if (HAS_TTS) { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u); }
  try { AUD.src = URL.createObjectURL(wavFromPCM(new Int16Array(240))); AUD.play().then(() => AUD.pause()).catch(() => {}); } catch {}
}, { once: true });

// تسخين الموديل المحلي في الخلفية (لو اتحمّل قبل كده) عشان أول رد ميستناش تجهيز
// (تم إلغاء التسخين التلقائي للموديل المحلي لأنه كان بيحمّل الجهاز)
if (!localStorage.getItem("vmig3")) { localStorage.setItem("vmig3", "1"); if ((localStorage.getItem("voice") || "").startsWith("l:")) localStorage.removeItem("voice"); }
