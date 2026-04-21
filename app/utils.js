export function generateId() {
    return Date.now();
}
// ════════════════════════════════════════
// UTILS
// ════════════════════════════════════════
function fmtDate(d){if(!d)return'';const[y,m,day]=d.split('-');const mo=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];return`${+day} ${mo[+m-1]} ${y}`;}
let tt;
function toast(msg,t='ok'){
  const el=document.getElementById('toast');
  el.textContent=msg; el.style.background=t==='danger'?'#ef4444':'#1a2332'; el.style.opacity=1;
  clearTimeout(tt); tt=setTimeout(()=>el.style.opacity=0,2600);
}

if ('serviceWorker' in navigator) {
  let newWorker;
 
  navigator.serviceWorker.register('./sw.js').then(reg => {
 
    reg.addEventListener('updatefound', () => {
      newWorker = reg.installing;
 
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdatePopup();
        }
      });
    });
  });
 
  function showUpdatePopup() {
    const update = confirm("New update available. Update now?");
    if (update && newWorker) {
      newWorker.postMessage('SKIP_WAITING');
    }
  }
 
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}