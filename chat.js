const $=i=>document.getElementById(i),log=$("log"),form=$("f"),btn=form.querySelector("button");let hist=[],busy=false;
if(document.body.dataset.page)$("pgn").value=document.body.dataset.page;
function msg(c,t,src){const d=document.createElement("div");d.className="m "+c;const s=document.createElement("div");s.textContent=t;d.append(s);
  if(c==="a"&&src!==undefined){const w=document.createElement("div");w.className="src";
    (src||[]).forEach(x=>{const a=document.createElement("a");a.href=`/read/${x.id}?page=${x.page}`;a.target="_blank";a.rel="noopener";a.textContent=`${x.title} - ص${x.page}`;w.append(a)});
    const b=document.createElement("button");b.type="button";b.textContent="نسخ";b.onclick=()=>{navigator.clipboard.writeText(t).then(()=>{b.textContent="تم ✓";setTimeout(()=>b.textContent="نسخ",1500)}).catch(()=>{})};w.append(b);d.append(w)}
  log.append(d);d.scrollIntoView({behavior:"smooth",block:"end"});return d}
form.onsubmit=async e=>{e.preventDefault();if(busy)return;const q=$("q").value.trim();if(!q)return;
  busy=true;btn.disabled=true;$("q").value="";msg("u",q);const w=msg("a","بدوّر في الكتب...");
  try{
    const r=await fetch("/api/chat",{method:"POST",body:new URLSearchParams({q,book:$("bk").value,page:$("pgn").value,hist:hist.slice(-6).join("\n")})});
    let j; try{j=await r.json()}catch(parseErr){throw new Error("رد غير متوقع من الخادم")}
    if(!r.ok||j.error){w.remove();msg("a",j.error||"حصل خطأ، حاول تاني.");return}
    w.remove();msg("a",j.answer,j.sources);hist.push("الطالب: "+q,"المدرّس: "+j.answer.slice(0,800));
  }catch(err){w.remove();msg("a","تعذّر الاتصال بالخادم، تحقق من الإنترنت وحاول تاني.")}
  finally{busy=false;btn.disabled=false;$("q").focus()}};
$("q").onkeydown=e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();form.requestSubmit()}};
