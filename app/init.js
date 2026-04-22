export function initApp() {
    console.log("App Initialized");
}
import { generateId } from "./utils.js";
import { saveData } from "./db.js";
import { DB } from "./db.js";

// INIT
// ════════════════════════════════════════
window.addEventListener('load', async () => {
  await DB.migrate();
  const existing = await DB.get('ma_services');
  if (!existing) await DB.set('ma_services', DEFAULT_SVC);
  const s = await gSet();
 
  // Populate welcome screen display elements
  document.getElementById('wTagline').textContent = s.tagline || 'Your Mobile Medical Companion';
  document.getElementById('wDisplayName').textContent = s.name || 'Your Name';
  document.getElementById('wDisplayRank').textContent = s.rank || 'Rank / Designation';
 
  // Logo (upper-left)
  if(s.logo){
    document.getElementById('wLogoWrap').innerHTML=`<img src="${s.logo}" style="width:100%;height:100%;object-fit:contain;padding:4px"/>`;
  }
  // Subject / profile photo (center)
  if(s.photo){
    document.getElementById('wSubjectWrap').innerHTML=`<img src="${s.photo}" class="wsubject-img"/>`;
  }
 
  // Keep hidden compat inputs populated for saveProfile()
  document.getElementById('iName').value = s.name || '';
  document.getElementById('iRank').value = s.rank || '';
  updateWelcomeInitials();
 
  const now = new Date();
  document.getElementById('fDate').valueAsDate = now;
  document.getElementById('fTime').value = now.toTimeString().slice(0, 5);
 
  // Hide spinner, fade in card
  document.getElementById('wsSpinner').style.display = 'none';
  document.getElementById('wsCard').classList.add('wcard-ready');
});