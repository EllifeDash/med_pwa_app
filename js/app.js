 // ════════════════════════════════════════
 // IMPORT MODULES
 // ════════════════════════════════════════
import "./utils.js";
import "./db.js";
import "./settings.js";
import "./init.js";

// start app
initApp();

import { initApp } from "./init.js";
import "./settings.js";

initApp();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}

// ════════════════════════════════════════
// MODALS
// ════════════════════════════════════════
function openMo(id){document.getElementById(id).classList.add('open');document.body.style.overflow='hidden';}
function closeMo(id){document.getElementById(id).classList.remove('open');document.body.style.overflow='';}
document.querySelectorAll('.mo').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeMo(m.id);}));