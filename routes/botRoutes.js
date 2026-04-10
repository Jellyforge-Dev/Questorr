import { Router } from "express";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import { createRequire } from "module";
import axios from "axios";
import { authenticateToken } from "../utils/auth.js";
import { botState, pendingRequests } from "../bot/botState.js";
import { getCommandStats, resetCommandStats } from "../bot/commandStats.js";
import cache from "../utils/cache.js";
import logger from "../utils/logger.js";

const require = createRequire(import.meta.url);
const { version: APP_VERSION } = require("../package.json");

const router = Router();

const botControlLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
});

// Widget API key validation middleware
function authenticateWidget(req, res, next) {
  const configuredKey = process.env.WIDGET_API_KEY;
  // API key must be configured — reject if not set
  if (!configuredKey) {
    return res.status(503).json({ error: "Widget API key not configured. Set WIDGET_API_KEY in the dashboard." });
  }

  const providedKey = req.query.key || req.headers["x-widget-key"] || "";
  // Timing-safe comparison to prevent side-channel attacks
  try {
    const a = Buffer.from(String(providedKey));
    const b = Buffer.from(String(configuredKey));
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return next();
  } catch (_) { /* length mismatch or invalid input */ }

  return res.status(403).json({ error: "Invalid or missing widget API key" });
}

/** Format seconds into "Xh XXm XXs" */
function formatUptime(seconds) {
  return `${Math.floor(seconds / 3600)}h ${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}m ${String(Math.floor(seconds % 60)).padStart(2, "0")}s`;
}

/** Get bot uptime in seconds (0 when stopped) */
function getBotUptime() {
  if (!botState.isBotRunning || !botState.botStartedAt) return 0;
  return (Date.now() - botState.botStartedAt) / 1000;
}

// ─── Health Check (public: minimal, authenticated: full details) ─────────────
async function collectHealthData() {
  const botUptime = getBotUptime();
  const cacheStats = cache.getStats();
  const totalHits = cacheStats.tmdb.hits + cacheStats.seerr.hits;
  const totalMisses = cacheStats.tmdb.misses + cacheStats.seerr.misses;
  const totalKeys = cacheStats.tmdb.keys + cacheStats.seerr.keys;

  const services = {};
  const checks = [];

  if (process.env.SEERR_URL && process.env.SEERR_API_KEY) {
    const seerrBase = process.env.SEERR_URL.replace(/\/+$/, "");
    checks.push(
      axios.get(`${seerrBase}/api/v1/status`, {
        headers: { "X-Api-Key": process.env.SEERR_API_KEY },
        timeout: 3000,
      }).then(() => { services.seerr = "reachable"; })
        .catch(() => { services.seerr = "unreachable"; })
    );
  } else {
    services.seerr = "not_configured";
  }

  if (process.env.JELLYFIN_BASE_URL && process.env.JELLYFIN_API_KEY) {
    const jfBase = process.env.JELLYFIN_BASE_URL.replace(/\/+$/, "");
    checks.push(
      axios.get(`${jfBase}/System/Info`, {
        headers: { "X-Emby-Token": process.env.JELLYFIN_API_KEY },
        timeout: 3000,
      }).then(() => { services.jellyfin = "reachable"; })
        .catch(() => { services.jellyfin = "unreachable"; })
    );
  } else {
    services.jellyfin = "not_configured";
  }

  if (process.env.TMDB_API_KEY) {
    checks.push(
      axios.get("https://api.themoviedb.org/3/configuration", {
        params: { api_key: process.env.TMDB_API_KEY },
        timeout: 3000,
      }).then(() => { services.tmdb = "reachable"; })
        .catch(() => { services.tmdb = "unreachable"; })
    );
  } else {
    services.tmdb = "not_configured";
  }

  await Promise.allSettled(checks);

  const allReachable = Object.values(services).every(s => s !== "unreachable");

  return {
    status: allReachable ? "healthy" : "degraded",
    version: APP_VERSION,
    uptime: Math.floor(botUptime),
    uptimeFormatted: formatUptime(botUptime),
    bot: {
      running: botState.isBotRunning,
      username: botState.isBotRunning && botState.discordClient?.user ? botState.discordClient.user.tag : null,
      connected: botState.discordClient?.ws?.status === 0,
    },
    services,
    pendingRequests: pendingRequests.size,
    commandStats: getCommandStats(),
    cache: {
      hits: totalHits,
      misses: totalMisses,
      keys: totalKeys,
      hitRate: totalHits + totalMisses > 0 ? ((totalHits / (totalHits + totalMisses)) * 100).toFixed(2) + "%" : "0%",
      tmdb: cacheStats.tmdb,
      seerr: cacheStats.seerr,
    },
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + " MB",
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + " MB",
    },
    timestamp: new Date().toISOString(),
  };
}

