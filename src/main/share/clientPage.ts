// The page a guest opens on their phone or another computer. Served by the
// app's own HTTP server — nothing to install. Renders the screencast to a
// canvas and forwards pointer/key input back over the WebSocket using
// normalized coordinates.

export function clientPage(token: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
<title>Shared Panel</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { margin:0; height:100%; background:#141519; color:#e2e8f0;
    font:13px/1.4 Inter, "Segoe UI", system-ui, sans-serif; overflow:hidden; overscroll-behavior:none; }
  #bar { display:flex; align-items:center; gap:6px; height:44px; padding:0 8px;
    background:#1b1d23; border-bottom:1px solid #2e323d; }
  #bar button { display:flex; align-items:center; justify-content:center; width:32px; height:32px;
    border:0; border-radius:7px; background:transparent; color:#cbd5e1; font-size:15px; cursor:pointer; }
  #bar button:active { background:#2e323d; }
  #title { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#94a3b8; font-size:12px; }
  #dot { width:8px; height:8px; border-radius:50%; background:#f59e0b; flex:none; }
  #dot.on { background:#10b981; } #dot.off { background:#ef4444; }
  #stage { position:relative; width:100%; height:calc(100% - 44px); display:flex; align-items:center; justify-content:center; background:#0f1014; }
  canvas { max-width:100%; max-height:100%; touch-action:none; display:block; }
  #hint { position:absolute; inset:auto 0 12px 0; text-align:center; color:#64748b; font-size:11px; pointer-events:none; }
  #kb { position:absolute; opacity:0; pointer-events:none; width:1px; height:1px; }
  #ro { position:absolute; inset:0; display:none; align-items:center; justify-content:center;
    background:rgba(15,16,20,.85); color:#94a3b8; font-size:13px; text-align:center; padding:24px; }
  #gate { position:absolute; inset:0; display:none; flex-direction:column; align-items:center; justify-content:center;
    gap:14px; background:#0f1014; color:#cbd5e1; text-align:center; padding:32px; }
  #gate h2 { margin:0; font-size:15px; font-weight:600; color:#e2e8f0; }
  #gate p { margin:0; font-size:12px; color:#94a3b8; max-width:280px; line-height:1.5; }
  .spin { width:26px; height:26px; border:2px solid #2e323d; border-top-color:#6d8cff;
    border-radius:50%; animation:sp 0.9s linear infinite; }
  @keyframes sp { to { transform:rotate(360deg); } }
</style>
</head>
<body>
<div id="bar">
  <div id="dot" title="connection"></div>
  <button id="back" title="Back">‹</button>
  <button id="fwd" title="Forward">›</button>
  <button id="rel" title="Reload">⟳</button>
  <div id="title">Connecting…</div>
  <button id="keys" title="Keyboard">⌨</button>
</div>
<div id="stage">
  <canvas id="screen"></canvas>
  <div id="hint">Tap to interact · ⌨ for keyboard</div>
  <div id="ro">View-only — the host has disabled control.</div>
  <div id="gate">
    <div class="spin" id="gspin"></div>
    <h2 id="gtitle">Waiting for the host…</h2>
    <p id="gtext">The host has been asked to let you in. Nothing is shared until they approve.</p>
  </div>
</div>
<input id="kb" autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false" />
<script>
(function () {
  var TOKEN = ${JSON.stringify(token)};
  var cv = document.getElementById('screen'), cx = cv.getContext('2d');
  var dot = document.getElementById('dot'), title = document.getElementById('title');
  var hint = document.getElementById('hint'), ro = document.getElementById('ro');
  var kb = document.getElementById('kb');
  var gate = document.getElementById('gate'), gtitle = document.getElementById('gtitle');
  var gtext = document.getElementById('gtext'), gspin = document.getElementById('gspin');
  var ws, control = true, imgW = 0, imgH = 0, admitted = false, denied = false;

  function showGate(title, text, spinning) {
    gate.style.display = 'flex';
    gtitle.textContent = title; gtext.textContent = text;
    gspin.style.display = spinning ? 'block' : 'none';
  }

  function connect() {
    var proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(proto + '://' + location.host + '/ws?token=' + encodeURIComponent(TOKEN));
    ws.onopen = function () { dot.className = 'on'; };
    ws.onclose = function () {
      dot.className = 'off';
      if (denied) return; // a denied guest must not silently retry
      title.textContent = 'Disconnected';
      setTimeout(connect, 1500);
    };
    ws.onerror = function () { dot.className = 'off'; };
    ws.onmessage = function (ev) {
      var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.type === 'frame') draw(m.data);
      else if (m.type === 'pending') {
        admitted = false;
        title.textContent = 'Waiting for approval';
        showGate('Waiting for the host…', 'The host has been asked to let you in. Nothing is shared until they approve.', true);
      } else if (m.type === 'approved') {
        admitted = true;
        gate.style.display = 'none';
      } else if (m.type === 'denied') {
        denied = true;
        showGate('Request declined', 'The host did not admit you to this session.', false);
      } else if (m.type === 'meta') {
        title.textContent = m.title || m.url || 'Shared panel';
        control = !!m.allowControl;
        ro.style.display = control || !admitted ? 'none' : 'flex';
      } else if (m.type === 'ended') {
        denied = true;
        showGate('Sharing ended', 'The host stopped sharing this panel.', false);
        ws.close();
      }
    };
  }

  var img = new Image();
  img.onload = function () {
    if (img.width !== imgW || img.height !== imgH) { imgW = cv.width = img.width; imgH = cv.height = img.height; }
    cx.drawImage(img, 0, 0);
  };
  function draw(b64) { img.src = 'data:image/jpeg;base64,' + b64; }

  function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
  // Map a client-space point onto the page using normalized 0..1 coords.
  function norm(e) {
    var r = cv.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
             y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  }
  function mods(e) { return (e.altKey?1:0) | (e.ctrlKey?2:0) | (e.metaKey?4:0) | (e.shiftKey?8:0); }

  cv.addEventListener('pointerdown', function (e) {
    if (!control) return; e.preventDefault(); hint.style.display = 'none';
    var p = norm(e); send({ type:'mouse', action:'mousePressed', x:p.x, y:p.y, button:'left', clickCount:1, modifiers:mods(e) });
  });
  cv.addEventListener('pointerup', function (e) {
    if (!control) return; e.preventDefault();
    var p = norm(e); send({ type:'mouse', action:'mouseReleased', x:p.x, y:p.y, button:'left', clickCount:1, modifiers:mods(e) });
  });
  cv.addEventListener('pointermove', function (e) {
    if (!control || (e.pointerType === 'touch' && !e.buttons)) return;
    var p = norm(e); send({ type:'mouse', action:'mouseMoved', x:p.x, y:p.y, modifiers:mods(e) });
  });
  cv.addEventListener('wheel', function (e) {
    if (!control) return; e.preventDefault();
    var p = norm(e); send({ type:'wheel', x:p.x, y:p.y, deltaX:-e.deltaX, deltaY:-e.deltaY, modifiers:mods(e) });
  }, { passive:false });

  // Touch scrolling → wheel deltas.
  var last = null;
  cv.addEventListener('touchstart', function (e) {
    if (e.touches.length === 1) last = { x:e.touches[0].clientX, y:e.touches[0].clientY };
  }, { passive:true });
  cv.addEventListener('touchmove', function (e) {
    if (!control || !last || e.touches.length !== 1) return;
    e.preventDefault();
    var t = e.touches[0], dx = t.clientX - last.x, dy = t.clientY - last.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) {
      var r = cv.getBoundingClientRect();
      send({ type:'wheel', x:(t.clientX-r.left)/r.width, y:(t.clientY-r.top)/r.height, deltaX:dx, deltaY:dy, modifiers:0 });
      last = { x:t.clientX, y:t.clientY };
    }
  }, { passive:false });
  cv.addEventListener('touchend', function () { last = null; }, { passive:true });

  // Physical keyboard (desktop guests).
  window.addEventListener('keydown', function (e) {
    if (!control || document.activeElement === kb) return;
    e.preventDefault(); send({ type:'key', action:'down', key:e.key, code:e.code, modifiers:mods(e) });
  });
  window.addEventListener('keyup', function (e) {
    if (!control || document.activeElement === kb) return;
    e.preventDefault(); send({ type:'key', action:'up', key:e.key, code:e.code, modifiers:mods(e) });
  });

  // On-screen keyboard (phones): a hidden input we forward from.
  document.getElementById('keys').addEventListener('click', function () { kb.focus(); });
  kb.addEventListener('input', function () {
    if (kb.value) { send({ type:'text', text: kb.value }); kb.value = ''; }
  });
  kb.addEventListener('keydown', function (e) {
    if (!control) return;
    if (e.key === 'Enter' || e.key === 'Backspace' || e.key.indexOf('Arrow') === 0 || e.key === 'Tab') {
      e.preventDefault();
      send({ type:'key', action:'down', key:e.key, code:e.code, modifiers:mods(e) });
      send({ type:'key', action:'up', key:e.key, code:e.code, modifiers:mods(e) });
    }
  });

  document.getElementById('back').addEventListener('click', function () { send({ type:'nav', action:'back' }); });
  document.getElementById('fwd').addEventListener('click', function () { send({ type:'nav', action:'forward' }); });
  document.getElementById('rel').addEventListener('click', function () { send({ type:'nav', action:'reload' }); });

  connect();
})();
</script>
</body>
</html>`
}
