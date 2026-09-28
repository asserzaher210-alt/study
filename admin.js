const $=s=>document.querySelector(s);
function setMsg(t,ok){const m=$("#upmsg");m.textContent=t;m.className=ok?"mut ok":"mut err"}
function upXhr(file,params){return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();xhr.open("PUT","/admin/upload?"+new URLSearchParams(params));
  xhr.upload.onprogress=e=>{if(e.lengthComputable)setMsg("جاري الرفع… "+Math.round(e.loaded/e.total*100)+"%",true)};
  xhr.onload=()=>{let j={};try{j=JSON.parse(xhr.responseText)}catch(e){}
    if(xhr.status>=200&&xhr.status<300)resolve(j);else reject(new Error(j.error||"فشل الرفع ("+xhr.status+")"))};
  xhr.onerror=()=>reject(new Error("تعذّر الاتصال بالخادم"));xhr.send(file)})}
const upForm=$("#up"),upBtn=upForm.querySelector("button");
upForm.onsubmit=async e=>{e.preventDefault();const file=$("#file").files[0];if(!file)return;
  if(file.type&&file.type!=="application/pdf"&&!file.name.toLowerCase().endsWith(".pdf")){setMsg("الملف المختار مش PDF.",false);return}
  upBtn.disabled=true;setMsg("جاري الرفع…",true);
  try{await upXhr(file,{title:$("#t").value,subject:$("#s").value,grade:$("#g").value});setMsg("تم رفع الكتاب، جاري تجهيز النص…",true);setTimeout(()=>location.reload(),900)}
  catch(err){setMsg(err.message,false);upBtn.disabled=false}};
document.querySelectorAll("[data-replace]").forEach(i=>i.onchange=async()=>{const file=i.files[0];if(!file)return;
  if(!confirm("استبدال هذا الملف سيعيد بناء فهرس البحث للكتاب من جديد. متأكد؟")){i.value="";return}
  i.disabled=true;try{await upXhr(file,{replace:i.dataset.replace});location.reload()}catch(err){alert(err.message);i.disabled=false}});
document.querySelectorAll("form.edit").forEach(f=>f.onsubmit=async e=>{e.preventDefault();const btn=f.querySelector("button");if(btn.disabled)return;btn.disabled=true;
  try{const r=await fetch("/admin/edit",{method:"POST",body:new URLSearchParams(new FormData(f))});const j=await r.json().catch(()=>({}));
    if(!r.ok||j.error){alert(j.error||"فشل الحفظ");btn.disabled=false;return}
    btn.textContent="تم الحفظ ✓";setTimeout(()=>{btn.textContent="حفظ";btn.disabled=false},1500)}
  catch(err){alert("تعذّر الاتصال بالخادم");btn.disabled=false}});
document.querySelectorAll("[data-del]").forEach(b=>b.onclick=async()=>{if(b.disabled)return;if(!confirm("حذف الكتاب نهائيًا؟ لا يمكن التراجع."))return;b.disabled=true;
  try{const r=await fetch("/admin/delete",{method:"POST",body:new URLSearchParams({id:b.dataset.del})});const j=await r.json().catch(()=>({}));
    if(!r.ok||j.error){alert(j.error||"فشل الحذف");b.disabled=false;return} b.closest(".row").remove()}
  catch(err){alert("تعذّر الاتصال بالخادم");b.disabled=false}});
// تحديث حالة معالجة الكتب بدون إعادة تحميل الصفحة كاملة
async function pollStatus(){
  try{const r=await fetch("/api/status");if(!r.ok)return;const list=await r.json();let anyBusy=false;
    list.forEach(s=>{const row=document.querySelector(`[data-book="${s.id}"] .stat`);if(!row)return;
      if(s.status==="processing"){anyBusy=true;row.innerHTML=`<span class="bd busy">جاري تجهيز النص ${s.done}/${s.total}</span>`}
      else if(s.status==="error"){row.innerHTML=`<span class="bd err">خطأ: ${s.error||"تعذّرت المعالجة"}</span>`}
      else{row.innerHTML=s.error?`<span class="bd warn">${s.error}</span>`:""}});
    if(anyBusy)setTimeout(pollStatus,4000)}
  catch(e){}}
if(document.querySelector(".busy"))setTimeout(pollStatus,4000);
