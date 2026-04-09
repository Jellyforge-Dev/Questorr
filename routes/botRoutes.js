import { Router } from "express";
import rateLimit from "express-rate-limit";
import { createRequire } from "module";
import axios from "axios";
import { authenticateToken } from "../utils/auth.js";
import { botState, pendingRequests } from "../bot/botState.js";
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
});

// ─── Health Check (public, no auth) ──────────────────────────────────────────
router.get("/health", async (req, res) => {
  const uptime = process.uptime();
  const cacheStats = cache.getStats();
  const totalHits = cacheStats.tmdb.hits + cacheStats.seerr.hits;
  const totalMisses = cacheStats.tmdb.misses + cacheStats.seerr.misses;
  const totalKeys = cacheStats.tmdb.keys + cacheStats.seerr.keys;

  // Service connectivity checks (parallel, 3s timeout)
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

  res.json({
    status: allReachable ? "healthy" : "degraded",
    version: APP_VERSION,
    uptime: Math.floor(uptime),
    uptimeFormatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
    bot: {
      running: botState.isBotRunning,
      username: botState.isBotRunning && botState.discordClient?.user ? botState.discordClient.user.tag : null,
      connected: botState.discordClient?.ws?.status === 0,
    },
    services,
    pendingRequests: pendingRequests.size,
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
  });
});

// ─── Widget Stats (public JSON, lightweight) ─────────────────────────────────
router.get("/widget/stats", (req, res) => {
  const uptime = process.uptime();
  const cacheStats = cache.getStats();

  res.json({
    status: botState.isBotRunning ? "online" : "offline",
    botUsername: botState.isBotRunning && botState.discordClient?.user ? botState.discordClient.user.tag : null,
    uptime: Math.floor(uptime),
    uptimeFormatted: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
    pendingRequests: pendingRequests.size,
    cacheKeys: cacheStats.tmdb.keys + cacheStats.seerr.keys,
    memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
  });
});

// ─── Embeddable HTML Widget ──────────────────────────────────────────────────
router.get("/widget/embed", (req, res) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const theme = req.query.theme === "light" ? "light" : "dark";
  const bg = theme === "dark" ? "#1a1a2e" : "#f5f5f5";
  const card = theme === "dark" ? "#16213e" : "#fff";
  const border = theme === "dark" ? "#0f3460" : "#ddd";
  const text = theme === "dark" ? "#e0e0e0" : "#333";
  const accent = theme === "dark" ? "#1ec8a0" : "#0d7a5f";
  const statBg = theme === "dark" ? "#1a1a2e" : "#f0f0f0";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Questorr Widget</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:${bg};color:${text};padding:12px}
.widget{background:${card};border-radius:12px;padding:16px;border:1px solid ${border};max-width:320px}
.header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.header h2{font-size:16px;font-weight:600;color:${accent}}
.dot{width:10px;height:10px;border-radius:50%;display:inline-block}
.dot.online{background:#2ecc71;box-shadow:0 0 6px #2ecc71}
.dot.offline{background:#e74c3c;box-shadow:0 0 6px #e74c3c}
.stats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
.stat{background:${statBg};border-radius:8px;padding:8px 10px;text-align:center}
.stat .v{font-size:18px;font-weight:700;color:${accent}}
.stat .l{font-size:11px;opacity:.7;margin-top:2px}
.ctrls{display:flex;gap:8px}
.ctrls button{flex:1;padding:8px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;transition:opacity .2s}
.ctrls button:hover{opacity:.85}
.ctrls button:disabled{opacity:.4;cursor:not-allowed}
.start{background:#2ecc71;color:#fff}
.stop{background:#e74c3c;color:#fff}
.name{font-size:12px;opacity:.6;margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.err{color:#e74c3c;font-size:12px;margin-top:8px}
.ver{font-size:10px;opacity:.4;margin-top:8px;text-align:right}
</style>
</head>
<body>
<div class="widget">
<div class="header"><h2>Questorr</h2><span class="dot offline" id="dot"></span></div>
<div class="name" id="bn">Loading...</div>
<div class="stats">
<div class="stat"><div class="v" id="up">--</div><div class="l">Uptime</div></div>
<div class="stat"><div class="v" id="pn">--</div><div class="l">Pending</div></div>
<div class="stat"><div class="v" id="mem">--</div><div class="l">RAM (MB)</div></div>
<div class="stat"><div class="v" id="ck">--</div><div class="l">Cache</div></div>
</div>
<div class="ctrls">
<button class="start" id="sb" onclick="ctrl('start')" disabled>Start</button>
<button class="stop" id="xb" onclick="ctrl('stop')" disabled>Stop</button>
</div>
<div class="err" id="err"></div>
<div class="ver" id="ver"></div>
</div>
<script>
const A="${baseUrl}/api";
async function r(){
try{
const d=await(await fetch(A+"/widget/stats")).json();
document.getElementById("dot").className="dot "+d.status;
document.getElementById("bn").textContent=d.botUsername||"Bot offline";
document.getElementById("up").textContent=d.uptimeFormatted;
document.getElementById("pn").textContent=d.pendingRequests;
document.getElementById("mem").textContent=d.memoryMB;
document.getElementById("ck").textContent=d.cacheKeys;
document.getElementById("sb").disabled=d.status==="online";
document.getElementById("xb").disabled=d.status==="offline";
document.getElementById("ver").textContent="v"+d.version;
document.getElementById("err").textContent="";
}catch(e){document.getElementById("err").textContent="Connection failed"}}
async function ctrl(a){
try{document.getElementById("err").textContent="";
const res=await fetch(A+"/"+a+"-bot",{method:"POST",credentials:"include"});
const d=await res.json();
if(!res.ok)document.getElementById("err").textContent=d.message||d.error;
setTimeout(r,1000)}catch(e){document.getElementById("err").textContent="Action failed"}}
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