// Public health check — Docker HEALTHCHECK / Uptime Kuma (minimal info)
router.get("/health", async (_req, res) => {
  const data = await collectHealthData();
  res.json({
    status: data.status,
    version: data.version,
    bot: { running: data.bot.running },
    timestamp: data.timestamp,
  });
});

// Authenticated health check — full details for dashboard/admins
router.get("/health/details", authenticateToken, async (_req, res) => {
  res.json(await collectHealthData());
});

// ─── Widget Stats (JSON, protected by API key) ─────────────────────────────
router.get("/widget/stats", authenticateWidget, (req, res) => {
  const botUptime = getBotUptime();
  const cacheStats = cache.getStats();
  const cmdStats = getCommandStats();

  res.json({
    status: botState.isBotRunning ? "online" : "offline",
    botUsername: botState.isBotRunning && botState.discordClient?.user ? botState.discordClient.user.tag : null,
    uptime: Math.floor(botUptime),
    uptimeFormatted: formatUptime(botUptime),
    pendingRequests: pendingRequests.size,
    cacheKeys: cacheStats.tmdb.keys + cacheStats.seerr.keys,
    memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    version: APP_VERSION,
    commandStats: cmdStats,
    timestamp: new Date().toISOString(),
  });
});

// ─── Reset Command Stats (widget) ───────────────────────────────────────────
router.post("/widget/reset-stats", authenticateWidget, (req, res) => {
  resetCommandStats();
  res.json({ success: true, message: "Command stats reset" });
});

// ─── Embeddable HTML Widget (Questorr theme, fully responsive) ──────────────
router.get("/widget/embed", authenticateWidget, (req, res) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const apiKey = req.query.key || "";
  const keyParam = apiKey ? `?key=${encodeURIComponent(apiKey)}` : "";
  const logoUrl = `${baseUrl}/assets/logo-transparent.png`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Questorr Widget</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden}
