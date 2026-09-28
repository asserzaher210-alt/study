const r=document.documentElement,t=localStorage.getItem("theme");if(t)r.dataset.theme=t;
document.addEventListener("DOMContentLoaded",()=>{const th=document.getElementById("th");if(!th)return;
  th.onclick=()=>{const d=(r.dataset.theme||(matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light"))==="dark"?"light":"dark";r.dataset.theme=d;localStorage.setItem("theme",d)}});
