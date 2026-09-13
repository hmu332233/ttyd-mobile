import fs from "node:fs";

const htmlPath = new URL("./ttyd-mobile.html", import.meta.url);
const cssPath = new URL("./mobile-enhancements.css", import.meta.url);
const jsPath = new URL("./mobile-enhancements.js", import.meta.url);

let html = fs.readFileSync(htmlPath, "utf8");
const css = fs.readFileSync(cssPath, "utf8").trim();
const js = fs.readFileSync(jsPath, "utf8").trim();
const googleFontLinks = '<link id="ttyd-google-fonts-preconnect" rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link id="ttyd-google-fonts-stylesheet" rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400&display=swap">';

// Idempotent literal patch of the inlined ttyd client bundle:
// skip if already applied, replace exactly once, otherwise fail loudly.
const patch = (name, from, to) => {
  if (html.includes(to)) return;
  const count = html.split(from).length - 1;
  if (count !== 1) throw new Error(`patch "${name}": expected 1 match, found ${count}`);
  html = html.replace(from, to);
};

html = html.replace(/<link id="ttyd-google-fonts-(?:preconnect|stylesheet)"[^>]*>/g, "");
html = html.replace(
  /<meta name="viewport" content="[^"]*">/,
  `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, interactive-widget=resizes-content">${googleFontLinks}`,
);
html = html.replace(
  /<style id="ttyd-mobile-focus-zoom-fix">[\s\S]*?<\/style>/,
  `<style id="ttyd-mobile-focus-zoom-fix">${css}</style>`,
);
html = html.replace(
  /window\.term=t,window\.term\.fit=\(\)=>\{this\.fitAddon\.fit\(\)\}(?:,window\.term\.sendData=e=>this\.sendData\(e\))?(?:,window\.term\.reconnect=\(\)=>this\.reconnectNow\(\))?/,
  "window.term=t,window.term.fit=()=>{this.fitAddon.fit()},window.term.sendData=e=>this.sendData(e),window.term.reconnect=()=>this.reconnectNow()",
);

// Auto-reconnect, ported from tsl0922/ttyd PR #1536 (unmerged as of 1.7.7).
// 1) A socket `error` no longer disables reconnect; the `close` that follows drives the retry.
patch(
  "socket error keeps reconnect",
  't(g(e,"error",(()=>this.doReconnect=!1)))',
  't(g(e,"error",(()=>console.log("[ttyd] websocket error (will retry on close)"))))',
);
// 2) Successful (re)open resets the backoff.
patch(
  "socket open resets backoff",
  "this.opened=!0,this.doReconnect=this.reconnect,this.initListeners(),i.focus()}",
  "this.opened=!0,this.doReconnect=this.reconnect,this.reconnectDelay=1e3,this.clearReconnectTimer(),this.initListeners(),i.focus()}",
);
// 3) Every close schedules a backoff reconnect (1s -> 30s), not only non-1000 codes.
//    `disableReconnect=true` keeps the original "Press ⏎ to Reconnect" behaviour.
patch(
  "socket close schedules backoff reconnect",
  'onSocketClose(e){console.log(`[ttyd] websocket connection closed with code: ${e.code}`);const{refreshToken:t,connect:i,doReconnect:s,overlayAddon:r}=this;if(r.showOverlay("Connection Closed"),this.dispose(),1e3!==e.code&&s)r.showOverlay("Reconnecting..."),t().then(i);else{const{terminal:e}=this,s=e.onKey((e=>{"Enter"===e.domEvent.key&&(s.dispose(),r.showOverlay("Reconnecting..."),t().then(i))}));r.showOverlay("Press ⏎ to Reconnect")}}',
  'onSocketClose(e){console.log(`[ttyd] websocket connection closed with code: ${e.code}`);const{refreshToken:t,connect:i,overlayAddon:r}=this;if(r.showOverlay("Connection Closed"),this.dispose(),this.reconnect)this.scheduleReconnect();else{const{terminal:e}=this,s=e.onKey((e=>{"Enter"===e.domEvent.key&&(s.dispose(),r.showOverlay("Reconnecting..."),t().then(i))}));r.showOverlay("Press ⏎ to Reconnect")}}'
  + 'scheduleReconnect(){if(this.reconnectTimer)return;const e=this.reconnectDelay||1e3;this.overlayAddon.showOverlay(`Reconnecting in ${Math.round(e/100)/10}s...`,Math.min(e,2e3)),console.log(`[ttyd] scheduling reconnect in ${e}ms`),this.reconnectTimer=setTimeout((()=>{this.reconnectTimer=null,this.reconnectDelay=Math.min(e*2,3e4),this.overlayAddon.showOverlay("Reconnecting..."),this.refreshToken().then(this.connect)}),e)}'
  + 'clearReconnectTimer(){this.reconnectTimer&&(clearTimeout(this.reconnectTimer),this.reconnectTimer=null)}'
  + 'reconnectNow(){if(!this.reconnect)return;const e=this.socket&&this.socket.readyState;if(e===WebSocket.OPEN||e===WebSocket.CONNECTING)return;console.log("[ttyd] immediate reconnect"),this.clearReconnectTimer(),this.reconnectDelay=1e3,this.overlayAddon.showOverlay("Reconnecting..."),this.refreshToken().then(this.connect)}',
);

html = html.replace(
  /<script id="ttyd-mobile-enhancements">[\s\S]*?<\/script>/,
  `<script id="ttyd-mobile-enhancements">${js}</script>`,
);

fs.writeFileSync(htmlPath, html);
