const $=i=>document.getElementById(i),id=document.body.dataset.id,cv=$("cv"),ctx=cv.getContext("2d"),errBox=$("err");
let pdf,n=Math.max(1,parseInt(new URLSearchParams(location.search).get("page"))||1),zoom=1,renderId=0,loaded=false;
const controls=[$("pv"),$("nx"),$("zo"),$("zi"),$("pg"),$("sq")];controls.forEach(el=>el.disabled=true);
function showError(msg){errBox.textContent=msg;errBox.hidden=false;cv.hidden=true}
try{
  pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  pdfjsLib.getDocument("/pdf/"+id).promise.then(d=>{
    pdf=d;loaded=true;$("tot").textContent=d.numPages;controls.forEach(el=>el.disabled=false);show(Math.min(n,d.numPages));
  }).catch(()=>showError("تعذّر فتح هذا الكتاب. قد يكون الملف غير موجود أو تالفًا، أو تعذّر تحميل عارض PDF. جرّب تحديث الصفحة."));
}catch(e){showError("تعذّر تحميل عارض PDF. تأكد من الاتصال بالإنترنت وحدّث الصفحة.")}
async function show(p){
  if(!loaded)return; p=Math.trunc(Number(p)); if(!Number.isFinite(p))return;
  n=Math.max(1,Math.min(pdf.numPages,p)); $("pg").value=n; $("ask").href=`/chat?book=${id}&page=${n}`;
  const myRender=++renderId;
  try{
    const pg=await pdf.getPage(n); if(myRender!==renderId)return;
    const w=Math.max(200,cv.parentElement.clientWidth-16),v=pg.getViewport({scale:w/pg.getViewport({scale:1}).width*zoom}),r=Math.min(devicePixelRatio||1,2.5);
    cv.width=Math.round(v.width*r);cv.height=Math.round(v.height*r);cv.style.width=v.width+"px";cv.style.height=v.height+"px";
    const task=pg.render({canvasContext:ctx,viewport:v,transform:[r,0,0,r,0,0]});
    await task.promise; if(myRender!==renderId)return; history.replaceState(0,"","?page="+n);
  }catch(e){ if(myRender===renderId && e && e.name!=="RenderingCancelledException") showError("تعذّر عرض هذه الصفحة، جرّب صفحة تانية.") }
}
$("pv").onclick=()=>show(n-1);$("nx").onclick=()=>show(n+1);
$("zi").onclick=()=>{zoom=Math.min(3,zoom+.25);show(n)};$("zo").onclick=()=>{zoom=Math.max(.5,zoom-.25);show(n)};
$("pg").onchange=e=>{const v=parseInt(e.target.value);if(Number.isFinite(v))show(v);else e.target.value=n};
addEventListener("keydown",e=>{if(["INPUT","TEXTAREA"].includes(e.target.tagName))return;if(e.key==="ArrowLeft")show(n+1);if(e.key==="ArrowRight")show(n-1)});
let tm;$("sq").oninput=e=>{clearTimeout(tm);const q=e.target.value.trim(),h=$("hits");
  tm=setTimeout(async()=>{h.innerHTML="";if(!q)return;
    try{const r=await fetch(`/api/booksearch?id=${encodeURIComponent(id)}&q=${encodeURIComponent(q)}`);const j=await r.json();
      h.append(j.length?"النتائج في الصفحات: ":"لا نتائج (قد يكون النص لسه بيتجهّز)");
      j.forEach(p=>{const b=document.createElement("button");b.type="button";b.textContent=p;b.onclick=()=>show(p);h.append(b)});
    }catch(e){h.textContent="تعذّر البحث الآن."}
  },400)};
