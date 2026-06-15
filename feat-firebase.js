/* feat-firebase.js — cloud save + login via Firebase/Firestore (same stack as mythic_tribes).
 * Anonymous Auth -> uid; player save at Firestore players/{uid}; localStorage kept as offline cache.
 * Loads AFTER game-core.js. Falls back to localStorage if SDK/auth unavailable. Web apiKey is public.
 */
(function(){
  var CFG = {"apiKey": "AIzaSyAE4M2VQ_at96zi9Zyu3PseYnoO_mfKBdg", "authDomain": "hero-legends-thai.firebaseapp.com", "projectId": "hero-legends-thai", "storageBucket": "hero-legends-thai.firebasestorage.app", "messagingSenderId": "840317489204", "appId": "1:840317489204:web:1769e8f00a5370f76eba61"};
  var SDK = 'https://www.gstatic.com/firebasejs/10.12.5/';
  var status='init', uid=null, db=null, auth=null, saveT=null;
  function pill(){
    var el=document.getElementById('fb-cloud');
    if(!el){ el=document.createElement('div'); el.id='fb-cloud';
      el.style.cssText='position:absolute;top:8px;left:50%;transform:translateX(-50%);z-index:30;font-size:10.5px;font-weight:700;padding:3px 11px;border-radius:14px;background:rgba(22,22,36,.85);border:1px solid #2c2c46;pointer-events:none;transition:opacity .3s';
      (document.getElementById('stage')||document.body).appendChild(el); }
    var m={init:'☁️ เชื่อมต่อ…',synced:'☁️ ซิงค์คลาวด์แล้ว',saving:'☁️ กำลังบันทึก…',offline:'📴 ออฟไลน์ (เครื่องนี้)',noauth:'⚠️ เปิด Anonymous auth ใน console'};
    el.textContent=m[status]||status;
    el.style.color = status==='synced'?'#86efac':(status==='offline'||status==='noauth')?'#fbbf24':'#9a9ac0';
    el.style.opacity='1'; if(status==='synced') setTimeout(function(){ if(el)el.style.opacity='0'; },1600);
  }
  function load(src){ return new Promise(function(res,rej){ var s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=rej; document.head.appendChild(s); }); }
  function cloudSave(){ if(!db||!uid) return; status='saving'; pill();
    db.collection('players').doc(uid).set({state:GAME.state,updatedAt:Date.now()},{merge:true})
      .then(function(){ status='synced'; pill(); }).catch(function(e){ status='offline'; pill(); }); }
  function queueCloud(){ clearTimeout(saveT); saveT=setTimeout(cloudSave,1200); }
  function wireSave(){ if(!window.GAME||GAME.__fbWrapped) return; GAME.__fbWrapped=true; var orig=GAME.save; GAME.save=function(){ orig.apply(GAME,arguments); queueCloud(); }; }
  function applyCloud(data){ if(!data||!data.state) return;
    Object.keys(data.state).forEach(function(k){ GAME.state[k]=data.state[k]; });
    try{ localStorage.setItem('hlt_save', JSON.stringify(GAME.state)); }catch(e){}
    GAME.refresh&&GAME.refresh();
    ['renderHeroes','renderInventory','renderShop'].forEach(function(f){ if(typeof window[f]==='function') try{window[f]();}catch(e){} }); }
  async function init(){ if(!window.GAME) return; pill(); wireSave();
    try{ await load(SDK+'firebase-app-compat.js'); await load(SDK+'firebase-auth-compat.js'); await load(SDK+'firebase-firestore-compat.js'); }
    catch(e){ status='offline'; pill(); return; }
    try{ firebase.initializeApp(CFG); auth=firebase.auth(); db=firebase.firestore(); }catch(e){ status='offline'; pill(); return; }
    auth.onAuthStateChanged(function(user){ if(user){ uid=user.uid;
      db.collection('players').doc(uid).get().then(function(d){ if(d.exists){ applyCloud(d.data()); } else { cloudSave(); } status='synced'; pill(); })
        .catch(function(){ status='offline'; pill(); }); } });
    auth.signInAnonymously().catch(function(e){ status=(e&&(''+(e.code||'')).indexOf('operation-not-allowed')>=0)?'noauth':'offline'; pill();
      console.warn('anon sign-in failed:', e&&e.code, '- enable Anonymous auth in Firebase console'); }); }
  if(document.readyState!=='loading') init(); else document.addEventListener('DOMContentLoaded', init);
})();
