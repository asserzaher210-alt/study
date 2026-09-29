// ===== ذكاء محلي (بلا حد، بلا مفتاح) =====
// موديل Qwen صغير بيشتغل جوه المتصفح بـ WebGPU عن طريق WebLLM.
// إصلاح الهنج: الموديل بيشتغل في Web Worker منفصل (الصفحة مبتتجمدش وقت التحميل والرد)،
// والأحجام الكبيرة اتشالت، وبنفحص إمكانيات كارت الشاشة قبل التحميل، وبنفرّغ الذاكرة لما تقفل الصفحة.
(() => {
  const CDN = "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.83/+esm";
  // أسماء الموديلات بتتدوّر عليها في قايمة WebLLM الحقيقية وقت التشغيل
  const BASE = { tiny: ["Qwen2.5-0.5B-Instruct", "Qwen3-0.6B"], light: ["Qwen2.5-1.5B-Instruct", "Llama-3.2-1B-Instruct"], mid: ["Qwen2.5-3B-Instruct", "Qwen3-4B"] };
  const SIZES = { tiny: "صغير جدًا (~٥٠٠ ميجا) — الأسلم للجهاز", light: "خفيف (~١ جيجا) — أذكى بكتير من الصغير", mid: "ذكي (~٢ جيجا) — الأفهم والأدق، لأجهزة فيها كارت شاشة قوي" };
  const MIN_BUF = { tiny: 600 * 2 ** 20, light: 1100 * 2 ** 20, mid: 1900 * 2 ** 20 };   // أقل حجم buffer مطلوب في كارت الشاشة
  const WORKER_SRC = `import { WebWorkerMLCEngineHandler } from "${CDN}"; const h = new WebWorkerMLCEngineHandler(); self.onmessage = m => h.onmessage(m);`;
  let W = null, E = null, WK = null, curId = "", loading = null, loadingId = "", Q = Promise.resolve(); const listeners = new Set();

  if (!localStorage.getItem("lsmig3")) { localStorage.setItem("lsmig3", "1"); localStorage.setItem("lsize", "tiny"); }   // مرة واحدة: رجّع الكل للأصغر
  const size = () => { const s = localStorage.getItem("lsize"); return BASE[s] ? s : "tiny"; };
  const setSize = s => { if (BASE[s]) localStorage.setItem("lsize", s); };
  const clean = t => t.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim();
  const lib = async () => W ||= await import(CDN);
  async function adapter() { try { return await navigator.gpu.requestAdapter({ powerPreference: "high-performance" }) || await navigator.gpu.requestAdapter(); } catch { return null; } }
  async function resolveId() {
    const w = await lib(), a = await adapter(), q = a?.features?.has("shader-f16") ? "q4f16_1" : "q4f32_1", list = w.prebuiltAppConfig.model_list;
    for (const b of BASE[size()]) { const m = list.find(x => x.model_id.startsWith(b + "-" + q)); if (m) return m.model_id; }
    throw new Error("مفيش موديل مناسب لجهازك في القايمة. جرّب حجم تاني من الإعدادات.");
  }
  // فحص مسبق: لو كارت الشاشة ضعيف مانحمّلش عشان الجهاز مايهنجش
  async function checkGpu() {
    const a = await adapter(); if (!a) throw new Error("مفيش كارت شاشة (WebGPU) شغال في متصفحك. استخدم «ذكي» السحابي من ⚙️ بدل المحلي.");
    const lim = a.limits || {}, need = MIN_BUF[size()], have = Math.min(lim.maxBufferSize || Infinity, lim.maxStorageBufferBindingSize ? lim.maxStorageBufferBindingSize * 4 : Infinity);
    if (have < need) throw new Error("كارت الشاشة في جهازك ضعيف على الحجم ده. اختار «صغير جدًا» من ⚙️، ولو لسه مش شغال استخدم «ذكي» السحابي.");
  }
  // تحديث النسبة بحد أقصى ٤ مرات في الثانية عشان الصفحة متتخنقش
  let lastEmit = 0;
  const emit = p => { const t = Date.now(); if (t - lastEmit < 250 && (p.progress || 0) < 1) return; lastEmit = t; listeners.forEach(f => { try { f(p); } catch {} }); };
  function killWorker() { try { WK?.terminate(); } catch {} WK = null; E = null; curId = ""; }
  function mkWorker() {
    const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
    const wk = new Worker(url, { type: "module" }); return wk;
  }
  async function ensure(onProg) {
    await checkGpu();
    const id = await resolveId(); if (onProg) listeners.add(onProg);
    try {
      if (E && curId === id) return E;
      if (!(loading && loadingId === id)) {
        loadingId = id;
        loading = (async () => {
          const w = await lib(); killWorker();
          const wk = mkWorker(); WK = wk;
          const dead = new Promise((_, rej) => { wk.onerror = ev => rej(new Error("worker: " + (ev.message || "فشل تشغيل الموديل في الخلفية"))); });
          E = await Promise.race([w.CreateWebWorkerMLCEngine(wk, id, { initProgressCallback: emit }, { context_window_size: 4096 }), dead]);
          curId = id; return E;
        })().catch(e => { killWorker(); throw e; }).finally(() => { loading = null; });
      }
      return await loading;
    } catch (e) {
      const m = String(e && e.message || e);
      throw new Error(/memory|alloc|buffer|device|lost|OOM/i.test(m) ? "جهازك مقدرش يشغّل الموديل ده (الذاكرة مش كفاية). اختار «صغير جدًا» من ⚙️ أو استخدم «ذكي» السحابي." : m);
    } finally { if (onProg) listeners.delete(onProg); }
  }
  // رد كامل بالـ streaming. الطلبات بتتنفذ واحدة ورا التانية.
  function chat({ system, messages, max = 700, temperature = 0.5, onToken, onProg }) {
    const run = async () => {
      const e = await ensure(onProg), nothink = /Qwen3/.test(curId);
      const msgs = [{ role: "system", content: system }, ...messages.map((m, i) => ({ role: m.role, content: nothink && i === messages.length - 1 ? m.content + "\n/no_think" : m.content }))];
      const stream = await e.chat.completions.create({ messages: msgs, stream: true, temperature, top_p: 0.9, frequency_penalty: 0.25, max_tokens: Math.min(max, 800) });
      let out = "", lastT = 0;
      for await (const ch of stream) { const d = ch.choices?.[0]?.delta?.content || ""; if (d) { out += d; const t = Date.now(); if (t - lastT > 120) { lastT = t; onToken?.(clean(out)); } } }
      out = clean(out); onToken?.(out); if (!out) throw new Error("الموديل مرجّعش رد. جرّب تسأل تاني.");
      return out;
    };
    const p = Q.then(run, run); Q = p.catch(() => {}); return p;
  }
  const load = onProg => ensure(onProg);
  // تفريغ الموديل من الذاكرة (بيقفل الـ worker خالص)
  function unload() { killWorker(); }
  async function cached() { try { const w = await lib(); return await w.hasModelInCache(await resolveId()); } catch { return false; } }
  // مبقاش فيه تحميل تلقائي عند فتح الموقع — بيتحمّل بس لما انت تطلبه
  const warmIfCached = async () => {};
  addEventListener("pagehide", killWorker);
  window.LOCAL_AI = { chat, load, unload, cached, warmIfCached, size, setSize, SIZES, supported: () => !!navigator.gpu };
})();