body{font-family:'Inter',system-ui,sans-serif;background:transparent;color:#c9d1d9;display:flex;align-items:stretch;justify-content:stretch}
.widget{background:linear-gradient(135deg,#111827 0%,#0d1321 100%);border-radius:12px;padding:clamp(12px,3vw,20px);border:1px solid rgba(30,200,160,0.15);width:100%;height:100%;display:flex;flex-direction:column;overflow:hidden}
.header{display:flex;align-items:center;gap:8px;margin-bottom:clamp(8px,2vw,14px);flex-shrink:0}
.logo{width:24px;height:24px;border-radius:5px;object-fit:contain}
.header h2{font-size:clamp(14px,3.5vw,17px);font-weight:700;color:#e6edf3;flex:1}
.dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
.dot.online{background:#1ec8a0;box-shadow:0 0 8px rgba(30,200,160,0.6)}
.dot.offline{background:#f38ba8;box-shadow:0 0 8px rgba(243,139,168,0.5)}
.bot-info{font-size:11px;color:#8b949e;margin-bottom:clamp(8px,2vw,12px);display:flex;justify-content:space-between;flex-shrink:0}
.stats{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:clamp(8px,2vw,12px);flex-shrink:0}
.stat{background:rgba(30,200,160,0.06);border:1px solid rgba(30,200,160,0.1);border-radius:8px;padding:clamp(6px,1.5vw,10px) 6px;text-align:center}
.stat .v{font-size:clamp(15px,4vw,20px);font-weight:700;color:#1ec8a0}
.stat .l{font-size:clamp(8px,2vw,10px);color:#8b949e;margin-top:2px;text-transform:uppercase;letter-spacing:0.5px}
.section{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;margin-bottom:clamp(6px,1.5vw,12px)}
.cmd-list{display:flex;flex-direction:column;gap:3px;overflow-y:auto;flex:1;min-height:0;scrollbar-width:thin;scrollbar-color:rgba(30,200,160,0.2) transparent}
.cmd-row{display:flex;align-items:center;gap:6px;padding:5px 8px;background:rgba(255,255,255,0.03);border-radius:6px;font-size:11px;flex-shrink:0}
.cmd-name{color:#c9d1d9;font-weight:500;flex:1}
.cmd-count{color:#1ec8a0;font-weight:700;font-size:12px}
.cmd-bar{height:3px;border-radius:2px;background:rgba(30,200,160,0.15);flex:0 0 50px;overflow:hidden}
.cmd-bar-fill{height:100%;background:linear-gradient(90deg,#1ec8a0,#17b8c4);border-radius:2px}
.toggle-btn{width:100%;padding:clamp(7px,2vw,10px);border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;transition:all 0.2s;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:5px;flex-shrink:0}
.toggle-btn:hover{opacity:0.9}
.toggle-btn:disabled{opacity:0.4;cursor:not-allowed}
.toggle-btn.start{background:linear-gradient(135deg,#1ec8a0,#17b8c4);color:#0b0f19}
.toggle-btn.stop{background:linear-gradient(135deg,#f38ba8,#e74c3c);color:#fff}
.btn-row{display:flex;gap:6px;flex-shrink:0}
.btn-row .toggle-btn{flex:1}
.reset-btn{padding:clamp(7px,2vw,10px);border:1px solid rgba(30,200,160,0.2);border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;transition:all 0.2s;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:4px;flex-shrink:0;background:transparent;color:#8b949e}
.reset-btn:hover{background:rgba(30,200,160,0.08);color:#1ec8a0;border-color:rgba(30,200,160,0.3)}
.reset-btn:disabled{opacity:0.4;cursor:not-allowed}
.err{color:#f38ba8;font-size:10px;margin-top:5px;text-align:center;min-height:12px;flex-shrink:0}
.ver{font-size:9px;color:#484f58;text-align:right;flex-shrink:0;margin-top:auto;padding-top:4px}
.user-card{padding:6px 8px;background:rgba(255,255,255,0.03);border-radius:6px;flex-shrink:0}
.user-header{display:flex;align-items:center;gap:6px;margin-bottom:4px}
.user-avatar{width:20px;height:20px;border-radius:50%;flex-shrink:0;object-fit:cover}
.user-avatar-placeholder{width:20px;height:20px;border-radius:50%;flex-shrink:0;background:rgba(30,200,160,0.15);display:flex;align-items:center;justify-content:center;font-size:9px;color:#8b949e;font-weight:600}
.user-rank{color:#484f58;font-weight:700;font-size:11px;flex-shrink:0}
.user-name{color:#c9d1d9;font-weight:500;font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.user-total{color:#1ec8a0;font-weight:700;font-size:12px;flex-shrink:0}
.user-cmd-tags{display:flex;flex-wrap:wrap;gap:3px;margin-left:26px}
.user-cmd-tag{font-size:9px;padding:1px 5px;border-radius:4px;background:rgba(30,200,160,0.08);color:#8b949e;white-space:nowrap}
.user-cmd-tag b{color:#1ec8a0;font-weight:600}
.tabs{display:flex;gap:3px;margin-bottom:8px;flex-shrink:0}
.tab{padding:4px 8px;border:1px solid rgba(30,200,160,0.15);border-radius:5px;background:transparent;color:#8b949e;font-size:10px;cursor:pointer;font-family:inherit;transition:all 0.15s}
.tab.active{background:rgba(30,200,160,0.12);color:#1ec8a0;border-color:rgba(30,200,160,0.3)}
.tab-content{display:none;flex:1;min-height:0;overflow:hidden}
.tab-content.active{display:flex;flex-direction:column}
</style>
</head>
<body>
<div class="widget">
<div class="header">
<img class="logo" src="${logoUrl}" alt="Questorr" onerror="this.style.display='none'">
<h2>Questorr</h2>
<span class="dot offline" id="dot"></span>
</div>
<div class="bot-info">
<span id="bn">Loading...</span>
<span id="ver"></span>
</div>
<div class="stats">
<div class="stat"><div class="v" id="up">--</div><div class="l">Uptime</div></div>
<div class="stat"><div class="v" id="cmds">--</div><div class="l">Commands</div></div>
<div class="stat"><div class="v" id="mem">--</div><div class="l">RAM MB</div></div>
</div>
<div class="section">
<div class="tabs">
<button class="tab active" onclick="switchTab('commands',this)">Commands</button>
<button class="tab" onclick="switchTab('users',this)">Top Users</button>
</div>
<div class="tab-content active" id="tab-commands">
<div class="cmd-list" id="cmdList"><div style="color:#484f58;font-size:11px;text-align:center;padding:8px">No data yet</div></div>
</div>
<div class="tab-content" id="tab-users">
<div class="cmd-list" id="userList"><div style="color:#484f58;font-size:11px;text-align:center;padding:8px">No data yet</div></div>
</div>
</div>
<div class="btn-row">
<button class="toggle-btn start" id="tb" onclick="toggle()" disabled>
<span id="tbIcon">&#9654;</span> <span id="tbText">Start Bot</span>
</button>
<button class="reset-btn" id="rb" onclick="resetStats()" title="Reset command statistics">&#x21BA; Reset</button>
</div>
<div class="err" id="err"></div>
<div class="ver" id="verFull"></div>
</div>
<script>
const A="${baseUrl}/api";
const K="${keyParam}";
let isOnline=false;

function switchTab(name,el){
document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));
el.classList.add('active');
document.getElementById('tab-'+name).classList.add('active');
}

function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML;}

async function r(){
try{
const d=await(await fetch(A+"/widget/stats"+K)).json();
if(d.error){document.getElementById("err").textContent=d.error;return;}
isOnline=d.status==="online";
document.getElementById("dot").className="dot "+d.status;
document.getElementById("bn").textContent=d.botUsername||"Bot offline";
document.getElementById("up").textContent=d.uptimeFormatted||"0h 00m 00s";
document.getElementById("cmds").textContent=d.commandStats?.totalCommands||0;
document.getElementById("mem").textContent=d.memoryMB;
document.getElementById("ver").textContent="v"+d.version;
document.getElementById("verFull").textContent="Questorr v"+d.version;
document.getElementById("tb").disabled=false;
document.getElementById("tb").className="toggle-btn "+(isOnline?"stop":"start");
document.getElementById("tbIcon").innerHTML=isOnline?"&#9632;":"&#9654;";
document.getElementById("tbText").textContent=isOnline?"Stop Bot":"Start Bot";
document.getElementById("err").textContent="";
const cs=d.commandStats;
const emptyMsg='<div style="color:#484f58;font-size:11px;text-align:center;padding:8px">No data yet</div>';
if(cs&&cs.commands&&Object.keys(cs.commands).length>0){
const max=Math.max(...Object.values(cs.commands));
let h="";
Object.entries(cs.commands).sort((a,b)=>b[1]-a[1]).forEach(([cmd,count])=>{
const pct=max>0?Math.round(count/max*100):0;
h+='<div class="cmd-row"><span class="cmd-name">/'+esc(cmd)+'</span><div class="cmd-bar"><div class="cmd-bar-fill" style="width:'+pct+'%"></div></div><span class="cmd-count">'+count+'</span></div>';
});
document.getElementById("cmdList").innerHTML=h;
}else{document.getElementById("cmdList").innerHTML=emptyMsg;}
if(cs&&cs.topUsers&&cs.topUsers.length>0){
let h="";
cs.topUsers.forEach((u,i)=>{
const initial=esc(u.username).charAt(0).toUpperCase();
const av=u.avatarUrl
?'<img class="user-avatar" src="'+esc(u.avatarUrl)+'" alt="" onerror="this.style.display=\\'none\\';this.nextElementSibling.style.display=\\'flex\\'"><div class="user-avatar-placeholder" style="display:none">'+initial+'</div>'
:'<div class="user-avatar-placeholder">'+initial+'</div>';
let tags="";
if(u.commands){
Object.entries(u.commands).sort((a,b)=>b[1]-a[1]).forEach(([c,n])=>{
tags+='<span class="user-cmd-tag">/'+esc(c)+' <b>'+n+'x</b></span>';
});
}
h+='<div class="user-card"><div class="user-header"><span class="user-rank">'+(i+1)+'.</span>'+av+'<span class="user-name">'+esc(u.username)+'</span><span class="user-total">'+u.total+'</span></div>'+(tags?'<div class="user-cmd-tags">'+tags+'</div>':'')+'</div>';
});
document.getElementById("userList").innerHTML=h;
}else{document.getElementById("userList").innerHTML=emptyMsg;}
}catch(e){document.getElementById("err").textContent="Connection failed"}}

async function toggle(){
const action=isOnline?"stop":"start";
try{
document.getElementById("err").textContent="";
document.getElementById("tb").disabled=true;
const res=await fetch(A+"/"+action+"-bot",{method:"POST",credentials:"include"});
const d=await res.json();
if(!res.ok)document.getElementById("err").textContent=d.message||d.error;
setTimeout(r,1500);
}catch(e){
document.getElementById("err").textContent="Action failed";
document.getElementById("tb").disabled=false;
}}

let resetPending=false;
async function resetStats(){
const rb=document.getElementById("rb");
if(!resetPending){resetPending=true;rb.innerHTML="&#x21BA; Confirm?";rb.style.color="#f38ba8";rb.style.borderColor="rgba(243,139,168,0.4)";setTimeout(()=>{if(resetPending){resetPending=false;rb.innerHTML="&#x21BA; Reset";rb.style.color="";rb.style.borderColor="";}},3000);return;}
resetPending=false;
try{
rb.disabled=true;rb.innerHTML="...";
const res=await fetch(A+"/widget/reset-stats"+K,{method:"POST"});
const d=await res.json();
if(d.success){rb.innerHTML="&#x2705; Done";rb.style.color="#1ec8a0";rb.style.borderColor="";setTimeout(()=>{rb.innerHTML="&#x21BA; Reset";rb.style.color="";rb.disabled=false;r();},1500);}
else{document.getElementById("err").textContent=d.message||"Reset failed";rb.innerHTML="&#x21BA; Reset";rb.style.color="";rb.style.borderColor="";rb.disabled=false;}
}catch(e){document.getElementById("err").textContent="Reset failed";rb.innerHTML="&#x21BA; Reset";rb.style.color="";rb.style.borderColor="";rb.disabled=false;}}

r();setInterval(r,15000);
</script>
</body>
</html>`;

  res.type("html").send(html);
});

// ─── Bot Status (authenticated) ──────────────────────────────────────────────
router.get("/status", authenticateToken, (req, res) => {
  res.json({
    isBotRunning: botState.isBotRunning,
    botUsername: botState.isBotRunning && botState.discordClient?.user ? botState.discordClient.user.tag : null,
  });
});

export function createBotRoutes({ startBot }) {
  router.post("/start-bot", botControlLimiter, authenticateToken, async (req, res) => {
    if (botState.isBotRunning) {
      return res.status(400).json({ message: "Bot is already running." });
    }
    try {
      const result = await startBot();
      res.status(200).json({ message: `Bot started successfully! ${result.message}` });
    } catch (error) {
      res.status(500).json({ message: `Failed to start bot: ${error.message}` });
    }
  });

  router.post("/stop-bot", botControlLimiter, authenticateToken, async (req, res) => {
    if (!botState.isBotRunning || !botState.discordClient) {
      return res.status(400).json({ message: "Bot is not running." });
    }
    try {
      await botState.discordClient.destroy();
      botState.isBotRunning = false;
      botState.discordClient = null;
      botState.botStartedAt = null;
      logger.info("Bot has been stopped.");
      res.status(200).json({ message: "Bot stopped successfully." });
    } catch (error) {
      logger.error("Error stopping bot:", error);
      res.status(500).json({ message: `Failed to stop bot: ${error.message}` });
    }
  });

  return router;
}

export default router;
