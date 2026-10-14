import { app, BrowserWindow, dialog, ipcMain, Menu } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import { watch as watchFs } from "node:fs";
import http from "node:http";
import os from "node:os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let mainWindow;
let lastImportedPath = null;
let saveWatcher = null;
let saveWatchTimer = null;
let mobileServer = null;
const MOBILE_PORT = 47827;

function stopSaveWatcher() {
  if (saveWatcher) { try { saveWatcher.close(); } catch {} }
  saveWatcher = null;
  if (saveWatchTimer) clearTimeout(saveWatchTimer);
  saveWatchTimer = null;
}

function watchImportedSave(filePath) {
  stopSaveWatcher();
  if (!filePath) return;
  const dir = path.dirname(filePath);
  const target = path.basename(filePath);
  try {
    saveWatcher = watchFs(dir, (eventType, changedName) => {
      if (!changedName || String(changedName) !== target) return;
      if (saveWatchTimer) clearTimeout(saveWatchTimer);
      saveWatchTimer = setTimeout(() => {
        saveWatchTimer = null;
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("franchise-save-changed", { filePath });
      }, 700);
    });
    saveWatcher.on("error", () => stopSaveWatcher());
  } catch {}
}


function mobileSnapshot() {
  if (!mainWindow || mainWindow.isDestroyed()) return Promise.resolve({ok:false,error:"Desktop window is not available."});
  const script = `(() => { try {
    if (typeof window.__m27MobileSnapshot !== "function") return {ok:false,error:"Mobile bridge is not ready in the desktop window."};
    const value = window.__m27MobileSnapshot();
    return value && typeof value.then === "function" ? value.then(v => v || {ok:false,error:"Desktop state unavailable."}) : (value || {ok:false,error:"Desktop state unavailable."});
  } catch (e) { return {ok:false,error:e?.message||String(e)}; } })()`;
  return mainWindow.webContents.executeJavaScript(script, true).catch(e => ({ok:false,error:e?.message||String(e)}));
}
async function mobileCommand(action, payload={}) {
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error("Desktop app is not running.");
  const safe = JSON.stringify(payload).replace(/</g,"\\u003c");
  const script = `window.__m27MobileCommand ? window.__m27MobileCommand(${JSON.stringify(action)}, ${safe}) : {ok:false,error:"Mobile bridge unavailable"}`;
  return await mainWindow.webContents.executeJavaScript(script, true);
}
function mobileHtml() {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>M27 BOOK Mobile</title><style>
:root{--bg:#080c11;--panel:#10161e;--panel2:#0c1218;--line:#263340;--text:#eef4f7;--muted:#8e9aa5;--accent:#35d07f;--danger:#ff5964;--gold:#f0c75e}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px system-ui,-apple-system,Segoe UI,sans-serif}header{position:sticky;top:0;z-index:10;background:rgba(8,12,17,.97);border-bottom:1px solid var(--line);padding:14px 16px}h1{font-size:21px;margin:0;font-weight:900}h1 span{color:var(--accent)}.sub{color:var(--muted);font-size:12px;margin-top:4px}.nav{display:flex;gap:7px;overflow:auto;padding:10px 12px;border-bottom:1px solid var(--line);background:#0d131a;position:sticky;top:65px;z-index:9}.nav button{white-space:nowrap;border:1px solid var(--line);background:#0d131a;color:var(--text);border-radius:9px;padding:8px 12px;font-weight:700}.nav button.active{border-color:var(--accent);color:var(--accent);background:#0d1915}main{padding:12px 12px 100px;max-width:760px;margin:auto}.card{background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:14px;margin-bottom:11px;box-shadow:0 4px 14px rgba(0,0,0,.12)}.row{display:flex;justify-content:space-between;gap:10px;align-items:center}.muted{color:var(--muted)}.money{font-size:24px;font-weight:900}.market{display:flex;justify-content:space-between;align-items:center;width:100%;margin-top:8px;padding:12px;border:1px solid var(--line);background:var(--panel2);color:var(--text);border-radius:10px;text-align:left;gap:12px}.market:active{transform:scale(.99)}.market b{color:var(--accent);white-space:nowrap}.market .left{min-width:0}.market .label{font-weight:800}.market .meta{font-size:11px;color:var(--muted);margin-top:2px}.primary{background:var(--accent)!important;color:#07120b!important;border:0!important;font-weight:900}.danger{color:var(--danger)}button{cursor:pointer}input{width:100%;padding:11px;border-radius:9px;border:1px solid var(--line);background:#0b1117;color:var(--text);margin-top:6px;font-size:16px}.empty{text-align:center;color:var(--muted);padding:30px 10px}.toast{position:fixed;left:12px;right:12px;bottom:12px;z-index:50;background:#151d26;border:1px solid var(--line);padding:12px;border-radius:10px;display:none}.bet{position:relative;padding:12px 0;border-bottom:1px solid var(--line)}.bet:last-child{border-bottom:0}.betname{font-weight:850;font-size:14px;line-height:1.25}.betmeta{font-size:11px;color:var(--muted);margin-top:4px}.odds{font-weight:900;color:var(--accent);margin-top:5px}.remove{position:absolute;right:0;top:10px;border:1px solid var(--line);background:#0b1117;color:#b7c1c8;border-radius:7px;width:30px;height:30px;font-size:18px}.slip-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:12px}.stat{background:var(--panel2);border:1px solid var(--line);border-radius:9px;padding:9px}.stat small{display:block;color:var(--muted);font-size:10px}.stat b{display:block;margin-top:3px}.section-title{font-size:16px;font-weight:900;margin-bottom:4px}.game-title{font-size:15px;font-weight:900}.tag{display:inline-block;font-size:10px;border:1px solid var(--line);border-radius:999px;padding:3px 7px;color:var(--muted)}.market-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.market-grid .market{margin-top:0}.prop-card .prop-head{padding-right:2px}.prop-line{font-size:12px;color:var(--muted)}.phasebar{display:flex;gap:7px;overflow:auto;padding:0 0 9px;margin-top:10px}.phasebar button{white-space:nowrap;border:1px solid var(--line);background:var(--panel2);color:var(--text);border-radius:9px;padding:8px 11px;font-weight:800}.phasebar button.active{border-color:var(--accent);background:#0d1915;color:var(--accent)}.weekbar{display:flex;align-items:center;gap:8px;margin-bottom:10px}.weekbar select{flex:1;min-width:0;margin:0;padding:10px;border-radius:9px;border:1px solid var(--line);background:#0b1117;color:var(--text);font-size:15px}.game-head{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:10px}.game-status{font-size:10px;font-weight:900;border:1px solid var(--line);border-radius:999px;padding:4px 7px;color:var(--muted)}.game-status.upcoming{color:var(--accent);border-color:#245f42}.scoreline{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid var(--line);font-weight:800}.scoreline:first-of-type{border-top:0}.score{font-size:18px}.filter-note{font-size:11px;color:var(--muted);margin-top:4px}.game-card{padding:14px}.game-teams{display:grid;grid-template-columns:minmax(0,1fr) 34px minmax(0,1fr);align-items:start;gap:8px;margin:10px 0 14px}.team-side{min-width:0;text-align:center!important;display:flex;flex-direction:column;align-items:center;justify-content:flex-start}.team-side.home{text-align:center!important}.team-name{font-size:16px;font-weight:900;line-height:1.15;width:100%;text-align:center}.team-logo{width:54px;height:54px;object-fit:contain;display:block;margin:0 auto 7px}.team-side .logo-fallback{width:54px;height:54px;margin:0 auto 7px}.game-teams .at{align-self:center;margin-top:29px}.team-role{font-size:10px;color:var(--danger);font-weight:900;letter-spacing:.04em;margin-bottom:3px}.at{color:var(--muted);font-weight:900}.market-grid{margin-top:4px}.market{min-height:58px}.market .label{font-size:13px}.market .meta{line-height:1.2}.bet-card{padding:14px}.bet-status{font-size:10px;font-weight:900;border:1px solid var(--line);border-radius:999px;padding:4px 8px}.bet-status.won{color:var(--accent);border-color:#245f42}.bet-status.lost{color:var(--danger);border-color:#633039}.bet-status.pending{color:var(--gold);border-color:#675725}.bet-legs{margin-top:10px}.bet-leg{padding:9px 0;border-top:1px solid var(--line)}.bet-leg:first-child{border-top:0}.bet-leg b{display:block;line-height:1.2}.bet-leg .meta{font-size:11px;color:var(--muted);margin-top:3px}.bet-leg .odds{margin-top:3px}.bet-tracker{margin-top:9px;padding:9px 10px;background:#0b1118;border:1px solid var(--line);border-radius:8px}.tracker-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:7px}.tracker-label{font-size:9px;font-weight:900;letter-spacing:.08em;color:var(--muted);text-transform:uppercase}.tracker-status{font-size:9px;font-weight:900}.tracker-status.won{color:var(--accent)}.tracker-status.lost{color:var(--danger)}.tracker-status.pending{color:#c0cad5}.tracker-status.void{color:#f0c75e}.tracker-visual{position:relative;height:18px;margin:2px 1px 0}.tracker-track{position:absolute;left:0;right:0;top:7px;height:5px;background:#28323e;border-radius:6px;overflow:visible}.tracker-target-zone{position:absolute;top:0;height:100%;border-radius:6px;opacity:.45;background:#1f9c5d}.tracker-progress{position:absolute;left:0;top:0;height:100%;border-radius:6px;opacity:.9}.tracker-progress.won{background:var(--accent)}.tracker-progress.lost{background:var(--danger)}.tracker-progress.pending{background:#687585}.tracker-progress.void{background:#f0c75e}.tracker-line-marker{position:absolute;top:-4px;width:2px;height:13px;background:#d7dee6;border-radius:2px;box-shadow:0 0 0 1px #0b1118}.tracker-actual-marker{position:absolute;top:-4px;width:13px;height:13px;transform:translateX(-50%);border-radius:50%;background:#b7c0ca;border:2px solid #0b1118;box-shadow:0 0 0 1px currentColor}.tracker-actual-marker.won{color:var(--accent);background:var(--accent)}.tracker-actual-marker.lost{color:var(--danger);background:var(--danger)}.tracker-actual-marker.pending{color:#687585}.tracker-actual-marker.void{color:#f0c75e;background:#f0c75e}.tracker-scale{position:relative;height:12px;font-size:8px;color:var(--muted);margin-top:1px}.tracker-scale .line-label,.tracker-scale .actual-label{position:absolute;transform:translateX(-50%);font-weight:900}.tracker-scale .line-label{color:#d7dee6}.tracker-scale .actual-label.won{color:var(--accent)}.tracker-scale .actual-label.lost{color:var(--danger)}.tracker-scale .actual-label.void{color:#f0c75e}.tracker-summary{margin-top:9px;padding:9px 10px;background:#0b1118;border:1px solid var(--line);border-radius:8px}.tracker-segments{display:flex;gap:5px;margin:7px 0 2px;width:100%}.tracker-segment{height:5px;flex:1;border-radius:5px;background:#293441}.tracker-segment.won{background:var(--accent)}.tracker-segment.lost{background:var(--danger)}.tracker-segment.pending{background:#4b5867}.tracker-segment.void{background:#f0c75e}.tracker-summary-text{font-size:9px;color:var(--muted)}.tracker-summary-text b{color:var(--text)}.active-parlay-toggle{margin-top:10px;border-top:1px solid var(--line);padding-top:9px}.active-parlay-toggle summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:8px;font-size:10px;font-weight:900;color:var(--accent)}.active-parlay-toggle summary::-webkit-details-marker{display:none}.active-parlay-legs{margin-top:7px}.collect-btn{margin-top:10px;background:var(--accent)!important;color:#07120b!important;border:0!important;font-weight:900;text-align:center;justify-content:center}.history-pill{font-size:10px;border:1px solid var(--line);border-radius:999px;padding:4px 7px;color:var(--muted)}.slip-bar{position:sticky;bottom:8px;z-index:8;margin:8px 0}.slip-bar button{width:100%;border:1px solid #245f42;background:#0d1915;color:var(--accent);border-radius:11px;padding:11px;font-weight:900}.slip-modal{position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.72);display:flex;align-items:flex-end;justify-content:center;padding:10px}.slip-modal-panel{width:100%;max-width:760px;max-height:88vh;overflow:auto;background:var(--bg);border:1px solid var(--line);border-radius:16px 16px 8px 8px;box-shadow:0 -12px 40px rgba(0,0,0,.45)}.slip-modal-head{position:sticky;top:0;z-index:2;background:rgba(8,12,17,.98);border-bottom:1px solid var(--line);padding:12px 14px;display:flex;justify-content:space-between;align-items:center}.slip-modal-head b{font-size:15px}.slip-close{border:1px solid var(--line);background:#0b1117;color:var(--text);border-radius:8px;width:34px;height:34px;font-size:20px;line-height:1}.slip-modal-body{padding:10px 10px 18px}.slip-modal-body .card{margin-bottom:0}.section-kicker{font-size:10px;color:var(--accent);font-weight:900;letter-spacing:.08em;margin-bottom:5px}.social-tabs{display:flex;gap:7px;overflow:auto;margin:10px 0 12px;padding-bottom:2px}.social-tabs button{white-space:nowrap;border:1px solid var(--line);background:var(--panel2);color:var(--text);border-radius:9px;padding:8px 11px;font-weight:800;font-size:11px}.social-tabs button.active{border-color:var(--accent);background:#0d1915;color:var(--accent)}.social-card{background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:14px;margin-bottom:11px}.social-card h3{font-size:15px;margin:4px 0 7px}.social-kicker{font-size:10px;color:var(--accent);font-weight:900;letter-spacing:.08em}.social-meta{font-size:10px;color:var(--muted);line-height:1.45}.social-pick{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:11px;margin-top:8px}.social-pick-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.social-pick-name{font-weight:900;font-size:14px}.social-confidence{font-size:9px;color:var(--accent);font-weight:900;white-space:nowrap}.social-reason{font-size:11px;color:var(--muted);line-height:1.45;margin-top:8px}.social-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.social-action{border:1px solid var(--line);background:#0b1117;color:var(--text);border-radius:8px;padding:8px 10px;font-weight:800;font-size:10px}.social-action.primary{background:var(--accent)!important;color:#07120b!important}.social-leg{display:flex;justify-content:space-between;gap:8px;padding:7px 0;border-top:1px solid var(--line);font-size:11px}.social-leg:first-child{border-top:0}.social-post{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:11px;margin-top:8px}.social-author{font-size:9px;color:var(--accent);font-weight:900;letter-spacing:.05em}.social-post-text{font-size:12px;font-weight:800;line-height:1.45;margin-top:7px}.social-comment{font-size:10px;color:var(--muted);line-height:1.45;margin-top:8px;padding-top:8px;border-top:1px solid var(--line)}.social-filter-row{display:flex;gap:6px;overflow:auto;margin:10px 0 4px}.social-filter{white-space:nowrap;border:1px solid var(--line);background:var(--panel2);color:var(--muted);border-radius:999px;padding:6px 9px;font-size:9px;font-weight:900}.social-filter.active{color:var(--accent);border-color:var(--accent)}.social-table{width:100%;border-collapse:collapse;font-size:10px}.social-table td{padding:7px 4px;border-bottom:1px solid var(--line);vertical-align:top}.social-table tr:last-child td{border-bottom:0}.social-badge{font-size:8px;color:var(--gold);font-weight:900}.social-news{display:grid;gap:7px;margin-bottom:10px}.social-news-item{background:#0b1117;border:1px solid var(--line);border-radius:9px;padding:9px}.social-news-item b{display:block;font-size:11px}.social-news-item span{display:block;color:var(--muted);font-size:10px;line-height:1.4;margin-top:4px}.social-disclaimer{font-size:9px;color:var(--muted);line-height:1.45;margin-top:10px;padding-top:9px;border-top:1px solid var(--line)}.team-logo.small{width:28px;height:28px;margin:0}.logo-fallback{width:54px;height:54px;border-radius:50%;background:#1c2733;display:grid;place-items:center;margin:0 auto 7px;font-size:10px;font-weight:900}.game-teams .team-side{text-align:center!important}.game-teams .team-side.home{text-align:center!important}
.prop-game-mobile{background:var(--panel);border:1px solid var(--line);border-radius:13px;margin-bottom:11px;overflow:hidden}.prop-game-mobile summary{list-style:none;cursor:pointer;padding:13px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px}.prop-game-mobile summary::-webkit-details-marker{display:none}.prop-game-summary{display:flex;align-items:center;gap:10px;min-width:0}.prop-game-logos{display:flex;align-items:center;gap:2px;flex:0 0 auto}.prop-game-logos .team-logo.small{width:30px;height:30px}.prop-game-summary-text{min-width:0}.prop-game-summary-text b{display:block;font-size:14px;line-height:1.2}.prop-game-summary-text span{display:block;color:var(--muted);font-size:10px;margin-top:3px}.prop-game-toggle{font-size:9px;color:var(--accent);font-weight:900;white-space:nowrap}.prop-game-body{padding:0 10px 10px}.prop-depth-section{border-top:1px solid var(--line);padding-top:9px;margin-top:3px}.prop-depth-title{font-size:10px;color:var(--accent);font-weight:900;letter-spacing:.07em;padding:0 4px 7px}.prop-player-mobile{background:var(--panel2);border:1px solid var(--line);border-radius:11px;padding:11px;margin-bottom:8px}.prop-player-mobile-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.prop-player-identity{display:flex;align-items:center;gap:8px;min-width:0}.prop-player-identity .team-logo.small{width:30px;height:30px;flex:0 0 30px}.prop-player-mobile-name{font-weight:900;font-size:14px;line-height:1.15}.prop-role{display:inline-block;color:var(--accent);font-size:9px;border:1px solid #245f42;border-radius:999px;padding:2px 5px;margin-left:3px;vertical-align:1px}.prop-player-mobile-info{color:var(--muted);font-size:10px;margin-top:3px}.prop-mobile-markets{margin-top:9px}.prop-mobile-market{border-top:1px solid var(--line);padding-top:8px;margin-top:8px}.prop-mobile-market:first-child{border-top:0;padding-top:0;margin-top:0}.prop-mobile-market-title{font-size:10px;font-weight:900;margin-bottom:5px}.prop-mobile-market-title span{color:var(--muted);font-weight:700;margin-left:4px}.prop-mobile-market .market{margin-top:5px;min-height:48px;padding:9px 10px}.prop-mobile-market .market .label{font-size:12px}.prop-mobile-market .market .meta{font-size:10px}.prop-mobile-market .market b{font-size:12px}@media(max-width:430px){.market-grid{grid-template-columns:1fr}.slip-summary{grid-template-columns:1fr 1fr}.slip-summary .stat:last-child{grid-column:1/-1}}
</style></head><body><header><h1>M27 <span>BOOK</span></h1><div class="sub" id="conn">Connecting to desktop…</div></header><nav class="nav"><button data-page="home" class="active">Home</button><button data-page="games">Games</button><button data-page="props">Props</button><button data-page="bets">Bets</button><button data-page="social">Social</button><button data-page="profile">Profile</button></nav><main id="app"></main><div class="toast" id="toast"></div>
<script>
let state=null,page='home',gamePhase=null,gameWeek=null,weekPickerOpen=false,propExpandedGames=new Set(),propCollapsedGames=new Set(),mobileOpenParlays=new Set(),socialTab='ai',socialFilter='ALL',slipOpen=false,slipScrollTop=0;
const esc=s=>String(s??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
const teamLogoUrls={LAR:'https://raw.githubusercontent.com/shoenot/NFL-Team-Logos-Transparent-Squared/refs/heads/main/logos/LA.png',AZ:'https://raw.githubusercontent.com/shoenot/NFL-Team-Logos-Transparent-Squared/refs/heads/main/logos/ARI.png',ARI:'https://raw.githubusercontent.com/shoenot/NFL-Team-Logos-Transparent-Squared/refs/heads/main/logos/ARI.png',ATL:'https://raw.githubusercontent.com/shoenot/NFL-Team-Logos-Transparent-Squared/refs/heads/main/logos/ATL.png',BAL:'https://raw.githubusercontent.com/shoenot/NFL-Team-Logos-Transparent-Squared/refs/heads/main/logos/BAL.png',BUF:'https://raw.githubusercontent.com/shoenot/NFL-Team-Logos-Transparent-Squared/refs/heads/main/logos/BUF.png',CAR:'https://raw.githubusercontent.com/shoenot/NFL-Team-Logos-Transparent-Squared/refs/heads/main/logos/CAR.png',CHI:'https://raw.githubusercontent.com/shoenot/NFL-Team-Logos-Transparent-Squared/refs/heads/main/logos/CHI.png',CIN:'https://raw.githubusercontent.com/shoenot/NFL-Team-Logos-Transparent-Squared/refs/heads/main/logos/CIN.png',CLE:'https://raw.githubusercontent.com/shoenot/NFL-Team-Logos-Transparent-Squared/refs/heads/main/logos/CLE.png',DAL:'https://raw.githubusercontent.com/shoenot/NFL-Team-Logos-Transparent-Squared/refs/heads/main/logos/DAL.png',DEN:'https://raw.githubusercontent.com/shoenot/NFL-Team-Logos-Transparent-Squared/refs/heads/main/logos/DEN.png',DET:'https://raw.githubusercontent.com/shoenot/NFL-Team-Logos-Transparent-Squared/refs/heads/main/logos/DET.png',GB:'https://raw.githubusercontent.com/shoenot/NFL-Team-Logos-Transparent-Squared/refs/heads/main/logos/GB.png',HOU:'https://raw.githubusercontent.com/shoenot/NFL-Team-Logos-Transparent-Squared/refs/heads/main/logos/HOU.png',IND:'https://raw.githubusercontent.com/shoenot/NFL-Team-Logos-Transparent-Squared/refs/heads/main/logos/IND.png',JAX:'https://raw.githubusercontent.com/shoenot/NFL-Team-Logos-Transparent-Squared/refs/heads/main/logos/JAX.png',KC:'https://raw.githubusercontent.com/shoenot/NFL-Team-Logos-Transparent-Squared/refs/heads/main/logos/KC.png',LAC:'https://raw.githubusercontent.com/shoenot/NFL-Team-Logos-Transparent-Squared/refs/heads/main/logos/LAC.png',LV:'https://raw.githubusercontent.com/shoenot/NFL-Team-Logos-Transparent-Squared/refs/heads/main/logos/LV.png',MIA:'https://raw.githubusercontent.com/shoenot/NFL-Team-Logos-Transparent-Squared/refs/heads/main/logos/MIA.png',MIN:'https://raw.githubusercontent.com/shoenot/NFL-Team-Logos-Transparent-Squared/refs/heads/main/logos/MIN.png',NE:'https://raw.githubusercontent.com/shoenot/NFL-Team-Logos-Transparent-Squared/refs/heads/main/logos/NE.png',NO:'https://raw.githubusercontent.com/shoenot/NFL-Team-Logos-Transparent-Squared/refs/heads/main/logos/NO.png',NYG:'https://raw.githubusercontent.com/shoenot/NFL-Team-Logos-Transparent-Squared/refs/heads/main/logos/NYG.png',NYJ:'https://raw.githubusercontent.com/shoenot/NFL-Team-Logos-Transparent-Squared/refs/heads/main/logos/NYJ.png',PHI:'https://raw.githubusercontent.com/shoenot/NFL-Team-Logos-Transparent-Squared/refs/heads/main/logos/PHI.png',PIT:'https://raw.githubusercontent.com/shoenot/NFL-Team-Logos-Transparent-Squared/refs/heads/main/logos/PIT.png',SEA:'https://raw.githubusercontent.com/shoenot/NFL-Team-Logos-Transparent-Squared/refs/heads/main/logos/SEA.png',SF:'https://raw.githubusercontent.com/shoenot/NFL-Team-Logos-Transparent-Squared/refs/heads/main/logos/SF.png',TB:'https://raw.githubusercontent.com/shoenot/NFL-Team-Logos-Transparent-Squared/refs/heads/main/logos/TB.png',TEN:'https://raw.githubusercontent.com/shoenot/NFL-Team-Logos-Transparent-Squared/refs/heads/main/logos/TEN.png',WAS:'https://raw.githubusercontent.com/shoenot/NFL-Team-Logos-Transparent-Squared/refs/heads/main/logos/WAS.png'};
const teamAb={Rams:'LAR','Los Angeles Rams':'LAR','LA Rams':'LAR',Cardinals:'ARI','Arizona Cardinals':'ARI','Falcons':'ATL','Atlanta Falcons':'ATL','Ravens':'BAL','Baltimore Ravens':'BAL','Bills':'BUF','Buffalo Bills':'BUF','Panthers':'CAR','Carolina Panthers':'CAR','Bears':'CHI','Chicago Bears':'CHI','Bengals':'CIN','Cincinnati Bengals':'CIN','Browns':'CLE','Cleveland Browns':'CLE','Cowboys':'DAL','Dallas Cowboys':'DAL','Broncos':'DEN','Denver Broncos':'DEN','Lions':'DET','Detroit Lions':'DET','Packers':'GB','Green Bay Packers':'GB','Texans':'HOU','Houston Texans':'HOU','Colts':'IND','Indianapolis Colts':'IND','Jaguars':'JAX','Jacksonville Jaguars':'JAX','Chiefs':'KC','Kansas City Chiefs':'KC','Chargers':'LAC','Los Angeles Chargers':'LAC','Raiders':'LV','Las Vegas Raiders':'LV','Dolphins':'MIA','Miami Dolphins':'MIA','Vikings':'MIN','Minnesota Vikings':'MIN','Patriots':'NE','New England Patriots':'NE','Saints':'NO','New Orleans Saints':'NO','Giants':'NYG','New York Giants':'NYG','Jets':'NYJ','New York Jets':'NYJ','Eagles':'PHI','Philadelphia Eagles':'PHI','Steelers':'PIT','Pittsburgh Steelers':'PIT','Seahawks':'SEA','Seattle Seahawks':'SEA','49ers':'SF','San Francisco 49ers':'SF','Buccaneers':'TB','Tampa Bay Buccaneers':'TB','Titans':'TEN','Tennessee Titans':'TEN','Commanders':'WAS','Washington Commanders':'WAS'};
function logo(name,small=false){const n=String(name||'').trim();const ab=teamAb[n]||n.toUpperCase();const url=teamLogoUrls[ab];const cls=small?'team-logo small':'team-logo';if(!url)return '<span class="logo-fallback">'+esc(n.slice(0,3).toUpperCase())+'</span>';return '<img class="'+cls+'" src="'+url+'" alt="'+esc(n)+'" title="'+esc(n)+'" loading="lazy" onerror="this.style.display=&quot;none&quot;;this.nextElementSibling.style.display=&quot;grid&quot;"> <span class="logo-fallback" style="display:none">'+esc(n.slice(0,3).toUpperCase())+'</span>';}
async function api(path,opts={}){const r=await fetch(path,{headers:{'Content-Type':'application/json'},...opts});return r.json()}
function toast(x){const e=document.getElementById('toast');e.textContent=x;e.style.display='block';clearTimeout(window.__toast);window.__toast=setTimeout(()=>e.style.display='none',1800)}
async function refresh(){try{const next=await api('/api/state');state=next;document.getElementById('conn').textContent=state.ok?'🟢 Connected • '+(state.profile?.name||'PROFILE'):'Desktop not ready';if(!((page==='games'||page==='props')&&weekPickerOpen)) render()}catch(e){document.getElementById('conn').textContent='🔴 Disconnected'}}
async function addSel(x){const r=await api('/api/action',{method:'POST',body:JSON.stringify({action:'addSelection',payload:x})});toast(r.ok?'Added to Bet Slip':r.error||'Unable to add');if(r.ok) await refresh()}
async function act(action,payload={}){const r=await api('/api/action',{method:'POST',body:JSON.stringify({action,payload})});toast(r.ok?(r.message||'Done'):r.error||'Unable to complete');await refresh()}
function btnAdd(x){const encoded=encodeURIComponent(JSON.stringify(x));return '<button class="market add-selection" data-add="'+encoded+'"><span class="left"><span class="label">'+esc(x.label)+'</span><span class="meta">'+esc(x.meta||'Add to shared bet slip')+'</span></span><b>'+esc(x.display)+'</b></button>'}
function renderHome(){return '<div class="card"><div class="muted">FRANCHISE</div><b>'+esc(state.franchiseName||state.currentFranchise||'No franchise')+'</b><div class="sub">Week '+esc(state.week||'—')+'</div></div><div class="card"><div class="muted">BANKROLL</div><div class="money">'+esc(state.balance||'$0.00')+'</div></div>'+renderSlip(true)}
function renderGames(){
 const phases=(state?.phaseWeeks||{});
 const phaseNames={preseason:'Preseason',regular:'Regular Season',playoffs:'Playoffs',superbowl:'Super Bowl'};
 const available=['preseason','regular','playoffs','superbowl'].filter(k=>(phases[k]||[]).length);
 if(!gamePhase||!(phases[gamePhase]||[]).length) gamePhase=state?.selectedPhase&&available.includes(state.selectedPhase)?state.selectedPhase:(available.includes('regular')?'regular':available[0]||'regular');
 const weeks=(phases[gamePhase]||[]).map(Number).filter(Number.isFinite);
 if(gameWeek==null||!weeks.includes(Number(gameWeek))) gameWeek=state?.selectedWeek&&weeks.includes(Number(state.selectedWeek))?Number(state.selectedWeek):(weeks[0]??1);
 const filtered=(state.games||[]).filter(g=>String(g.phase||'regular')===gamePhase&&Number(g.phaseWeek)===Number(gameWeek));
 const controls='<div class="card"><div class="section-kicker">SPORTSBOOK</div><div class="section-title">Games & Odds</div><div class="muted">Choose a phase and week just like the desktop sportsbook.</div><div class="phasebar">'+available.map(k=>'<button class="phase-btn '+(k===gamePhase?'active':'')+'" data-phase="'+k+'">'+phaseNames[k]+'</button>').join('')+'</div><div class="weekbar"><b>Week</b><select id="mobileWeek">'+weeks.map(w=>'<option value="'+w+'" '+(Number(w)===Number(gameWeek)?'selected':'')+'>'+w+'</option>').join('')+'</select></div><div class="filter-note">'+phaseNames[gamePhase]+' • Week '+esc(gameWeek)+' • '+filtered.length+' game'+(filtered.length===1?'':'s')+'</div></div>';
 if(!filtered.length) return controls+renderSlipBar()+'<div class="empty">No games found for this phase and week.</div>';
 const cards=filtered.map(g=>{
   const l=g.played?null:{awayML:g.awayML||-110,homeML:g.homeML||-110,spread:Number(g.spread),awaySpread:g.awaySpread||-110,homeSpread:g.homeSpread||-110,total:g.total,over:g.over||-110,under:g.under||-110};
   const markets=g.played?'':('<div class="market-grid">'+btnAdd({label:g.awayName+' ML',display:g.awayML||'-110',odds:g.awayML||-110,gameId:g.gameId,gameIndex:g.index,week:g.week,phaseWeek:g.phaseWeek,away:g.awayName,home:g.homeName,kind:'mlA',meta:'Moneyline • Away'})+btnAdd({label:g.homeName+' ML',display:g.homeML||'-110',odds:g.homeML||-110,gameId:g.gameId,gameIndex:g.index,week:g.week,phaseWeek:g.phaseWeek,away:g.awayName,home:g.homeName,kind:'mlH',meta:'Moneyline • Home'})+btnAdd({label:g.awayName+' '+(Number(g.spread)>0?'+':'')+g.spread,display:(Number(g.spread)>0?'+':'')+g.spread+' '+g.awaySpread,odds:g.awaySpread,gameId:g.gameId,gameIndex:g.index,week:g.week,phaseWeek:g.phaseWeek,away:g.awayName,home:g.homeName,kind:'sprA',meta:'Spread • Away'})+btnAdd({label:g.homeName+' '+(Number(-g.spread)>0?'+':'')+(-g.spread),display:(Number(-g.spread)>0?'+':'')+(-g.spread)+' '+g.homeSpread,odds:g.homeSpread,gameId:g.gameId,gameIndex:g.index,week:g.week,phaseWeek:g.phaseWeek,away:g.awayName,home:g.homeName,kind:'sprH',meta:'Spread • Home'})+btnAdd({label:'Over '+g.total,display:'O '+g.total+' '+g.over,odds:g.over,gameId:g.gameId,gameIndex:g.index,week:g.week,phaseWeek:g.phaseWeek,away:g.awayName,home:g.homeName,kind:'over',total:g.total,meta:'Game total • Over'})+btnAdd({label:'Under '+g.total,display:'U '+g.total+' '+g.under,odds:g.under,gameId:g.gameId,gameIndex:g.index,week:g.week,phaseWeek:g.phaseWeek,away:g.awayName,home:g.homeName,kind:'under',total:g.total,meta:'Game total • Under'})+'</div>');
   const status=g.played?'FINAL':'UPCOMING';
   const time=g.played?'Final':((g.day||'')+' '+(g.time||''));
   const scores=g.played?('<div class="scoreline"><span>'+esc(g.awayName)+'</span><span class="score">'+esc(g.awayScore??0)+'</span></div><div class="scoreline"><span>'+esc(g.homeName)+'</span><span class="score">'+esc(g.homeScore??0)+'</span></div>'):'';
   return '<div class="card game-card"><div class="game-head"><div><div class="tag">'+esc(g.phaseLabel||phaseNames[gamePhase])+' • WEEK '+esc(g.phaseWeek)+'</div><div class="muted" style="margin-top:5px">'+esc(time)+'</div></div><span class="game-status '+(g.played?'':'upcoming')+'">'+status+'</span></div><div class="game-teams"><div class="team-side"><div class="team-role">AWAY</div>'+logo(g.awayName)+'<div class="team-name">'+esc(g.awayName)+'</div></div><div class="at">@</div><div class="team-side home"><div class="team-role">HOME</div>'+logo(g.homeName)+'<div class="team-name">'+esc(g.homeName)+'</div></div></div>'+scores+(g.played?'<div class="filter-note">Betting markets closed for this completed game.</div>':markets)+'</div>';
 }).join('');
 return controls+cards+renderSlipBar();
}
function renderSlipBar(){const n=(state?.slip||[]).length;if(!n)return '';return '<div class="slip-bar"><button data-page-slip="home">BET SLIP • '+n+' '+(n===1?'SELECTION':'SELECTIONS')+' →</button></div>'}

function propPos(position){const p=String(position||'').toUpperCase();if(p==='HB'||p==='FB'||p==='RB')return 'RB';if(p==='WR')return 'WR';if(p==='TE')return 'TE';if(p==='QB')return 'QB';return 'OTHER'}
function propPosLabel(k){return k==='QB'?'QUARTERBACKS':k==='RB'?'RUNNING BACKS':k==='WR'?'WIDE RECEIVERS':k==='TE'?'TIGHT ENDS':'OTHER'}
function propDepthScore(p,markets){const pos=propPos(p.position);const pick=(...stats)=>{for(const stat of stats){const m=markets.find(x=>x.stat===stat);if(m)return Number(m.average??m.line??0)||0}return 0};if(pos==='QB')return pick('passYds','completions');if(pos==='RB')return pick('rushAtt','rushYds','receptions','recYds');return pick('recYds','receptions')}
function renderMobilePropMarket(m){const over=m.overOdds||-110,under=m.underOdds||-110;const base={gameId:m.gameId,gameIndex:m.gameIndex,week:m.week,phaseWeek:m.phaseWeek,away:m.away,home:m.home,line:m.line,playerId:m.playerId,propStat:m.stat};return '<div class="prop-mobile-market"><div class="prop-mobile-market-title">'+esc(m.label||m.stat)+' <span>AVG '+esc(m.average)+'</span></div>'+btnAdd({...base,label:m.name+' O '+m.line+' '+m.label,display:'O '+m.line+' '+over,odds:over,kind:'propOver',meta:'Over • '+m.label})+btnAdd({...base,label:m.name+' U '+m.line+' '+m.label,display:'U '+m.line+' '+under,odds:under,kind:'propUnder',meta:'Under • '+m.label})+'</div>'}
function renderMobilePropPlayer(p,pos){const markets=p.markets.slice().sort((a,b)=>{const order={passYds:1,passTD:2,completions:3,rushYds:4,rushAtt:5,recYds:6,receptions:7};return (order[a.stat]||99)-(order[b.stat]||99)});return '<article class="prop-player-mobile"><div class="prop-player-mobile-head"><div class="prop-player-identity">'+logo(p.team,true)+'<div><div class="prop-player-mobile-name">'+esc(p.name)+' <span class="prop-role">'+esc(p.role)+'</span></div><div class="prop-player-mobile-info">'+esc(p.team)+' • '+esc(p.roleText)+' • '+esc(markets[0]?.games||0)+' game sample</div></div></div><span class="tag">'+esc(p.side||pos)+'</span></div><div class="prop-mobile-markets">'+markets.map(renderMobilePropMarket).join('')+'</div></article>'}
function propViewControls(){
 const phases=(state?.phaseWeeks||{});
 const phaseNames={preseason:'Preseason',regular:'Regular Season',playoffs:'Playoffs',superbowl:'Super Bowl'};
 const available=['preseason','regular','playoffs','superbowl'].filter(k=>(phases[k]||[]).length);
 if(!gamePhase||!(phases[gamePhase]||[]).length) gamePhase=state?.selectedPhase&&available.includes(state.selectedPhase)?state.selectedPhase:(available.includes('regular')?'regular':available[0]||'regular');
 const weeks=(phases[gamePhase]||[]).map(Number).filter(Number.isFinite);
 if(gameWeek==null||!weeks.includes(Number(gameWeek))) gameWeek=state?.selectedWeek&&weeks.includes(Number(state.selectedWeek))?Number(state.selectedWeek):(weeks[0]??1);
 return '<div class="card"><div class="section-kicker">PLAYER PROPS</div><div class="section-title">Props from Franchise Data</div><div class="muted">Choose the same phase and week as the desktop sportsbook. Props are organized by matchup, then position and depth.</div><div class="phasebar">'+available.map(k=>'<button class="phase-btn '+(k===gamePhase?'active':'')+'" data-phase="'+k+'">'+phaseNames[k]+'</button>').join('')+'</div><div class="weekbar"><b>Week</b><select id="mobileWeek">'+weeks.map(w=>'<option value="'+w+'" '+(Number(w)===Number(gameWeek)?'selected':'')+'>'+w+'</option>').join('')+'</select></div><div class="filter-note">'+phaseNames[gamePhase]+' • Week '+esc(gameWeek)+'</div></div>';
}
function propPos(position){const p=String(position||'').toUpperCase();if(p==='HB'||p==='FB'||p==='RB')return 'RB';if(p==='WR')return 'WR';if(p==='TE')return 'TE';if(p==='QB')return 'QB';return 'OTHER'}
function propPosLabel(k){return k==='QB'?'QUARTERBACKS':k==='RB'?'RUNNING BACKS':k==='WR'?'WIDE RECEIVERS':k==='TE'?'TIGHT ENDS':'OTHER'}
function propDepthScore(p,markets){const pos=propPos(p.position);const pick=(...stats)=>{for(const stat of stats){const m=markets.find(x=>x.stat===stat);if(m)return Number(m.average??m.line??0)||0}return 0};if(pos==='QB')return pick('passYds','completions');if(pos==='RB')return pick('rushAtt','rushYds','receptions','recYds');return pick('recYds','receptions')}
function renderMobilePropMarket(m){const over=m.overOdds||-110,under=m.underOdds||-110;const base={gameId:m.gameId,gameIndex:m.gameIndex,week:m.week,phaseWeek:m.phaseWeek,phase:m.phase,away:m.away,home:m.home,line:m.line,playerId:m.playerId,propStat:m.stat};return '<div class="prop-mobile-market"><div class="prop-mobile-market-title">'+esc(m.label||m.stat)+' <span>AVG '+esc(m.average)+'</span></div>'+btnAdd({...base,label:m.name+' O '+m.line+' '+m.label,display:'O '+m.line+' '+over,odds:over,kind:'propOver',meta:'Over • '+m.label})+btnAdd({...base,label:m.name+' U '+m.line+' '+m.label,display:'U '+m.line+' '+under,odds:under,kind:'propUnder',meta:'Under • '+m.label})+'</div>'}
function renderMobilePropPlayer(p,pos){const markets=p.markets.slice().sort((a,b)=>{const order={passYds:1,passTD:2,completions:3,rushYds:4,rushAtt:5,recYds:6,receptions:7};return (order[a.stat]||99)-(order[b.stat]||99)});return '<article class="prop-player-mobile"><div class="prop-player-mobile-head"><div class="prop-player-identity">'+logo(p.team,true)+'<div><div class="prop-player-mobile-name">'+esc(p.name)+' <span class="prop-role">'+esc(p.role)+'</span></div><div class="prop-player-mobile-info">'+esc(p.team)+' • '+esc(p.roleText)+' • '+esc(markets[0]?.games||0)+' game sample</div></div></div><span class="tag">'+esc(p.side||pos)+'</span></div><div class="prop-mobile-markets">'+markets.map(renderMobilePropMarket).join('')+'</div></article>'}
function renderProps(){
 const controls=propViewControls();
 const selectedPhase=gamePhase||state.selectedPhase||'regular';
 const selectedWeek=Number(gameWeek??state.selectedWeek??1);
 const gamesById=new Map((state.games||[]).map(g=>[String(g.index),g]));
 const currentGames=(state.games||[]).filter(g=>String(g.phase||'regular')===String(selectedPhase)&&Number(g.phaseWeek)===selectedWeek);
 const ps=state.playerProps||[];
 const byGame=new Map();
 for(const p of ps){
  const g=gamesById.get(String(p.gameIndex));
  if(!g||String(g.phase||'regular')!==String(selectedPhase)||Number(g.phaseWeek)!==selectedWeek||g.played)continue;
  let group=byGame.get(String(g.index));
  if(!group){group={g,players:new Map()};byGame.set(String(g.index),group)}
  const pk=String(p.playerId);
  let player=group.players.get(pk);
  if(!player){player={playerId:p.playerId,name:p.name,position:p.position,team:p.teamName||'',side:p.teamName===g.homeName?'HOME':p.teamName===g.awayName?'AWAY':'',markets:[]};group.players.set(pk,player)}
  player.markets.push(p);
 }
 const order=['QB','RB','WR','TE'];
 const groups=[...byGame.values()].map(group=>{
  const players=[...group.players.values()].map(p=>{const pos=propPos(p.position);return {...p,pos,depthScore:propDepthScore(p,p.markets)}}).filter(p=>p.pos!=='OTHER');
  // Match the desktop sportsbook: depth is ranked independently by TEAM + POSITION.
  // The away team's QB list must never change the home team's QB1/QB2/QB3 labels.
  const depthGroups=new Map();
  for(const p of players){const teamKey=String(p.team||p.side||'').trim().toUpperCase();const key=teamKey+'|'+p.pos;const arr=depthGroups.get(key)||[];arr.push(p);depthGroups.set(key,arr)}
  for(const arr of depthGroups.values()){arr.sort((a,b)=>b.depthScore-a.depthScore);arr.forEach((p,i)=>{p.depthRank=i+1;p.role=p.pos+(i+1);p.roleText=i===0?'STARTER':i===1?'ROTATION':'DEPTH'})}
  const sections=new Map();
  for(const p of players){const arr=sections.get(p.pos)||[];arr.push(p);sections.set(p.pos,arr)}
  for(const arr of sections.values()){arr.sort((a,b)=>a.depthRank-b.depthRank)}
  return {...group,sections};
 }).filter(g=>g.sections.size);
 if(!groups.length){return controls+'<div class="card"><div class="empty">No player props are available for '+esc(phaseNamesForMobile(selectedPhase)+' Week '+selectedWeek)+'.</div><div class="muted" style="text-align:center">Choose another week or phase, or make sure the selected week has upcoming games.</div></div>'+renderSlipBar()}
 const cards=groups.map((group,gi)=>{
  const g=group.g;
  const sections=[...group.sections.entries()].sort((a,b)=>order.indexOf(a[0])-order.indexOf(b[0]));
  const total=[...group.sections.values()].reduce((n,a)=>n+a.length,0);
  const sectionHtml=sections.map(([pos,players])=>'<section class="prop-depth-section"><div class="prop-depth-title">'+propPosLabel(pos)+'</div>'+players.map(p=>renderMobilePropPlayer(p,pos)).join('')+'</section>').join('');
  const propGameKey=String(g.gameId||g.index)+':'+String(g.phase||selectedPhase)+':'+String(g.phaseWeek);
  const isOpen=propExpandedGames.has(propGameKey)||(gi===0&&!propCollapsedGames.has(propGameKey));
  return '<details class="prop-game-mobile" data-prop-game="'+esc(propGameKey)+'" '+(isOpen?'open':'')+'><summary><div class="prop-game-summary"><div class="prop-game-logos">'+logo(g.awayName,true)+logo(g.homeName,true)+'</div><div class="prop-game-summary-text"><b>'+esc(g.awayName)+' @ '+esc(g.homeName)+'</b><span>'+esc(g.phaseLabel||'Regular Season')+' • Week '+esc(g.phaseWeek)+' • '+total+' players with props</span></div></div><span class="prop-game-toggle">VIEW PROPS ▾</span></summary><div class="prop-game-body">'+sectionHtml+'</div></details>';
 }).join('');
 return controls+cards+renderSlipBar();
}
function phaseNamesForMobile(k){return ({preseason:'Preseason',regular:'Regular Season',playoffs:'Playoffs',superbowl:'Super Bowl'})[k]||'Regular Season'}

function mobileBetTrackerSummary(b){const t=b.mobileTracking||{};const states=t.states||[];if(!states.length)return '';const wins=states.filter(x=>x==='won').length,losses=states.filter(x=>x==='lost').length,voids=states.filter(x=>x==='void').length,pending=states.filter(x=>x==='pending').length;const cls={won:'won',lost:'lost',void:'void',pending:'pending'};return '<div class="tracker-summary"><div class="tracker-head"><span class="tracker-label">PARLAY TRACKER</span><span class="tracker-status '+(losses?'lost':pending?'pending':wins?'won':'void')+'">'+(losses?'MISSED':pending?'IN PROGRESS':wins?'HIT':'VOID')+'</span></div><div class="tracker-segments">'+states.map(x=>'<span class="tracker-segment '+(cls[x]||'pending')+'"></span>').join('')+'</div><div class="tracker-summary-text"><b>'+wins+'</b> hit • <b>'+losses+'</b> missed'+(voids?' • <b>'+voids+'</b> void':'')+(pending?' • <b>'+pending+'</b> pending':'')+'</div></div>';}
function mobileBetCard(b,active){
 const status=String(b.status||'pending').toLowerCase();
 const tracking=b.mobileTracking||{};const trackedLegs=(b.legs||[]).map((l,i)=>{const tr=tracking.legs?.[i]||{};const st=tr.status||tracking.states?.[i]||'pending';return '<div class="bet-leg"><div class="row"><b style="min-width:0">'+esc(l.label||'Selection')+'</b><span class="tracker-status '+esc(st)+'">'+(st==='won'?'HIT':st==='lost'?'MISSED':st==='void'?'VOID':'PENDING')+'</span></div><div class="meta">'+esc(l.meta||((l.kind||'').startsWith('prop')?'PLAYER PROP':(l.market||'GAME MARKET')))+'</div><div class="odds">'+esc(l.display||'')+'</div>'+(tr.trackerHtml||'')+'</div>'}).join('');
 const isParlay=(b.legs||[]).length>1;const parlayKey=String(b.id||((b.legs||[]).map(x=>x.key||x.label||'').join('|')));const legs=isParlay?'<details class="active-parlay-toggle" data-parlay-key="'+esc(parlayKey)+'" '+(mobileOpenParlays.has(parlayKey)?'open':'')+'><summary><span>SHOW '+b.legs.length+' LEGS</span><span>'+((tracking.states||[]).filter(x=>x==='won').length)+' hit • '+((tracking.states||[]).filter(x=>x==='lost').length)+' missed</span></summary><div class="active-parlay-legs">'+trackedLegs+'</div></details>':trackedLegs;
 const action=status==='won'&&!b.collectedAt?'<button class="market collect-btn" data-collect="'+esc(b.id)+'">COLLECT WINNINGS • $'+Number(b.payout||0).toFixed(2)+'</button>':'';
 const payout=status==='won'?'Payout':status==='cashed_out'?'Cash out':status==='lost'?'P/L':'Return';
 const value=status==='won'?Number(b.payout||0):status==='cashed_out'?Number(b.cashoutAmount||0):Number(b.profit||0);
 return '<div class="card bet-card"><div class="row"><div><span class="bet-status '+esc(status)+'">'+esc(status.toUpperCase())+'</span><div class="sub" style="margin-top:6px">'+(isParlay?b.legs.length+'-Leg Parlay':'Straight')+' • '+esc(b.americanOdds??'')+'</div></div><span class="history-pill">$'+Number(b.wager||0).toFixed(2)+' WAGER</span></div>'+mobileBetTrackerSummary(b)+'<div class="bet-legs">'+legs+'</div><div class="row" style="margin-top:10px"><span class="muted">'+esc(payout)+'</span><b>$'+value.toFixed(2)+'</b></div>'+action+'</div>';
}
function renderBets(){const active=state.activeBets||[];const hist=state.recentHistory||[];return '<div class="card"><div class="section-kicker">BET CENTER</div><div class="section-title">Active Bets</div><div class="muted">Live from your desktop sportsbook. Winning wagers remain here until collected.</div></div>'+(active.length?active.map(b=>mobileBetCard(b,true)).join(''):'<div class="empty">No active bets.</div>')+'<div class="card" style="margin-top:18px"><div class="section-kicker">SETTLED</div><div class="section-title">Bet History</div><div class="muted">Recently settled wagers from this franchise.</div></div>'+(hist.length?hist.map(b=>mobileBetCard(b,false)).join(''):'<div class="empty">No settled bets yet.</div>')+renderSlipBar()}
function socialMarkets(){
 const games=new Map((state?.games||[]).map(g=>[String(g.index),g]));
 const out=[];
 for(const m of (state?.playerProps||[])){
  const g=games.get(String(m.gameIndex)); if(!g) continue;
  const avg=Number(m.average),line=Number(m.line); if(!Number.isFinite(line)) continue;
  const gap=Number.isFinite(avg)?Math.abs(avg-line):0;
  const pct=Math.max(52,Math.min(94,Math.round(58+gap*6)));
  const over=(Number.isFinite(avg)?avg>=line:true);
  const odds=over?(Number(m.overOdds)||-110):(Number(m.underOdds)||-110);
  const selection={gameId:m.gameId,gameIndex:m.gameIndex,week:m.week,phaseWeek:m.phaseWeek,away:m.away,home:m.home,line:m.line,playerId:m.playerId,propStat:m.stat,label:m.name+' '+(over?'O':'U')+' '+m.line+' '+(m.label||m.stat),display:(over?'O ':'U ')+m.line+' '+odds,odds,kind:over?'propOver':'propUnder',meta:(over?'Over • ':'Under • ')+(m.label||m.stat)};
  out.push({m,g,over,odds,pct,avg,line,gap,selection,label:(over?'Over ':'Under ')+line+' '+(m.label||m.stat),player:m.name,team:m.teamName||'',position:m.position||'PLAYER'});
 }
 return out.sort((a,b)=>(b.pct-a.pct)||(b.gap-a.gap));
}
function socialOdds(legs){let dec=1;for(const x of legs){const o=Number(x.odds)||-110;dec*=o>0?(1+o/100):(1+100/Math.abs(o));}return dec>=2?Math.round((dec-1)*100):Math.round(-100/(dec-1));}
function socialNews(){const games=(state?.games||[]),week=Number(state?.selectedWeek||1);const wg=games.filter(g=>Number(g.phaseWeek)===week);const played=wg.filter(g=>g.played),up=wg.filter(g=>!g.played);const top=socialMarkets()[0];return [{title:'Week '+week+' market watch',text:wg.length+' matchup'+(wg.length===1?'':'s')+' on the board • '+played.length+' final • '+up.length+' upcoming.'},{title:'Player market spotlight',text:top?top.player+' • '+top.label+' is '+(top.gap?top.gap.toFixed(1)+' units from the franchise average':'one of the current model leans')+'.':'Player markets are still building.'},{title:'Results desk',text:played.length?played[0].awayName+' '+(Number(played[0].awayScore)||0)+' - '+(Number(played[0].homeScore)||0)+' '+played[0].homeName+'.':'No completed games in the selected week yet.'}];}
function renderSocial(){
 const tabs=[['ai','AI Picks'],['forum','Forum'],['suggested','Suggested'],['trending','Trending'],['insights','Insights'],['leaderboard','Leaderboard']];
 const tabbar='<div class="social-tabs">'+tabs.map(t=>'<button class="'+(socialTab===t[0]?'active':'')+'" data-social-tab="'+t[0]+'">'+t[1]+'</button>').join('')+'</div>';
 const news=socialNews().map(n=>'<div class="social-news-item"><b>'+esc(n.title)+'</b><span>'+esc(n.text)+'</span></div>').join('');
 const top=socialMarkets().slice(0,8);
 let body='';
 if(socialTab==='ai'){
  body='<article class="social-card"><div class="social-kicker">TOP AI LEANS</div><h3>Data-backed suggestions</h3>'+(top.length?top.slice(0,6).map(x=>'<div class="social-pick"><div class="social-pick-head"><div><div class="social-pick-name">'+esc(x.player)+' <span class="prop-role">'+esc(x.position)+'</span></div><div class="social-meta">'+esc(x.team)+' • '+esc(x.label)+' • Week '+esc(x.g.phaseWeek)+'</div></div><span class="social-confidence">'+x.pct+'% MODEL</span></div><div style="margin-top:8px;font-weight:900">'+esc(x.over?'OVER':'UNDER')+' '+esc(x.line)+' <span class="muted">'+esc(x.odds)+'</span></div><div class="social-reason"><b>WHY THIS PICK:</b> '+(Number.isFinite(x.avg)?'The '+x.line.toFixed(1)+' line is '+x.gap.toFixed(1)+' units '+(x.over?'below':'above')+' the franchise sample average of '+x.avg.toFixed(1)+'.':'Limited historical sample; this is a roster-based projection.')+'</div><div class="social-actions"><button class="social-action primary" data-add="'+encodeURIComponent(JSON.stringify(x.selection)).replace(/'/g,'%27')+'">ADD TO SLIP</button></div></div>').join(''):'<div class="empty">Not enough player-prop data to generate picks.</div>')+'</article>';
 } else if(socialTab==='suggested'){
  const pool=top.slice();const sets=[];for(let size=2;size<=Math.min(6,pool.length);size++){const legs=[];const usedPlayers=new Set();for(const x of pool){const pk=String(x.player);if(usedPlayers.has(pk))continue;legs.push(x);usedPlayers.add(pk);if(legs.length===size)break}if(legs.length===size)sets.push({name:size===2?'AI SAFE PARLAY':size===3?'AI 3-LEG PARLAY':size===4?'AI 4-LEG PARLAY':size===5?'AI LONGSHOT':'AI 6-LEG LONGSHOT',legs});}
  body='<div class="social-card"><div class="social-kicker">SUGGESTED PARLAYS</div><h3>Desktop-style model combinations</h3>'+sets.map(set=>'<div class="social-pick"><div class="row"><b>'+esc(set.name)+'</b><span class="tag">'+socialOdds(set.legs)+'</span></div>'+set.legs.map(x=>'<div class="social-leg"><span>'+esc(x.selection.label)+'</span><b>'+esc(x.odds)+'</b></div>').join('')+'<div class="social-actions"><button class="social-action primary" data-social-parlay="'+encodeURIComponent(JSON.stringify(set.legs.map(x=>x.selection))).replace(/'/g,'%27')+'">ADD ALL TO SLIP</button></div></div>').join('')+(sets.length?'':'<div class="empty">Not enough markets for suggested parlays.</div>')+'</div>';
 } else if(socialTab==='forum'){
  const cats=['ALL','GAME TALK','PROPS','PARLAYS','HOT TAKES','POSTGAME','SHARP MONEY'];const authors=['GridironGuru','StatHead','SafeBetSam','LongshotLarry','TheSharpReport','MaddenInsider','SundayTicket','FourthDown'];
  const posts=top.slice(0,8).map((x,i)=>{const cat=cats[1+(i%6)];const text=cat==='PARLAYS'?'If I were building a card, '+x.player+' '+x.label+' is one of the legs I would consider pairing.':cat==='GAME TALK'?'The matchup context matters here. The game script could make this market interesting.':cat==='POSTGAME'?'The result will tell us whether the market read was justified.':cat==='SHARP MONEY'?'The price matters here. I would rather have the number than chase a worse price.':cat==='HOT TAKES'?'This is one of the more aggressive numbers on the board, but the model sees separation.':'The '+x.line.toFixed(1)+' line gives the '+(x.over?'over':'under')+' a measurable angle versus the sample.';return '<div class="social-post" data-social-category="'+cat+'"><div class="social-author">'+authors[i%authors.length]+' • '+x.pct+'% MODEL LEAN • '+cat+'</div><div class="social-post-text">'+esc(text)+'</div><div class="social-comment"><b>'+(i%2?'GridironGuru':'StatHead')+':</b> '+esc(i%2?'I can see the argument, but I would not call it automatic.':'Agreed on the price. I would rather have the line than lay extra juice.')+'</div><div class="social-actions"><button class="social-action primary" data-add="'+encodeURIComponent(JSON.stringify(x.selection)).replace(/'/g,'%27')+'">ADD THIS BET</button></div></div>'}).join('');
  body='<article class="social-card"><div class="social-kicker">COMMUNITY FEED</div><h3>What the sportsbook crowd is talking about</h3><div class="social-filter-row">'+cats.map(c=>'<button class="social-filter '+(socialFilter===c?'active':'')+'" data-social-filter="'+c+'">'+c+'</button>').join('')+'</div>'+posts+'<div class="social-disclaimer">Community posts are simulated for this offline franchise sportsbook. They update from the current Franchise markets.</div></article>';
 } else if(socialTab==='trending'){
  body='<article class="social-card"><div class="social-kicker">TRENDING</div><h3>Popular-looking markets</h3><table class="social-table"><tbody>'+top.slice(0,6).map((x,i)=>'<tr><td><b>#'+(i+1)+'</b></td><td><b>'+esc(x.player+' '+x.label)+'</b><br><span class="social-meta">'+esc(x.team)+'</span></td><td>'+x.pct+'%</td><td>'+esc(x.odds)+'</td><td><button class="social-action primary" data-add="'+encodeURIComponent(JSON.stringify(x.selection)).replace(/'/g,'%27')+'">ADD</button></td></tr>').join('')+'</tbody></table></article>';
 } else if(socialTab==='insights'){
  body='<article class="social-card"><div class="social-kicker">STAT INSIGHTS</div><h3>Numbers behind the markets</h3>'+top.slice(0,8).map(x=>'<div class="social-pick"><div class="social-pick-name">'+esc(x.player)+' • '+esc(x.m.label||x.m.stat)+'</div><div class="social-meta">'+esc(x.team)+' • sample average '+(Number.isFinite(x.avg)?x.avg.toFixed(1):'—')+' • line '+x.line.toFixed(1)+' • '+esc(x.g.awayName)+' @ '+esc(x.g.homeName)+'</div><div class="social-reason">'+(Number.isFinite(x.avg)?'The line is '+x.gap.toFixed(1)+' units '+(x.over?'below':'above')+' the franchise sample average, giving the '+(x.over?'over':'under')+' the current model edge.':'There is limited historical data, so this market is being projected from the current roster and matchup.')+'</div></div>').join('')+(top.length?'':'<div class="empty">No player-prop sample available.</div>')+'</article>';
 } else {
  const hist=state?.recentHistory||[];const settled=hist.filter(b=>['won','lost','void'].includes(String(b.status)));const wins=settled.filter(b=>b.status==='won').length;const profit=settled.reduce((n,b)=>n+Number(b.profit||0),0);const rows=[['GridironGuru',31,19],['StatHead',27,16],['LongshotLarry',22,12],['TheSharpReport',35,22],['MaddenInsider',19,10],['SundayTicket',29,16]];const you=[state.profile?.name||'YOU',settled.length,wins];rows.push(you);rows.sort((a,b)=>(b[2]-a[2])||(b[1]-a[1]));body='<article class="social-card"><div class="social-kicker">COMMUNITY LEADERBOARD</div><h3>Franchise sportsbook standings</h3><div class="social-meta">Community records simulate a live sportsbook season. Your row uses your real franchise sportsbook results.</div><table class="social-table"><tbody>'+rows.map((r,i)=>'<tr><td><b>#'+(i+1)+'</b></td><td>'+esc(r[0])+(r===you?' <span class="social-badge">YOU</span>':'')+'</td><td>'+r[2]+'-'+Math.max(0,r[1]-r[2])+'</td><td>'+r[1]+' settled</td></tr>').join('')+'</tbody></table><div class="social-disclaimer">Current franchise profit: '+(profit>=0?'+':'')+'$'+profit.toFixed(2)+'.</div></article>';
 }
 if(socialTab==='forum' && socialFilter!=='ALL'){ const wanted=socialFilter; const re=/<div class=\"social-post\" data-social-category=\"([^\"]+)\">/g; posts=posts.replace(re,(m,c)=>c===wanted?m:m.replace('social-post\"','social-post\" style=\"display:none\"')); }
 return '<div class="social-news">'+news+'</div>'+tabbar+body;
}

function renderProfile(){return '<div class="card"><div class="muted">SPORTSBOOK PROFILE</div><h2>'+esc(state.profile?.avatar||'🏈')+' '+esc(state.profile?.name||'PROFILE')+'</h2><div class="sub">'+esc(state.profile?.favoriteTeam||'')+'</div></div><div class="card"><div class="row"><span>Reputation</span><b>'+esc(state.reputation||'ROOKIE')+'</b></div><div class="row" style="margin-top:10px"><span>Record</span><b>'+esc(state.record||'0–0')+'</b></div></div>'}
function slipContext(x){const kind=String(x.kind||'').toLowerCase();const rawMarket=String(x.market||x.meta||'').toLowerCase();const label=String(x.label||'');let type='BET',side='',team='';const away=x.away||x.awayName||'';const home=x.home||x.homeName||'';const labelLower=label.toLowerCase();const teamFromLabel=(name)=>name&&labelLower.startsWith(String(name).toLowerCase())?name:'';if(kind.startsWith('prop')||rawMarket.includes('player prop')){type='PLAYER PROP'}else if(kind==='mlA'||kind==='mlH'||kind==='moneyline'||rawMarket.includes('moneyline')||/\bml\b/i.test(label)){type='MONEYLINE';if(kind==='mlA'||(kind!=='mlH'&&teamFromLabel(away))){side='AWAY';team=away}else if(kind==='mlH'||teamFromLabel(home)){side='HOME';team=home}else{side=String(x.side||x.homeAway||x.location||'').toUpperCase();team=x.team||x.teamName||x.selectedTeam||''}}else if(kind==='sprA'||kind==='sprH'||kind==='spread'||rawMarket.includes('spread')||/^[^•]+\s+[+-]?[0-9]+(?:\.[0-9]+)?(?:\s|$)/i.test(label)){type='SPREAD';if(kind==='sprA'||(kind!=='sprH'&&teamFromLabel(away))){side='AWAY';team=away}else if(kind==='sprH'||teamFromLabel(home)){side='HOME';team=home}else{side=String(x.side||x.homeAway||x.location||'').toUpperCase();team=x.team||x.teamName||x.selectedTeam||''}}else if(kind==='over'||kind==='under'||kind==='total'||rawMarket.includes('game total')||rawMarket.includes('total')){type='GAME TOTAL'}else if(x.market)type=String(x.market).toUpperCase();const rawWeek=Number(x.phaseWeek);const fallbackWeek=Number(x.week);const week=Number.isFinite(rawWeek)?rawWeek:(Number.isFinite(fallbackWeek)?fallbackWeek+1:Number(state?.selectedWeek)+1);const parts=[type];if(side&&team)parts.push(side,team);if(Number.isFinite(week))parts.push('Week '+week);if(away&&home)parts.push(away+' @ '+home);return parts.join(' • ')}function slipItem(x,i){return '<div class="bet"><button class="remove" data-remove="'+esc(x.key||'')+'">×</button><div class="betname">'+esc(x.label||'Selection')+'</div><div class="betmeta">'+esc(slipContext(x))+'</div><div class="odds">'+esc(x.display||x.odds||'')+'</div></div>'}
function renderSlip(inHome=false){const s=state.slip||[];const w=Number(state.wager||25);if(!s.length)return '<div class="card"><div class="row"><b>BET SLIP</b><span class="tag">0 SELECTIONS</span></div><div class="empty">Your bet slip is empty.<br><br>Go to Games or Props and tap a market.</div></div>';const dec=s.reduce((a,x)=>{const o=Number(x.odds);return a*(o>0?(1+o/100):(1+100/Math.abs(o||-110)))},1);const american=dec>=2?Math.round((dec-1)*100):Math.round(-100/(dec-1));const profit=w*(dec-1),ret=w*dec;return '<div class="card"><div class="row"><b>BET SLIP</b><span class="tag">'+s.length+' '+(s.length===1?'SELECTION':'SELECTIONS')+'</span></div>'+s.map(slipItem).join('')+'<label style="display:block;margin-top:12px;font-weight:800">WAGER AMOUNT<input id="wager" type="number" min="1" value="'+esc(w)+'"></label><div class="slip-summary"><div class="stat"><small>TYPE</small><b>'+(s.length===1?'STRAIGHT':'PARLAY')+'</b></div><div class="stat"><small>ODDS</small><b>'+american+'</b></div><div class="stat"><small>PROFIT</small><b>$'+profit.toFixed(2)+'</b></div><div class="stat"><small>RETURN</small><b>$'+ret.toFixed(2)+'</b></div></div><button class="market primary" id="placeBetBtn" style="margin-top:10px">PLACE BET</button><button class="market" id="clearSlipBtn">CLEAR SLIP</button></div>'}
async function place(){const e=document.getElementById('wager');const w=Number(e?.value)||0;await act('setWager',{wager:w});await act('placeBet')}
function renderSlipOverlay(){if(!slipOpen)return '';return '<div class="slip-modal" data-slip-modal><div class="slip-modal-panel"><div class="slip-modal-head"><b>BET SLIP</b><button class="slip-close" data-close-slip aria-label="Close bet slip">×</button></div><div class="slip-modal-body">'+renderSlip(false)+'</div></div></div>'}
function bind(){document.querySelectorAll('[data-prop-game]').forEach(d=>d.addEventListener('toggle',()=>{const key=d.dataset.propGame;if(!key)return;if(d.open){propCollapsedGames.delete(key);propExpandedGames.add(key)}else{propExpandedGames.delete(key);propCollapsedGames.add(key)}}));document.querySelectorAll('[data-parlay-key]').forEach(d=>d.addEventListener('toggle',()=>{const key=d.dataset.parlayKey;if(!key)return;if(d.open)mobileOpenParlays.add(key);else mobileOpenParlays.delete(key)}));document.querySelectorAll('[data-add]').forEach(b=>b.addEventListener('click',()=>{try{addSel(JSON.parse(decodeURIComponent(b.dataset.add)))}catch(e){toast('Could not read selection')}}));document.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>act('removeSelection',{key:b.dataset.remove})));document.querySelectorAll('[data-collect]').forEach(b=>b.addEventListener('click',()=>act('collect',{id:b.dataset.collect})));document.querySelectorAll('[data-cashout-bet]').forEach(b=>b.addEventListener('click',()=>act('cashout',{id:b.dataset.cashoutBet}))); document.getElementById('placeBetBtn')?.addEventListener('click',place);document.getElementById('clearSlipBtn')?.addEventListener('click',()=>act('clearSlip'));document.querySelectorAll('[data-page-slip]').forEach(b=>b.addEventListener('click',()=>{slipOpen=true;render()}));document.querySelectorAll('[data-close-slip]').forEach(b=>b.addEventListener('click',()=>{slipOpen=false;render()}));document.querySelectorAll('[data-slip-modal]').forEach(m=>m.addEventListener('click',e=>{if(e.target===m){slipOpen=false;render()}}));document.querySelectorAll('[data-phase]').forEach(b=>b.addEventListener('click',()=>{weekPickerOpen=false;gamePhase=b.dataset.phase;gameWeek=null;act('setGameView',{phase:gamePhase}).then(refresh)}));const weekSelect=document.getElementById('mobileWeek');if(weekSelect){weekSelect.addEventListener('focus',()=>{weekPickerOpen=true});weekSelect.addEventListener('pointerdown',()=>{weekPickerOpen=true});weekSelect.addEventListener('change',e=>{gameWeek=Number(e.target.value);weekPickerOpen=false;act('setGameView',{phase:gamePhase,week:gameWeek}).then(refresh)});weekSelect.addEventListener('blur',()=>{setTimeout(()=>{if(document.activeElement!==weekSelect) weekPickerOpen=false},250)});}document.querySelectorAll('[data-social-tab]').forEach(b=>b.addEventListener('click',()=>{socialTab=b.dataset.socialTab||'ai';render()}));document.querySelectorAll('[data-social-filter]').forEach(b=>b.addEventListener('click',()=>{const f=b.dataset.socialFilter||'ALL';socialFilter=f;document.querySelectorAll('[data-social-filter]').forEach(x=>x.classList.toggle('active',x.dataset.socialFilter===f));document.querySelectorAll('[data-social-category]').forEach(x=>x.style.display=(f==='ALL'||x.dataset.socialCategory===f)?'':'none')}));document.querySelectorAll('[data-social-parlay]').forEach(b=>b.addEventListener('click',()=>{try{const legs=JSON.parse(decodeURIComponent(b.dataset.socialParlay));for(const l of legs)addSel(l)}catch(e){toast('Could not read suggested parlay')}}));}
function render(){const a=document.getElementById('app');if(slipOpen){const panel=document.querySelector('.slip-modal-panel');if(panel)slipScrollTop=panel.scrollTop}document.querySelectorAll('[data-parlay-key]').forEach(d=>{const key=d.dataset.parlayKey;if(!key)return;if(d.open)mobileOpenParlays.add(key);else mobileOpenParlays.delete(key)});if(!state?.franchiseLoaded){a.innerHTML='<div class="card"><b>Connect to desktop</b><div class="empty">Import a franchise on the PC first.</div></div>';return}let html=page==='home'?renderHome():page==='games'?renderGames():page==='props'?renderProps():page==='bets'?renderBets():page==='social'?renderSocial():renderProfile();if(page==='social')html+=renderSlipBar();a.innerHTML=html;document.querySelectorAll('.slip-modal').forEach(x=>x.remove());document.body.insertAdjacentHTML('beforeend',renderSlipOverlay());const newPanel=document.querySelector('.slip-modal-panel');if(newPanel&&slipOpen){newPanel.scrollTop=slipScrollTop}bind()}
document.querySelectorAll('.nav button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.nav button').forEach(x=>x.classList.remove('active'));b.classList.add('active');page=b.dataset.page;render()});refresh();setInterval(refresh,1500);
</script></body></html>`;
}
function startMobileServer() {
  if (mobileServer) return { ok:true, port:MOBILE_PORT };
  mobileServer = http.createServer(async (req,res)=>{
    const u = new URL(req.url||"/", `http://${req.headers.host||"localhost"}`);
    try {
      if (u.pathname === "/" || u.pathname === "/mobile") {
        res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"}); return res.end(mobileHtml());
      }
      if (u.pathname === "/api/state" && req.method==="GET") {
        const data=await mobileSnapshot(); res.writeHead(200,{"Content-Type":"application/json"}); return res.end(JSON.stringify(data||{ok:false,error:"Desktop state unavailable"}));
      }
      if (u.pathname === "/api/action" && req.method==="POST") {
        let body=""; for await (const c of req) body+=c;
        const parsed=JSON.parse(body||"{}"); const out=await mobileCommand(parsed.action,parsed.payload||{});
        res.writeHead(200,{"Content-Type":"application/json"}); return res.end(JSON.stringify(out||{ok:true}));
      }
      res.writeHead(404); res.end("Not found");
    } catch(e){res.writeHead(500,{"Content-Type":"application/json"});res.end(JSON.stringify({ok:false,error:e?.message||String(e)}))}
  });
  mobileServer.on("error",()=>{mobileServer=null;});
  mobileServer.listen(MOBILE_PORT,"0.0.0.0");
  return {ok:true,port:MOBILE_PORT};
}
function stopMobileServer(){if(mobileServer){try{mobileServer.close()}catch{} mobileServer=null;}return {ok:true};}
function mobileConnectionInfo(){
  const found=[];
  const score=(name,address)=>{
    const n=String(name||'').toLowerCase(), a=String(address||'');
    let s=0;
    if(/wi-?fi|wlan|wireless/.test(n)) s+=100;
    if(/ethernet|lan/.test(n)) s+=90;
    if(/^192\.168\.(0|1)\./.test(a)) s+=60;
    else if(/^10\./.test(a)) s+=50;
    else if(/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(a)) s+=40;
    if(/^192\.168\.56\./.test(a)) s-=80; // common VirtualBox host-only range
    if(/^169\.254\./.test(a)) s-=200; // link-local, not a usable LAN address
    return s;
  };
  for(const [name,list] of Object.entries(os.networkInterfaces())) for(const n of (list||[])) {
    if(n.family!=="IPv4" || n.internal) continue;
    found.push({name,address:n.address,score:score(name,n.address)});
  }
  found.sort((a,b)=>b.score-a.score);
  const addresses=[...new Set(found.map(x=>x.address))];
  return {enabled:!!mobileServer,port:MOBILE_PORT,interfaces:found,addresses,urls:addresses.map(a=>`http://${a}:${MOBILE_PORT}/`)};
}

function createWindow() {
  Menu.setApplicationMenu(null);
  mainWindow = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1100, minHeight: 720,
    backgroundColor: "#080c11",
    frame: false,
    titleBarStyle: "hidden",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "../assets/madden27-sportsbook.ico"),
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false }
  });
  mainWindow.loadFile(path.join(__dirname, "index.html"));
}
ipcMain.on("window-minimize", () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize(); });
ipcMain.on("window-toggle-maximize", () => { if (!mainWindow || mainWindow.isDestroyed()) return; if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize(); });
ipcMain.on("window-close", () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close(); });

ipcMain.handle("mobile-start", () => startMobileServer());
ipcMain.handle("mobile-stop", () => stopMobileServer());
ipcMain.handle("mobile-status", () => mobileConnectionInfo());

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

async function findMaddenSaveFolder() {
  const documents = app.getPath("documents");
  const appData = app.getPath("appData").replace(/\\Roaming$/i, "");
  const roots = [
    path.join(documents, "EA SPORTS™ Madden NFL 27"), path.join(documents, "EA SPORTS Madden NFL 27"), path.join(documents, "Madden NFL 27"),
    path.join(appData, "LocalLow", "EA SPORTS™ Madden NFL 27"), path.join(appData, "LocalLow", "EA SPORTS Madden NFL 27"),
    path.join(appData, "Local", "EA SPORTS™ Madden NFL 27"), path.join(appData, "Local", "EA SPORTS Madden NFL 27"),
    path.join(appData, "EA SPORTS™ Madden NFL 27"), path.join(appData, "EA SPORTS Madden NFL 27")
  ];
  for (const root of roots) for (const n of ["Saves", "SaveGames", "saves", "savegames"]) {
    try { if ((await fs.stat(path.join(root, n))).isDirectory()) return path.join(root, n); } catch {}
  }
  for (const root of roots) { try { if ((await fs.stat(root)).isDirectory()) return root; } catch {} }
  return null;
}

ipcMain.handle("pick-franchise", async () => {
  const folder = await findMaddenSaveFolder();
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Open Madden 27 Franchise Save", properties: ["openFile"], defaultPath: folder || undefined,
    filters: [{ name: "Madden Franchise", extensions: ["*"] }]
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  lastImportedPath = result.filePaths[0];
  watchImportedSave(lastImportedPath);
  return { canceled: false, path: result.filePaths[0], startFolder: folder || null };
});

const stateFilePath = () => path.join(app.getPath("userData"), "sportsbook-state.json");

ipcMain.handle("load-app-state", async () => {
  try {
    const raw = await fs.readFile(stateFilePath(), "utf8");
    const data = JSON.parse(raw);
    return { ok: true, state: data && typeof data === "object" ? data : {} };
  } catch (e) {
    if (e?.code === "ENOENT") return { ok: true, state: {} };
    return { ok: false, state: {}, error: e?.message || String(e) };
  }
});

ipcMain.handle("save-app-state", async (_event, state) => {
  try {
    const file = stateFilePath();
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp`;
    await fs.writeFile(temp, JSON.stringify(state ?? {}, null, 2), "utf8");
    await fs.rename(temp, file);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("reparse-franchise", async () => {
  if (!lastImportedPath) return { ok: false, error: "No franchise has been imported yet." };
  return parseFranchise(lastImportedPath);
});

function primitive(value) {
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (["string","number","boolean"].includes(t)) return value;
  if (t === "bigint") return Number(value);
  if (Buffer.isBuffer(value)) return value.toString("hex");
  return null;
}
function getValue(record, field) { try { return primitive(record.getValueByKey(field)); } catch { return null; } }
function getRecordFieldKeys(record) {
  const out = new Set();
  try { for (const k of Object.keys(record?.fields || {})) out.add(k); } catch {}
  try { for (const f of (record?.fieldsArray || [])) if (f?.key) out.add(f.key); } catch {}
  return [...out];
}
function readFields(table, fields) {
  return table.readRecords(fields).then(() => (table.records || []).map((record, index) => {
    const row = { index };
    for (const field of fields) row[field] = getValue(record, field);
    return row;
  }));
}

function teamInfoFromRecord(record) {
  if (!record) return null;
  const fields = ["TeamName","DisplayName","LongName","ShortName","TeamAbbreviation","Abbreviation","CityName","NickName","TeamNickName","Name","TeamIndex"];
  const out = {};
  for (const f of fields) { const v = getValue(record, f); if (v !== null && v !== "") out[f] = v; }
  const name = out.DisplayName || out.TeamName || out.LongName || out.Name || [out.CityName, out.NickName].filter(Boolean).join(" ") || out.ShortName;
  const ab = out.TeamAbbreviation || out.Abbreviation || out.ShortName;
  return name || ab ? { ...out, name: name || ab, abbreviation: ab || null, recordIndex: record.index } : null;
}

async function parseFranchise(filePath) {
  try {
    const mod = await import("madden-franchise");
    const Franchise = mod.default;
    const franchise = await Franchise.create(filePath, { autoParse: true });

    const seasonGame = franchise.getTableByName("SeasonGame");
    if (!seasonGame) throw new Error("SeasonGame table was not found.");
    // GameTime has moved/varied in some Madden schemas. Inspect the SeasonGame
    // field names first so we can catch aliases such as Gametime or GameTimeValue
    // instead of silently treating a real field as missing.
    let detectedGameTimeField = null;
    try {
      await seasonGame.readRecords();
      const probe = (seasonGame.records || []).find(r => r && !r.isEmpty);
      const keys = probe ? getRecordFieldKeys(probe) : [];
      // Madden's schedule editor exposes the actual kickoff field as TimeOfDay.
      // It is stored as minutes since midnight. Prefer it over the newer/ambiguous
      // GameTime name, which can decode to null in Madden 27.
      detectedGameTimeField = keys.find(k => /^timeofday$/i.test(String(k))) ||
        keys.find(k => /^gametime$/i.test(String(k))) ||
        keys.find(k => /game.?time|kickoff.?time|start.?time/i.test(String(k))) || null;
    } catch {}
    const gameFields = ["AwayTeam","HomeTeam","HomeScore","AwayScore","SeasonWeek","SeasonGameNum","GameStatus","DayOfWeek","TimeOfDay", ...(detectedGameTimeField && !/^timeofday$/i.test(String(detectedGameTimeField)) && detectedGameTimeField !== "GameTime" ? [detectedGameTimeField] : ["GameTime"]),"WeekType","LiveSeasonGameType","IsSimmed","Simmed","ForceWin","IsHumanFlag","HomeRequestId","AwayRequestId"];
    const games = await readFields(seasonGame, gameFields);
    for (const g of games) {
      if (g.TimeOfDay !== null && g.TimeOfDay !== undefined && g.TimeOfDay !== "") {
        g.GameTime = g.TimeOfDay;
        g.GameTimeSource = "TimeOfDay";
      } else if (detectedGameTimeField && detectedGameTimeField !== "GameTime" && !/^timeofday$/i.test(String(detectedGameTimeField))) {
        g.GameTime = g[detectedGameTimeField];
        g.GameTimeSource = detectedGameTimeField;
      }
    }
    // If the schema exposes TimeOfDay but returns null, read the raw bit field.
    // Community schedule-editor research identifies SeasonGame TimeOfDay as an
    // 11-bit field at bit offset 565. This is read-only and only used as a fallback.
    const rawTimeOfDay = (record) => {
      try {
        const field = record?.getFieldByKey?.("TimeOfDay");
        const uv = field?.unformattedValue;
        const off = field?.offset;
        if (uv?.getBits && off && Number.isFinite(Number(off.offset)) && Number.isFinite(Number(off.length))) {
          return uv.getBits(Number(off.offset), Number(off.length));
        }
      } catch {}
      try {
        const field = (record?.fieldsArray || []).find(f => {
          const o = f?.offset;
          return Number(o?.offset) === 565 && Number(o?.length) === 11;
        });
        const uv = field?.unformattedValue;
        const off = field?.offset;
        if (uv?.getBits && off) return uv.getBits(Number(off.offset), Number(off.length));
      } catch {}
      return null;
    };
    for (const g of games) {
      if (g.GameTime !== null && g.GameTime !== undefined && g.GameTime !== "") continue;
      const raw = rawTimeOfDay(seasonGame.records[g.index]);
      if (raw !== null && raw !== undefined) {
        g.GameTime = raw;
        g.GameTimeSource = "TimeOfDay(raw)";
      }
    }
    const zero = /^0+$/;
    const playable = games.filter(g => g.AwayTeam && g.HomeTeam && !zero.test(String(g.AwayTeam)) && !zero.test(String(g.HomeTeam)));

    const teams = new Map();
    const teamTableNames = ["Team","FranchiseTeam","TeamData"];
    for (const tableName of teamTableNames) {
      try {
        const tables = franchise.getAllTablesByName(tableName);
        for (const table of tables || []) {
          // Try common fields; unresolved fields simply remain empty.
          try { await table.readRecords(["TeamName","DisplayName","LongName","ShortName","TeamAbbreviation","Abbreviation","CityName","NickName","TeamNickName","Name","TeamIndex"]); } catch {}
        }
      } catch {}
    }

    // Madden Player.TeamIndex is a plain integer roster assignment. It is not
    // necessarily the Player/Team table row position, which matters for fantasy
    // drafts and relocated franchises.
    const teamIndexMap = new Map();
    for (const tableName of teamTableNames) {
      try {
        for (const table of franchise.getAllTablesByName(tableName) || []) {
          for (const rec of table.records || []) {
            if (!rec || rec.isEmpty) continue;
            const n = Number(getValue(rec, "TeamIndex"));
            const info = teamInfoFromRecord(rec);
            if (!info || !Number.isInteger(n) || n < 0) continue;
            const existing = teamIndexMap.get(String(n));
            const existingPractice = String(existing?.name || "").trim().toLowerCase() === "practice";
            const thisPractice = String(info.name || "").trim().toLowerCase() === "practice";
            if (!existing || (existingPractice && !thisPractice)) teamIndexMap.set(String(n), info);
          }
        }
      } catch {}
    }

    function resolveTeam(record, field) {
      try {
        const ref = record.getReferenceDataByKey(field);
        if (!ref) return null;
        let target = null;
        try { target = franchise.getReferencedRecord(ref); } catch {}
        const info = teamInfoFromRecord(target);
        if (info) return info;
        // Some saves expose a direct row number in the reference object.
        for (const k of ["rowNumber","rowIndex","recordIndex","index","rowNum"]) {
          const idx = Number(ref[k]);
          if (Number.isInteger(idx) && idx >= 0) {
            for (const tableName of teamTableNames) {
              try { for (const table of franchise.getAllTablesByName(tableName) || []) { const r = table.records?.[idx]; const x = teamInfoFromRecord(r); if (x) return x; } } catch {}
            }
          }
        }
      } catch {}
      return null;
    }

    // SeasonGame team tokens are references whose trailing 8 bits identify the
    // Team table RECORD INDEX. This is intentionally different from the TeamIndex
    // field stored on Team/Player records. The distinction matters in Madden 27:
    // a schedule token can end in 0 (Team record 0 = 49ers in the supplied save)
    // while a completely different Team record may have TeamIndex 0.
    const decodeScheduleRecordIndex = (raw) => {
      if (raw === null || raw === undefined) return null;
      const s = String(raw).trim();
      if (/^[01]{8,}$/.test(s)) {
        const n = Number.parseInt(s.slice(-8), 2);
        return Number.isInteger(n) ? n : null;
      }
      const n = Number(s);
      return Number.isInteger(n) && n >= 0 ? n : null;
    };
    const scheduleToken = raw => String(raw ?? '').trim();

    // Prefer the actual Team table and index it by RECORD INDEX. Do not use the
    // TeamIndex field here; TeamIndex is a separate roster-assignment value.
    const teamRecordMap = new Map();
    for (const tableName of teamTableNames) {
      try {
        for (const table of franchise.getAllTablesByName(tableName) || []) {
          for (const rec of table.records || []) {
            if (!rec || rec.isEmpty || !Number.isInteger(Number(rec.index))) continue;
            const info = teamInfoFromRecord(rec);
            if (!info) continue;
            const key = String(rec.index);
            // The canonical Team table wins over fallback team-like tables.
            if (!teamRecordMap.has(key) || tableName === 'Team') {
              teamRecordMap.set(key, info);
            }
          }
        }
      } catch {}
    }

    // Some saves have a Practice pseudo-team whose SeasonGame reference collides
    // with a real team's Team-record index. The important rule is to learn the
    // preferred token from ACTUAL REGULAR-season rows, not from overall schedule
    // frequency. In 32-user franchises the Practice rows can outnumber/compete
    // with real rows and otherwise make a real team (notably SF) disappear.
    const scheduleTokenCounts = new Map();
    const scheduleTokenBase = new Map();
    const scheduleTokenDirect = new Map();
    for (const g of playable) {
      const rec = seasonGame.records[g.index];
      for (const field of ['AwayTeam', 'HomeTeam']) {
        const raw = g[field];
        const recordIndex = decodeScheduleRecordIndex(raw);
        if (recordIndex === null) continue;
        const token = scheduleToken(raw);
        const key = `${recordIndex}|${token}`;
        scheduleTokenCounts.set(key, (scheduleTokenCounts.get(key) || 0) + 1);
        if (!scheduleTokenBase.has(key)) scheduleTokenBase.set(key, resolveTeam(rec, field));
        if (!scheduleTokenDirect.has(key)) scheduleTokenDirect.set(key, teamRecordMap.get(String(recordIndex)) || null);
      }
    }

    const primaryScheduleTokenByRecord = new Map();
    const recordTokenCandidates = new Map();
    // Multi-user saves can append auxiliary team-schedule rows after the real
    // SeasonGame slate. Those rows often reuse SeasonGameNum=0 / SeasonWeek=0
    // and contain one pseudo-game for each team, which overwhelms token counts
    // and makes the real 49ers reference lose to Practice. Learn token identity
    // from the first row for each (week, game number) slot only; the canonical
    // SeasonGame slate appears before those auxiliary rows in affected saves.
    const seenCanonicalScheduleSlots = new Set();
    for (const g of playable) {
      const slotKey = `${Number(g.SeasonWeek)}|${Number(g.SeasonGameNum)}`;
      if (seenCanonicalScheduleSlots.has(slotKey)) continue;
      seenCanonicalScheduleSlots.add(slotKey);
      const rawStage = String(g.LiveSeasonGameType || '').trim().toLowerCase();
      const wt = String(g.WeekType || '').trim().toLowerCase();
      const isRegularRaw = rawStage === 'regular' || wt === 'regular' || wt === 'regularseason' || wt === 'regular season';
      if (!isRegularRaw) continue;
      for (const field of ['AwayTeam', 'HomeTeam']) {
        const raw = g[field];
        const recordIndex = decodeScheduleRecordIndex(raw);
        if (recordIndex === null) continue;
        const token = scheduleToken(raw);
        const key = `${recordIndex}|${token}`;
        const base = scheduleTokenBase.get(key);
        const direct = scheduleTokenDirect.get(key);
        const basePractice = String(base?.name || '').trim().toLowerCase() === 'practice';
        const directPractice = String(direct?.name || '').trim().toLowerCase() === 'practice';
        const isPractice = basePractice && directPractice;
        const arr = recordTokenCandidates.get(String(recordIndex)) || [];
        const prior = arr.find(x => x.token === token);
        if (prior) prior.count += 1;
        else arr.push({ token, count: 1, isPractice });
        recordTokenCandidates.set(String(recordIndex), arr);
      }
    }
    // Fall back only for records that never appear in a regular-season row.
    for (const [key, count] of scheduleTokenCounts.entries()) {
      const sep = key.indexOf('|');
      const recordIndex = key.slice(0, sep);
      const token = key.slice(sep + 1);
      if (recordTokenCandidates.has(recordIndex)) continue;
      const base = scheduleTokenBase.get(key);
      const direct = scheduleTokenDirect.get(key);
      const isPractice = String(base?.name || '').trim().toLowerCase() === 'practice' &&
        String(direct?.name || '').trim().toLowerCase() === 'practice';
      const arr = recordTokenCandidates.get(recordIndex) || [];
      arr.push({ token, count, isPractice });
      recordTokenCandidates.set(recordIndex, arr);
    }
    for (const [recordIndex, candidates] of recordTokenCandidates.entries()) {
      const nonPractice = candidates.filter(x => !x.isPractice);
      const pool = nonPractice.length ? nonPractice : candidates;
      pool.sort((a, b) => b.count - a.count);
      if (pool[0]) primaryScheduleTokenByRecord.set(recordIndex, pool[0].token);
    }

    const resolveScheduleTeam = (g, field, rec) => {
      const base = resolveTeam(rec, field);
      const raw = g[field];
      const recordIndex = decodeScheduleRecordIndex(raw);
      const token = scheduleToken(raw);
      const direct = recordIndex === null ? null : teamRecordMap.get(String(recordIndex));
      const baseIsPractice = String(base?.name || '').trim().toLowerCase() === 'practice';
      const directIsPractice = String(direct?.name || '').trim().toLowerCase() === 'practice';
      const primaryToken = recordIndex === null ? null : primaryScheduleTokenByRecord.get(String(recordIndex));

      // If Madden's reference resolves to Practice but the decoded Team record
      // is a real team and this token is the real team's primary regular-season
      // token, prefer the real team. This restores real 49ers matchups without
      // turning genuine Practice rows into 49ers games.
      if (baseIsPractice && direct && !directIsPractice && primaryToken === token) return direct;
      if (baseIsPractice && (directIsPractice || (primaryToken && token !== primaryToken))) return base;
      if (base) return base;
      if (direct) return direct;
      return null;
    };
    const resolvedGames = playable.map(g => {
      const rec = seasonGame.records[g.index];
      const away = resolveScheduleTeam(g, "AwayTeam", rec);
      const home = resolveScheduleTeam(g, "HomeTeam", rec);
      if (away) teams.set(String(g.AwayTeam), away);
      if (home) teams.set(String(g.HomeTeam), home);
      return { ...g, awayTeamResolved: away, homeTeamResolved: home };
    });

    // Madden stores TimeOfDay/GameTime as an 11-bit schedule field. When present, treat it
    // as minutes after midnight for display/sorting. Some older/alternate saves
    // may not expose the field through the schema, so the renderer has a safe
    // day-based fallback.
    const normalizeGameTime = value => {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0 || n > 2047) return null;
      return Math.round(n) % 1440;
    };
    const dayOrder = { Thursday:0, Friday:1, Saturday:2, Sunday:3, Monday:4, Tuesday:5, Wednesday:6 };
    for (const g of resolvedGames) {
      g.gameTimeMinutes = normalizeGameTime(g.GameTime);
      g.gameDayOrder = dayOrder[String(g.DayOfWeek || '')] ?? 9;
    }

    const practiceGameIndexes = new Set(resolvedGames.filter(g => {
      const a = String(g.awayTeamResolved?.name || '').trim().toLowerCase();
      const h = String(g.homeTeamResolved?.name || '').trim().toLowerCase();
      return a === 'practice' || h === 'practice';
    }).map(g => String(g.index)));

    // Madden's SeasonWeek is zero-based for regular-season schedule data:
    // SeasonWeek 0 = Madden Week 1, SeasonWeek 6 = Madden Week 7, etc.
    // The authoritative current Franchise week lives in SeasonInfo.CurrentWeek;
    // do not infer it from schedule result rows because a save can contain
    // stale scores/status values on games that have not actually been played.
    let activeSeasonWeek = null;
    try {
      const seasonInfo = franchise.getTableByName("SeasonInfo");
      if (seasonInfo) {
        const rows = await readFields(seasonInfo, ["CurrentWeek"]);
        const n = Number(rows?.[0]?.CurrentWeek);
        if (Number.isFinite(n)) activeSeasonWeek = n;
      }
    } catch {}
    const regularGames = resolvedGames.filter(g =>
      String(g.LiveSeasonGameType || '').toLowerCase() === 'regular'
    );
    const regularWeeks = [...new Set(regularGames.map(g => Number(g.SeasonWeek)).filter(Number.isFinite))].sort((a,b)=>a-b);
    if (!Number.isFinite(activeSeasonWeek)) {
      activeSeasonWeek = regularWeeks.find(w =>
        regularGames.some(g => Number(g.SeasonWeek) === w && !/AwayWon|HomeWon|Tied|StatsReported/i.test(String(g.GameStatus || '')))
      ) ?? regularWeeks[regularWeeks.length - 1] ?? 0;
    }

    const playerTable = franchise.getTableByName("Player");
    let playerSample = [];
    let playerCount = 0;
    const playerMap = new Map();
    if (playerTable) {
      playerSample = await readFields(playerTable, ["FirstName","LastName"]);
      playerCount = playerSample.length;
      playerSample = playerSample.filter(p => p.FirstName || p.LastName).slice(0, 25);
      try { await playerTable.readRecords(); } catch {}
      for (const rec of playerTable.records || []) {
        if (!rec || rec.isEmpty) continue;
        const first = getValue(rec, "FirstName") || ""; const last = getValue(rec, "LastName") || "";
        if (!first && !last) continue;
        const info = { id:String(rec.index), name:String(`${first} ${last}`).trim(), teamId:null, teamIndex:null, teamName:null, teamAbbreviation:null, position:null, injuryStatus:null, injuryFields:{} };
        const keys = getRecordFieldKeys(rec);
        // Preserve injury/medical fields when Madden exposes them on Player.
        // We only use these fields to distinguish a genuine DNP/injury from a
        // player who simply recorded zero in the wagered statistic.
        for (const injuryKey of keys.filter(k => /injur|healthstatus|medical/i.test(String(k)))) {
          try {
            const value = getValue(rec, injuryKey);
            if (value !== null && value !== undefined && String(value).trim() !== '') {
              info.injuryFields[String(injuryKey)] = value;
              if (info.injuryStatus === null && /injurystatus|injury|healthstatus|medicalstatus/i.test(String(injuryKey))) {
                info.injuryStatus = value;
              }
            }
          } catch {}
        }
        const teamTables = [];
        for (const tn of teamTableNames) { try { for (const table of franchise.getAllTablesByName(tn) || []) teamTables.push(table); } catch {} }
        const applyTeamRecord = (target) => {
          if (!target) return false;
          const ti = teamInfoFromRecord(target);
          if (!ti) return false;
          info.teamId = String(target.index);
          info.teamIndex = String(target.index);
          info.teamName = ti.name || null;
          info.teamAbbreviation = ti.abbreviation || null;
          return true;
        };
        // Prefer the authoritative Player.TeamIndex field. Do not select the
        // first arbitrary field containing "Team": fantasy-draft saves can carry
        // historical/reference team fields that are not the current roster.
        let assigned = false;
        const teamIndexKey = keys.find(k => String(k).toLowerCase() === "teamindex");
        if (teamIndexKey) {
          const n = Number(getValue(rec, teamIndexKey));
          if (Number.isInteger(n) && n >= 0) {
            const mapped = teamIndexMap.get(String(n));
            if (mapped) {
              info.teamId = String(mapped.recordIndex);
              info.teamIndex = String(n);
              info.teamName = mapped.name || null;
              info.teamAbbreviation = mapped.abbreviation || null;
              assigned = true;
            }
          }
        }
        // Fallback for older/alternate schemas without TeamIndex.
        if (!assigned) {
          const teamKeyCandidates = keys.filter(k => /team/i.test(k) && !/teamid|teamname/i.test(k));
          for (const teamKey of teamKeyCandidates) {
            try {
              const ref=rec.getReferenceDataByKey(teamKey);
              const target=ref ? franchise.getReferencedRecord(ref) : null;
              assigned=applyTeamRecord(target);
            } catch {}
            if (!assigned) {
              const raw=getValue(rec,teamKey);
              const n=Number(raw);
              if(Number.isInteger(n) && n>=0) {
                for(const table of teamTables) {
                  try { if(applyTeamRecord(table.records?.[n])) { assigned=true; break; } } catch {}
                }
              }
            }
            if (assigned) break;
          }
        }
        const posKey = keys.find(k => /^position$/i.test(String(k))) || keys.find(k => /position/i.test(String(k)));
        if(posKey) {
          const parsedPosition = getValue(rec,posKey);
          // Madden 27 saves can expose Position as the enum name `Invalid_` when
          // the parser schema enum is not perfectly aligned. Read the underlying
          // bits directly in that case and map the stable Madden position codes.
          if(parsedPosition && parsedPosition !== 'Invalid_' && parsedPosition !== 'Invalid') {
            info.position = parsedPosition;
          } else {
            try {
              const field = rec.getFieldByKey(posKey);
              const raw = field?.unformattedValue?.getBits(field.offset.offset, field.offset.length);
              const positionCodes = {
                0:'QB',1:'HB',2:'FB',3:'WR',4:'TE',5:'LT',6:'LG',7:'C',8:'RG',9:'RT',
                10:'LE',11:'RE',12:'DT',13:'LOLB',14:'MLB',15:'ROLB',16:'CB',17:'FS',18:'SS',
                19:'K',20:'P',21:'KR',22:'PR',23:'K',24:'LS',25:'3DRB'
              };
              if(Number.isFinite(Number(raw)) && positionCodes[Number(raw)]) info.position = positionCodes[Number(raw)];
            } catch {}
          }
        }
        playerMap.set(String(rec.index), info);
      }
    }

    const teamIndexZeroSchedule = resolvedGames.filter(g =>
      decodeScheduleRecordIndex(g.AwayTeam) === 0 || decodeScheduleRecordIndex(g.HomeTeam) === 0
    ).map(g => ({
      index:g.index, week:g.SeasonWeek, gameNum:g.SeasonGameNum, status:g.GameStatus,
      away:g.awayTeamResolved?.name || null, home:g.homeTeamResolved?.name || null,
      awayIndex:decodeScheduleRecordIndex(g.AwayTeam), homeIndex:decodeScheduleRecordIndex(g.HomeTeam),
      weekType:g.WeekType ?? null, liveSeasonGameType:g.LiveSeasonGameType ?? null,
      isSimmed:g.IsSimmed ?? g.Simmed ?? null, forceWin:g.ForceWin ?? null,
      isHumanFlag:g.IsHumanFlag ?? null, homeRequestId:g.HomeRequestId ?? null, awayRequestId:g.AwayRequestId ?? null
    }));

    function numericStat(record, keys, patterns) {
      // Match the most specific/canonical field first. Madden tables can expose
      // several similarly named fields (for example RUSHYARDS and
      // RUSHYARDSAFTER1STHIT). The previous key-first scan could select the
      // latter simply because it appeared earlier in the schema.
      for (const re of patterns) {
        for (const k of keys) {
          if (!re.test(k)) continue;
          const v=getValue(record,k);
          if(typeof v === "number" && Number.isFinite(v)) return {key:k,value:v};
        }
      }
      return null;
    }
    function resolveReferencedIndex(record, keys, patterns) {
      for(const k of keys.filter(k=>patterns.some(re=>re.test(k)))) {
        try { const ref=record.getReferenceDataByKey(k); if(ref) { const target=franchise.getReferencedRecord(ref); if(target) return String(target.index); } } catch {}
        const v=getValue(record,k);
        if(Number.isInteger(v) && v >= 0) return String(v);
        if(typeof v === "string" && /^\d+$/.test(v)) return v;
      }
      return null;
    }
    const statDefs={
      passYds:[/^(?:PASSYARDS|PASSINGYARDS)$/i,/PASS.*YARD/i,/YARDS.*PASS/i],
      passTD:[/^(?:PASSTDS|PASSINGTOUCHDOWNS)$/i,/PASS.*(?:TD|TOUCHDOWN)/i],
      passInt:[/^(?:PASSINTS|PASSINGINTERCEPTIONS)$/i,/PASS.*INT/i],
      completions:[/^(?:PASSCOMPLETED|PASSCOMPLETIONS|COMPLETIONS)$/i,/PASS.*COMPLET/i],
      attempts:[/^(?:PASSATTEMPTS|PASSINGATTEMPTS)$/i,/PASS.*ATT/i],
      rushYds:[/^(?:RUSHYARDS|RUSHINGYARDS)$/i,/^RUSHYARDS(?:TOTAL|NET)$/i,/RUSH.*YARD/i,/YARDS.*RUSH/i],
      rushTD:[/^(?:RUSHTDS|RUSHINGTOUCHDOWNS)$/i,/RUSH.*(?:TD|TOUCHDOWN)/i],
      rushAtt:[/^(?:RUSHATTEMPTS|RUSHINGATTEMPTS)$/i,/RUSH.*ATT/i],
      receptions:[/^(?:RECEIVECATCHES|RECEPTIONS|RECEIVINGRECEPTIONS)$/i,/^RECEIVECATCH(?:ES|TOTAL)$/i,/RECEIV.*CATCH/i,/RECEPT/i],
      targets:[/^(?:RECEIVETARGETS|TARGETS|PASSINGTARGETS)$/i,/RECEIV.*TARGET/i,/TARGETS?/i],
      offensiveSnaps:[/^(?:OFFENSIVESNAPS|OFFSNAPS|OFFENSIVESNAPCOUNT|SNAPCOUNT)$/i,/OFFENSIVE.*SNAP/i,/OFF.*SNAP/i,/SNAPCOUNT/i],
      recYds:[/^(?:RECEIVEYARDS|RECEIVINGYARDS)$/i,/^RECEIVEYARDS(?:TOTAL|NET)$/i,/RECEIV.*YARD/i,/YARDS.*RECEIV/i],
      recTD:[/^(?:RECEIVETDS|RECEIVINGTOUCHDOWNS)$/i,/RECEIV.*(?:TD|TOUCHDOWN)/i],
      sacks:[/^(?:DLINESACKS|SACKS|SACKSMADE)$/i,/SACK/i],
      tackles:[/^(?:DEFTACKLES|TACKLES|TOTALTACKLES)$/i,/TACKLE/i],
      defInt:[/^(?:DSECINTS|INTERCEPTIONS|DEFENSIVEINTERCEPTIONS)$/i,/DSEC.*INT/i,/DEF.*INT/i]
    };
    function tableIdOf(table){ return Number(table?.header?.tableId ?? table?.header?.id ?? 0); }
    function fieldRef(field){ try { return field?.referenceData || null; } catch { return null; } }
    function statTableInfo(name){
      const tables=franchise.getAllTablesByName(name)||[];
      return tables.map(table=>({table,tableId:tableIdOf(table)}));
    }
    const statDiagnostics = { tables:{}, byGame:{} };
    function statRowsForSeason(tableInfo, seasonGameTableId, gameCount, bucket){
      const rows=[];
      for(const {table,tableId} of tableInfo){
        const diag={seasonGameRefs:0, numericStatRows:0, skippedWrongSeasonGameTable:0, skippedOutOfRange:0};
        statDiagnostics.tables[String(tableId)] = diag;
        try { table.readRecords(); } catch { continue; }
        for(const rec of table.records||[]){
          if(!rec || rec.isEmpty) continue;
          const keys=getRecordFieldKeys(rec);
          const gameKey=keys.find(k=>/^SeasonGame$/i.test(k));
          if(!gameKey) continue;
          let ref=null; try { ref=rec.getReferenceDataByKey(gameKey); } catch {}
          if(!ref){ continue; }
          diag.seasonGameRefs++;
          if(Number(ref.tableId)!==Number(seasonGameTableId)){ diag.skippedWrongSeasonGameTable++; continue; }
          const gameIndex=Number(ref.rowNumber);
          if(!Number.isInteger(gameIndex) || gameIndex<0 || gameIndex>=gameCount){ diag.skippedOutOfRange++; continue; }
          // Keep Practice schedule rows visible in Games & Odds for now, but do not
          // let their stat rows contaminate player prop averages.
          if (practiceGameIndexes.has(String(gameIndex))) continue;
          const vals={}; const mapping=bucket.mapping;
          for(const [name,pats] of Object.entries(statDefs)){ const hit=numericStat(rec,keys,pats); if(hit){ vals[name]=hit.value; mapping[name]??=hit.key; } }
          if(Object.keys(vals).length){
            diag.numericStatRows++;
            (statDiagnostics.byGame[String(gameIndex)] ||= {rawRows:0, sources:[]}).rawRows++;
            const slot=statDiagnostics.byGame[String(gameIndex)]; if(!slot.sources.includes(String(tableId))) slot.sources.push(String(tableId));
            rows.push({rec,tableId,gameIndex,stats:vals});
          }
        }
      }
      return rows;
    }
    function addOwnerRows(playerGameStats, ownerMap, rowsByGame, statRows, source){
      for(const row of statRows){
        const owner=ownerMap.get(`${row.tableId}:${row.rec.index}`); if(owner===undefined) continue;
        const entry={playerId:String(owner),gameIndex:String(row.gameIndex),stats:row.stats,source};
        (rowsByGame[row.gameIndex] ||= []).push(entry); playerGameStats.push(entry);
      }
    }
    async function invertGameStats(){
      const playerGameStats=[]; const mappings={}; const ownerMaps={};
      const sg=franchise.getTableByName("SeasonGame"); const seasonGameTableId=tableIdOf(sg);
      const gameCount=(sg?.records||[]).length;
      const offInfo=statTableInfo("GameOffensiveStats"); const defInfo=statTableInfo("GameDefensiveStats");
      const kpOffInfo=statTableInfo("GameOffensiveKPReturnStats"); const kpDefInfo=statTableInfo("GameDefensiveKPReturnStats");
      const allInfo=[...offInfo,...defInfo,...kpOffInfo,...kpDefInfo];
      for(const x of allInfo) try { await x.table.readRecords(); } catch {}
      const ids={off:new Set(offInfo.map(x=>x.tableId)),def:new Set(defInfo.map(x=>x.tableId)),kpOff:new Set(kpOffInfo.map(x=>x.tableId)),kpDef:new Set(kpDefInfo.map(x=>x.tableId))};
      const ownerMap=new Map();
      const ptab=playerTable;
      let playersWithGameStats=0, arrayRowsVisited=0, statRefsSeen=0;
      if(ptab){
        for(const player of ptab.records||[]){
          if(!player || player.isEmpty) continue;
          const pid=String(player.index);
          let gs=null; try { gs=player.getReferenceDataByKey("GameStats"); } catch {}
          if(!gs || (Number(gs.tableId)===0 && Number(gs.rowNumber)===0)) continue;
          playersWithGameStats++;
          let arrTable=null; try { arrTable=franchise.getTableById(gs.tableId); } catch {}
          if(!arrTable) continue;
          try { await arrTable.readRecords(); } catch { continue; }
          const arrRow=arrTable.records?.[Number(gs.rowNumber)]; if(!arrRow) continue;
          const size=Number(arrRow.arraySize ?? arrTable.arraySizes?.[Number(gs.rowNumber)] ?? 0);
          let i=0;
          for(const field of arrRow.fieldsArray||[]){
            if(i>=size && size>0) break; i++;
            const ref=fieldRef(field); if(!ref) continue; const tid=Number(ref.tableId), rid=Number(ref.rowNumber);
            if(!ids.off.has(tid)&&!ids.def.has(tid)&&!ids.kpOff.has(tid)&&!ids.kpDef.has(tid)) continue;
            statRefsSeen++;
            const key=`${tid}:${rid}`; if(!ownerMap.has(key)) ownerMap.set(key,Number(player.index));
          }
          arrayRowsVisited++;
        }
      }
      const buckets={off:{mapping:{}},def:{mapping:{}},kpOff:{mapping:{}},kpDef:{mapping:{}}};
      const offRows=statRowsForSeason(offInfo,seasonGameTableId,gameCount,buckets.off);
      const defRows=statRowsForSeason(defInfo,seasonGameTableId,gameCount,buckets.def);
      const kpOffRows=statRowsForSeason(kpOffInfo,seasonGameTableId,gameCount,buckets.kpOff);
      const kpDefRows=statRowsForSeason(kpDefInfo,seasonGameTableId,gameCount,buckets.kpDef);
      const rowsByGame={};
      addOwnerRows(playerGameStats,ownerMap,rowsByGame,offRows,"offense");
      addOwnerRows(playerGameStats,ownerMap,rowsByGame,defRows,"defense");
      addOwnerRows(playerGameStats,ownerMap,rowsByGame,kpOffRows,"kpOff");
      addOwnerRows(playerGameStats,ownerMap,rowsByGame,kpDefRows,"kpDef");
      mappings.GameOffensiveStats={...buckets.off.mapping}; mappings.GameDefensiveStats={...buckets.def.mapping};
      mappings.GameOffensiveKPReturnStats={...buckets.kpOff.mapping}; mappings.GameDefensiveKPReturnStats={...buckets.kpDef.mapping};
      const ownedByGame={}; for(const r of playerGameStats) ownedByGame[String(r.gameIndex)]=(ownedByGame[String(r.gameIndex)]||0)+1;
      mappings._diagnostic={seasonGameTableId,playersWithGameStats,arrayRowsVisited,statRefsSeen,ownerLinks:ownerMap.size,offRows:offRows.length,defRows:defRows.length,kpOffRows:kpOffRows.length,kpDefRows:kpDefRows.length,statDiagnostics,ownedByGame};
      return {rows:playerGameStats,mapping:mappings};
    }
    let playerGameStats=[]; let statMappings={};
    try {
      const x=await invertGameStats(); playerGameStats=x.rows; statMappings=x.mapping;
    } catch(e) { statMappings={error:String(e)}; }

    // Completion must survive simulated franchise progression. Madden can advance
    // a large block of games with final scores/statuses but without generating
    // player-stat rows for every simulated game. IsSimmed is the authoritative
    // signal for those games; human-played games are covered by their SeasonGame-
    // Linked stat rows are useful only when they contain actual game activity.
    // Madden can pre-create zero-filled GameStats rows for future/unsimmed games,
    // so the mere existence of a SeasonGame reference is NOT proof that a game
    // was played. A real NFL game should have at least one non-zero recorded stat
    // across the offensive/defensive stat rows we can decode.
    const meaningfulStatGameIndexes = new Set();
    const statRowsByGame = new Map();
    for (const r of playerGameStats) {
      const key=String(r.gameIndex);
      const rows=statRowsByGame.get(key)||[]; rows.push(r); statRowsByGame.set(key,rows);
      if (Object.values(r.stats||{}).some(v => Number.isFinite(Number(v)) && Number(v) > 0)) meaningfulStatGameIndexes.add(key);
    }
    const statGameIndexes = meaningfulStatGameIndexes;
    const hasTerminalOutcome = g => {
      const status = String(g.GameStatus || '');
      return /AwayWon|HomeWon|Tied|StatsReported/i.test(status) || [2,3,4,7].includes(Number(g.GameStatus));
    };
    const isSimulated = g => {
      const v = g.IsSimmed ?? g.Simmed;
      return v === true || Number(v) === 1 || /^true$/i.test(String(v || '').trim());
    };
    // IMPORTANT: phase detection must use the same played-game signal as the
    // known-good 1.5.45 schedule build. Career saves can begin at the regular
    // season, so broad terminal-score/current-week heuristics can make the
    // preseason block look like the regular block and flip the phases.
    const isGamePlayedForPhase = g => {
      const statusPlayed = /AwayWon|HomeWon|Tied|StatsReported/i.test(String(g.GameStatus || '')) || [2,3,4,7].includes(Number(g.GameStatus));
      return statusPlayed && meaningfulStatGameIndexes.has(String(g.index));
    };
    const isGamePlayed = g => {
      // A Madden schedule row can contain stale/placeholder scores, terminal
      // GameStatus values, and even IsSimmed flags before the active franchise
      // week has actually been advanced. In particular, CPU matchups in the
      // active week may carry IsSimmed=1 as a schedule/default flag. Never use
      // that flag to turn the current week's games into FINAL.
      if (isGamePlayedForPhase(g)) return true;

      const seasonWeek = Number(g.SeasonWeek);
      const maddenWeek = Number.isFinite(seasonWeek) ? seasonWeek + 1 : null;
      const activeWeek = Number(activeSeasonWeek);

      // For the active regular-season week, only SeasonGame-linked player stats
      // are strong enough to prove a game was actually played. This prevents
      // stale scores/statuses/IsSimmed values from removing markets from the
      // current week's board.
      const isActiveRegularWeek = String(g.LiveSeasonGameType || '').toLowerCase() === 'regular'
        && Number.isFinite(maddenWeek) && Number.isFinite(activeWeek)
        && maddenWeek === activeWeek;
      // Do not use IsSimmed/Simmed as a completion signal. Madden can carry
      // that flag on CPU schedule rows before the user has actually completed
      // the week. Meaningful linked stats are the authoritative regular-season
      // completion signal for both the active week and older weeks.
      if (isActiveRegularWeek) return meaningfulStatGameIndexes.has(String(g.index));
      return meaningfulStatGameIndexes.has(String(g.index));
    };

    // Build one authoritative schedule list with a phase assigned to every playable game.
    // Madden stores preseason and regular-season records in overlapping SeasonWeek values,
    // so the UI must never use SeasonWeek alone as the selector. For Weeks 1-3, the
    // SeasonGame table contains 16 preseason records followed by 16 regular-season records.
    const earlyPrimaryIndexes = new Set();
    const earlyPreseasonIndexes = new Set();
    const earlyPhaseDiagnostics = [];
    const isPlayedForPhase = g => isGamePlayedForPhase(g);
    // The two Madden schedule blocks can be stored in opposite table order depending
    // on the franchise/save. Use SeasonGame-linked player stat rows as the authoritative
    // completion signal; this is important because SportsbookDev has Weeks 1-3 completed
    // while Career Test may be fresh.
    const earlyRowsByWeek = new Map();
    for (const w of [0, 1, 2]) {
      const rows = resolvedGames.filter(g => {
        if (Number(g.SeasonWeek) !== w) return false;
        const away = String(g.awayTeamResolved?.name || '').trim().toLowerCase();
        const home = String(g.homeTeamResolved?.name || '').trim().toLowerCase();
        return away !== 'practice' && home !== 'practice' && Number.isFinite(Number(g.index));
      }).sort((a, b) => Number(a.index) - Number(b.index));
      earlyRowsByWeek.set(w, rows);
    }
    const firstHalf = [];
    const secondHalf = [];
    for (const rows of earlyRowsByWeek.values()) {
      if (rows.length >= 32) {
        firstHalf.push(...rows.slice(0, 16));
        secondHalf.push(...rows.slice(-16));
      } else if (rows.length >= 16) {
        const split = Math.floor(rows.length / 2);
        firstHalf.push(...rows.slice(0, split));
        secondHalf.push(...rows.slice(split));
      }
    }
    const firstPlayed = firstHalf.filter(isPlayedForPhase).length;
    const secondPlayed = secondHalf.filter(isPlayedForPhase).length;
    const regularIsFirst = firstPlayed > secondPlayed;
    for (const [w, rows] of earlyRowsByWeek.entries()) {
      if (rows.length >= 32) {
        const first = rows.slice(0, 16);
        const second = rows.slice(-16);
        const preseason = regularIsFirst ? second : first;
        const regular = regularIsFirst ? first : second;
        for (const g of preseason) earlyPreseasonIndexes.add(String(g.index));
        for (const g of regular) earlyPrimaryIndexes.add(String(g.index));
        earlyPhaseDiagnostics.push({week:w+1, firstPlayed:first.filter(isPlayedForPhase).length, secondPlayed:second.filter(isPlayedForPhase).length, regularBlock:regularIsFirst?'first':'second'});
      } else if (rows.length >= 16) {
        const split = Math.floor(rows.length / 2);
        const first = rows.slice(0, split);
        const second = rows.slice(split);
        const preseason = regularIsFirst ? second : first;
        const regular = regularIsFirst ? first : second;
        for (const g of preseason) earlyPreseasonIndexes.add(String(g.index));
        for (const g of regular) earlyPrimaryIndexes.add(String(g.index));
      }
    }

    const normalizePhaseToken = value => String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
    const isSuperBowlToken = value => {
      const t = normalizePhaseToken(value).replace(/\s+/g, '');
      return t === 'superbowl' || t === 'superbowlweek' || t === 'superbowlgame';
    };
    const isPlayoffToken = value => {
      const t = normalizePhaseToken(value);
      return t.includes('playoff') || t.includes('wild card') || t.includes('divisional') ||
        t.includes('conference championship') || t.includes('conference final') || t === 'nfc' || t === 'afc';
    };

    const scheduleGames = [];
    let ignoredEarlyAuxiliaryRows = 0;
    for (const g of resolvedGames) {
      const w = Number(g.SeasonWeek);
      const away = String(g.awayTeamResolved?.name || '').trim().toLowerCase();
      const home = String(g.homeTeamResolved?.name || '').trim().toLowerCase();
      const isPractice = away === 'practice' || home === 'practice';
      if (isPractice) continue;

      let phase = 'regular';
      let phaseWeek = Number.isFinite(w) ? w + 1 : 1;
      let phaseLabel = 'Regular Season';
      let phaseOrder = 1;

      const stageValues = [g.LiveSeasonGameType, g.WeekType].filter(Boolean);
      // Madden 27 can stamp the same early SeasonWeek rows with misleading or
      // recycled phase tokens in multi-user franchises. For Weeks 1-3, the
      // block assignment below is authoritative; raw Regular/Preseason tokens
      // must NOT override it. Super Bowl/playoff tokens remain authoritative.
      if (stageValues.some(isSuperBowlToken)) {
        phase = 'superbowl'; phaseLabel = 'Super Bowl'; phaseWeek = 1; phaseOrder = 4;
      } else if (stageValues.some(isPlayoffToken) || w >= 18) {
        phase = 'playoffs'; phaseLabel = 'Playoffs'; phaseWeek = Math.max(1, w - 17); phaseOrder = 3;
      } else if (w >= 0 && w <= 2 && earlyPreseasonIndexes.has(String(g.index))) {
        phase = 'preseason'; phaseLabel = 'Preseason'; phaseWeek = w + 1; phaseOrder = 0;
      } else if (w >= 0 && w <= 2 && earlyPrimaryIndexes.has(String(g.index))) {
        phase = 'regular'; phaseLabel = 'Regular Season'; phaseWeek = w + 1; phaseOrder = 1;
      } else if (w >= 0 && w <= 2) {
        // Early Madden SeasonWeek values are shared by preseason and regular season.
        // In multi-user franchises Madden can expose auxiliary/duplicate SeasonGame
        // rows between the two real 16-game blocks. Those rows must NOT silently fall
        // through into Regular Season Week 1-3; doing so can turn a 16-game slate into
        // dozens of phantom matchups (especially when all 32 teams are user-controlled).
        // Only the two authoritative early blocks selected above are sportsbook games.
        // Rows with explicit playoff/super-bowl tokens were already handled above.
        ignoredEarlyAuxiliaryRows++;
        continue;
      } else if (w >= 3 && w <= 17) {
        phase = 'regular'; phaseLabel = 'Regular Season'; phaseWeek = w + 1; phaseOrder = 1;
      } else {
        phase = 'playoffs'; phaseLabel = 'Playoffs'; phaseWeek = Math.max(1, w - 17); phaseOrder = 3;
      }

      g.phase = phase;
      g.phaseLabel = phaseLabel;
      g.phaseWeek = phaseWeek;
      g.phaseOrder = phaseOrder;
      g.isPreseason = phase === 'preseason';
      scheduleGames.push(g);
    }

    // 1.7.72: Validate team-reference resolution against the one-game-per-team
    // invariant. In some multi-user franchise saves, getReferencedRecord() can
    // resolve multiple different SeasonGame references to the same team. Do not
    // change phase/week classification here: only repair a side when (a) that
    // resolved team is duplicated in this phase/week, (b) the decoded Team-table
    // record points to a different real team, and (c) assigning that team removes
    // a conflict instead of creating another one. This is data-driven; no SF or
    // Practice-specific override.
    const identityForTeam = t => {
      const name = String(t?.name || '').trim().toLowerCase();
      if (!name || name === 'practice') return null;
      return String(t?.abbreviation || name).trim().toUpperCase();
    };
    const phaseWeekGroups = new Map();
    for (const g of scheduleGames) {
      const k = `${g.phase}|${g.phaseWeek}`;
      const arr = phaseWeekGroups.get(k) || [];
      arr.push(g);
      phaseWeekGroups.set(k, arr);
    }
    for (const [groupKey, rows] of phaseWeekGroups) {
      if (!(groupKey.startsWith('regular|') || groupKey.startsWith('preseason|'))) continue;
      for (let pass = 0; pass < 3; pass++) {
        const appearances = new Map();
        for (const g of rows) {
          for (const side of ['away', 'home']) {
            const id = identityForTeam(g[side === 'away' ? 'awayTeamResolved' : 'homeTeamResolved']);
            if (id) appearances.set(id, (appearances.get(id) || 0) + 1);
          }
        }
        let changed = false;
        for (const g of rows) {
          const rec = seasonGame.records[g.index];
          for (const side of ['away', 'home']) {
            const prop = side === 'away' ? 'awayTeamResolved' : 'homeTeamResolved';
            const field = side === 'away' ? 'AwayTeam' : 'HomeTeam';
            const current = g[prop];
            const currentId = identityForTeam(current);
            if (!currentId || (appearances.get(currentId) || 0) <= 1) continue;
            const recordIndex = decodeScheduleRecordIndex(g[field]);
            const direct = recordIndex === null ? null : teamRecordMap.get(String(recordIndex));
            const directId = identityForTeam(direct);
            if (!directId || directId === currentId) continue;
            const opponent = g[side === 'away' ? 'homeTeamResolved' : 'awayTeamResolved'];
            if (directId === identityForTeam(opponent)) continue;
            // Candidate must be unused by any other game in this phase/week.
            const candidateAlreadyScheduled = rows.some(other => other !== g &&
              (identityForTeam(other.awayTeamResolved) === directId || identityForTeam(other.homeTeamResolved) === directId));
            if (candidateAlreadyScheduled) continue;
            g[prop] = direct;
            changed = true;
            console.log(`[M27 schedule-check] ${groupKey} row ${g.index}: corrected ${side} team reference ${current?.name} -> ${direct?.name}`);
          }
        }
        if (!changed) break;
      }
    }

    // 32-user franchises can expose duplicate/auxiliary SeasonGame rows that resolve
    // one real team (notably SF) onto multiple opponents. A real NFL schedule can only
    // have one game per team per phase/week. Keep the existing phase assignment intact,
    // then enforce that invariant without changing the single-user schedule path.
    const integrityKey = g => `${g.phase}|${g.phaseWeek}`;
    const teamIdentity = t => {
      const n = String(t?.name || '').trim().toLowerCase();
      if (!n || n === 'practice') return null;
      const ab = String(t?.abbreviation || '').trim().toUpperCase();
      return ab || n;
    };
    const resolutionScore = g => {
      const rec = seasonGame.records[g.index];
      let score = 0;
      for (const field of ['AwayTeam','HomeTeam']) {
        const base = resolveTeam(rec, field);
        const direct = teamRecordMap.get(String(decodeScheduleRecordIndex(g[field])));
        const bn = String(base?.name || '').trim().toLowerCase();
        const dn = String(direct?.name || '').trim().toLowerCase();
        if (bn && bn !== 'practice') score += 4;
        if (dn && dn !== 'practice') score += 2;
        if (bn && dn && bn === dn) score += 3;
      }
      // Prefer the canonical early 16-game range when duplicate rows share teams.
      const n = Number(g.SeasonGameNum);
      if (Number.isFinite(n) && n >= 0 && n < 16) score += 1;
      return score;
    };
    const integrityGroups = new Map();
    for (const g of scheduleGames) {
      const k = integrityKey(g);
      const arr = integrityGroups.get(k) || [];
      arr.push(g);
      integrityGroups.set(k, arr);
    }
    const integrityFiltered = [];
    for (const [key, rows] of integrityGroups.entries()) {
      // Only intervene when a phase/week contains more games than the NFL slate.
      // Normal single-team saves are left byte-for-byte in their existing order.
      const expected = key.startsWith('preseason|') || key.startsWith('regular|') ? 16 : null;
      if (!expected || rows.length <= expected) {
        integrityFiltered.push(...rows);
        continue;
      }
      const ranked = rows.map((g, i) => ({ g, i, score: resolutionScore(g) }))
        .sort((a,b) => (b.score-a.score) || (Number(a.g.SeasonGameNum)-Number(b.g.SeasonGameNum)) || (Number(a.g.index)-Number(b.g.index)));
      const used = new Set();
      const chosen = [];
      for (const item of ranked) {
        const a = teamIdentity(item.g.awayTeamResolved);
        const h = teamIdentity(item.g.homeTeamResolved);
        if (!a || !h || a === h || used.has(a) || used.has(h)) continue;
        chosen.push(item.g); used.add(a); used.add(h);
        if (chosen.length >= expected) break;
      }
      // If the resolver cannot form a complete 16-game matching, keep the original
      // phase-filtered rows rather than deleting legitimate games.
      if (chosen.length === expected) {
        chosen.sort((a,b) => (Number(a.SeasonGameNum)-Number(b.SeasonGameNum)) || (Number(a.index)-Number(b.index)));
        integrityFiltered.push(...chosen);
      } else {
        integrityFiltered.push(...rows);
      }
    }
    if (integrityFiltered.length !== scheduleGames.length) {
      scheduleGames.length = 0;
      scheduleGames.push(...integrityFiltered);
    }

    // Finalize completion after phase assignment. Phase progression is important here:
    // Madden's SeasonInfo.CurrentWeek can reset/rebase during the playoffs, so comparing
    // a playoff SeasonWeek (often 18+) directly to CurrentWeek can incorrectly leave a
    // completed playoff game pending. Once a playoff/Super Bowl row has a terminal
    // Madden result, treat that row as played; regular-season rows continue using the
    // stronger stat/sim/current-week signals above.
    for (const g of scheduleGames) {
      const phaseTerminal = (g.phase === 'playoffs' || g.phase === 'superbowl') && hasTerminalOutcome(g);
      g.isPlayed = isGamePlayed(g) || (g.phase === 'preseason' && hasTerminalOutcome(g)) || phaseTerminal;
    }

    const regularSeasonGames = scheduleGames.filter(g => g.phase === 'regular');
    const phaseCounts = {preseason:0, regular:0, playoffs:0, superbowl:0};
    for (const g of scheduleGames) if (phaseCounts[g.phase] !== undefined) phaseCounts[g.phase]++;

    // Build current records using only games that have an actual recorded stat
    // line and are at/before Madden's authoritative current week.
    const teamStats = new Map();
    const ensure = (id, info) => {
      if (!id) return;
      if (!teamStats.has(id)) teamStats.set(id, { id, name: info?.name || null, abbreviation: info?.abbreviation || null, wins: 0, losses: 0, ties: 0, pf: 0, pa: 0, games: 0 });
      const t = teamStats.get(id); if (info) { t.name ||= info.name; t.abbreviation ||= info.abbreviation; }
      return t;
    };
    for (const g of scheduleGames) {
      const a = ensure(String(g.AwayTeam), g.awayTeamResolved); const h = ensure(String(g.HomeTeam), g.homeTeamResolved);
      if (!a || !h) continue;
      const hs = Number(g.HomeScore) || 0, as = Number(g.AwayScore) || 0;
      const played = isGamePlayed(g);
      const gameWeek = Number(g.SeasonWeek);
      if (played && Number.isFinite(gameWeek) && gameWeek <= activeSeasonWeek) {
        a.games++; h.games++; a.pf += as; a.pa += hs; h.pf += hs; h.pa += as;
        if (as > hs) { a.wins++; h.losses++; } else if (hs > as) { h.wins++; a.losses++; } else { a.ties++; h.ties++; }
      }
    }
    const teamList = [...teamStats.values()].sort((a,b) => (b.wins-a.wins) || (b.pf-b.pa)-(a.pf-a.pa) || String(a.name||a.id).localeCompare(String(b.name||b.id)));
    // Do not overwrite the phase-aware completion flag above.
    // resolvedGames may include practice/non-playable rows; scheduleGames is the
    // authoritative set used by the sportsbook UI.

    const propTotals=new Map();
    for(const r of playerGameStats) {
      const p=playerMap.get(String(r.playerId)); if(!p) continue;
      const t=propTotals.get(r.playerId)||{playerId:r.playerId,name:p.name,position:p.position,teamId:p.teamId,teamIndex:p.teamIndex??null,teamName:p.teamName||null,teamAbbreviation:p.teamAbbreviation||null,games:new Set(),sum:{}};
      t.games.add(r.gameIndex);
      if(r.teamIndex!==null){t.teamIndex=r.teamIndex;}
      if(r.teamName){t.teamName=r.teamName;t.teamAbbreviation=r.teamAbbreviation||t.teamAbbreviation;}
      for(const [k,v] of Object.entries(r.stats)) t.sum[k]=(t.sum[k]||0)+Number(v);
      propTotals.set(r.playerId,t);
    }
    const playerProps=[];
    const historicalPropPlayerIds=new Set();
    for(const t of propTotals.values()) {
      const gp=t.games.size; if(!gp) continue; const s=t.sum;
      const before=playerProps.length;
      const push=(stat,label,kind,eligible)=>{ if(!eligible || !Number.isFinite(s[stat])) return; const avg=s[stat]/gp; const line=Math.max(0,Math.round(avg*2)/2); if(line<=0) return; playerProps.push({playerId:t.playerId,name:t.name,position:t.position,teamId:t.teamId,teamIndex:t.teamIndex,teamName:t.teamName,teamAbbreviation:t.teamAbbreviation,stat,label,kind,line,games:gp,average:Number(avg.toFixed(2)),source:'historical'}); };
      push("passYds","Passing Yards","passYds",(s.attempts||0)>=10); push("passTD","Passing TDs","passTD",(s.attempts||0)>=10); push("completions","Completions","completions",(s.attempts||0)>=10);
      push("rushYds","Rushing Yards","rushYds",(s.rushAtt||0)>=5); push("rushAtt","Rushing Attempts","rushAtt",(s.rushAtt||0)>=5); push("recYds","Receiving Yards","recYds",(s.receptions||0)>=5); push("receptions","Receptions","receptions",(s.receptions||0)>=5);
      if(playerProps.length>before) historicalPropPlayerIds.add(String(t.playerId));
    }

    // Some Madden franchises (especially fresh/newly-created franchises) do not
    // expose usable GameStats rows yet. Do not fall back to the bundled developer
    // save. Instead, build a lightweight projection directly from the CURRENT
    // imported franchise's Player table. This keeps props available before the
    // franchise has accumulated enough completed-game samples.
    let propSource='historical';
    {
      // Keep roster-based markets available for upcoming teams even after the first
      // completed game creates historical markets for only that game's players.
      // Prefer historical samples for players who already have them; project the
      // remaining eligible roster players from this imported franchise.
      if(playerProps.length===0) propSource='rosterProjection';
      else propSource='mixedProjection';
      const numericField=(rec, candidates, matcher)=>{
        const keys=getRecordFieldKeys(rec);
        for(const c of candidates){
          const k=keys.find(x=>String(x).toLowerCase()===String(c).toLowerCase());
          if(k){ const v=Number(getValue(rec,k)); if(Number.isFinite(v)) return v; }
        }
        const k=keys.find(x=>matcher.test(String(x)));
        if(k){ const v=Number(getValue(rec,k)); if(Number.isFinite(v)) return v; }
        return null;
      };
      const ratingFor=(rec)=>{
        const v=numericField(rec,['Overall','OverallRating','OVR','OverallValue'],/^(overall|ovr)(rating|value)?$/i);
        return Number.isFinite(v)?Math.max(50,Math.min(99,v)):75;
      };
      const groups=new Map();
      for(const rec of playerTable?.records||[]){
        if(!rec || rec.isEmpty) continue;
        const p=playerMap.get(String(rec.index)); if(!p || p.teamIndex===null || p.teamIndex===undefined || !p.position) continue;
        if(historicalPropPlayerIds.has(String(p.id))) continue;
        if(!['QB','HB','FB','WR','TE'].includes(String(p.position).toUpperCase())) continue;
        const ovr=ratingFor(rec);
        const key=String(p.teamIndex);
        const arr=groups.get(key)||[]; arr.push({...p,ovr}); groups.set(key,arr);
      }
      for(const arr of groups.values()){
        arr.sort((a,b)=>b.ovr-a.ovr);
        const used=new Set();
        const positionCounts=new Map();
        for(const p of arr){
          if(used.has(p.id)) continue;
          const pos=String(p.position).toUpperCase();
          const limit=pos==='QB'?1:(pos==='HB'||pos==='FB'?2:4);
          const count=positionCounts.get(pos)||0;
          if(count>=limit) continue;
          let markets=[];
          if(pos==='QB'){
            const passYds=Math.round((205+(p.ovr-70)*3.0)/5)*5;
            const passTD=Math.max(0.5,Math.round((1.25+(p.ovr-70)*0.035)*2)/2);
            const comp=Math.max(12,Math.round((18+(p.ovr-70)*0.16)));
            markets=[['passYds','Passing Yards','passYds',passYds],['passTD','Passing TDs','passTD',passTD],['completions','Completions','completions',comp]];
          } else if(pos==='HB' || pos==='FB'){
            const rushYds=Math.round((48+(p.ovr-70)*1.55)/5)*5;
            const rushAtt=Math.max(8,Math.round(14+(p.ovr-70)*0.22));
            const recYds=Math.round((18+(p.ovr-70)*0.45)/5)*5;
            markets=[['rushYds','Rushing Yards','rushYds',rushYds],['rushAtt','Rushing Attempts','rushAtt',rushAtt],['recYds','Receiving Yards','recYds',recYds]];
          } else {
            const recYds=Math.round((42+(p.ovr-70)*1.05)/5)*5;
            const receptions=Math.max(2,Math.round(4+(p.ovr-70)*0.07));
            markets=[['recYds','Receiving Yards','recYds',recYds],['receptions','Receptions','receptions',receptions]];
          }
          for(const [stat,label,kind,line] of markets){
            playerProps.push({playerId:p.id,name:p.name,position:p.position,teamId:p.teamId,teamIndex:p.teamIndex,teamName:p.teamName,teamAbbreviation:p.teamAbbreviation,stat,label,kind,line,games:0,average:null,source:'rosterProjection'});
          }
          used.add(p.id);
          positionCounts.set(pos,count+1);
          // Keep projection volume sane: top 1 QB, 2 backs, and 4 pass catchers per team.
          // Continue scanning so every offensive position can receive its own limit.

        }
      }
    }

    const weeks = [...new Set(regularSeasonGames.map(g => Number(g.SeasonWeek)).filter(Number.isFinite))].sort((a,b)=>a-b);
    const gamesByWeek = {}; for (const g of scheduleGames) gamesByWeek[g.SeasonWeek] = (gamesByWeek[g.SeasonWeek] || 0) + 1;
    const phaseWeeks = {};
    for (const phase of ['preseason','regular','playoffs','superbowl']) {
      phaseWeeks[phase] = [...new Set(scheduleGames.filter(g => g.phase === phase).map(g => Number(g.phaseWeek)).filter(Number.isFinite))].sort((a,b)=>a-b);
    }

    const playersWithTeam = [...playerMap.values()].filter(p => p.teamIndex !== null).length;
    return { ok:true, version:"1.7.65", fileName:path.basename(filePath), gameYear:franchise.gameYear, gameType:franchise.gameType,
      summary:{seasonGameRecords:games.length, playableGames:regularSeasonGames.length, allPlayableGames:scheduleGames.length, preseasonGames:phaseCounts.preseason, phaseCounts, phaseWeeks, playerRecords:playerCount, playersWithTeam, weeksFound:weeks, gamesByWeek, activeSeasonWeek, activeDisplayWeek:activeSeasonWeek + 1, completedGameCount:statGameIndexes.size, playerGameStatRows:playerGameStats.length, playerPropMarkets:playerProps.length, playerPropSource:propSource, practiceGameCount:practiceGameIndexes.size, gameTimeField:detectedGameTimeField || (games.some(g => g.GameTimeSource === "TimeOfDay(raw)") ? "TimeOfDay(raw)" : null), gameTimeValuesFound:resolvedGames.filter(g => g.gameTimeMinutes !== null).length, teamIndexZeroSchedule, statMappings},
      games:scheduleGames, teams:teamList, playerSample, players:[...playerMap.values()], playerProps, playerGameStats,
      diagnostics:{allPlayableGames:scheduleGames.length, regularSeasonGames:regularSeasonGames.length, preseasonGames:phaseCounts.preseason, phaseCounts, phaseWeeks, ignoredEarlyAuxiliaryRows} };
  } catch (error) { return { ok:false, error:String(error?.stack || error) }; }
}
ipcMain.handle("parse-franchise", async (_event, filePath) => { lastImportedPath = filePath; watchImportedSave(lastImportedPath); return parseFranchise(filePath); });
