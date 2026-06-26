/* FixIt – Live GPS tracking map v2 */
class LiveMap {
  constructor(el) { this.el = el; this._interval = null; this._sim = true; }

  render(clientPos, techPos, techName, onETA) {
    this.clientPos = { ...clientPos };
    this.techPos   = { ...techPos };
    this.techName  = techName;
    this.onETA     = onETA;
    this.el.innerHTML = `
      <div style="position:relative;width:100%;height:100%;overflow:hidden">
        <canvas id="mapCanvas" style="display:block;width:100%;height:100%"></canvas>
        <div class="map-overlay-card">
          <div class="map-tech-row">
            <div class="pulse-dot"></div>
            <strong>${techName}</strong>
            <span style="color:var(--muted);font-size:13px">is on the way</span>
          </div>
          <div class="map-eta" id="mapETA">—</div>
          <div style="color:var(--muted);font-size:12px;text-align:center">estimated arrival</div>
          <div class="map-btns">
            <button class="btn-map-call" onclick="app.callTech()">📞 Call</button>
            <button class="btn-map-chat" onclick="app.openChat()">💬 Chat</button>
          </div>
        </div>
        <div class="map-badge-live">🟢 Live</div>
      </div>`;
    requestAnimationFrame(() => this._drawCanvas());
    this._updateETA();
    // Start simulation (replaced by real WS location_update in production)
    this._startSim();
  }

  moveTech(lat, lng) {
    // Called by WebSocket real-time updates
    this.techPos = { lat, lng };
    this._sim = false;  // stop simulation once real data arrives
    this._drawCanvas();
    this._updateETA();
  }

  _updateETA() {
    const dist = this._dist(this.clientPos, this.techPos);
    const eta  = Math.max(0, Math.round(dist / 0.4));
    const el   = document.getElementById('mapETA');
    if (el) el.textContent = eta > 0 ? eta + ' min' : 'Arrived!';
    if (this.onETA) this.onETA(eta, dist);
  }

  _startSim() {
    let step = 0, total = 100;
    const sLat = this.techPos.lat, sLng = this.techPos.lng;
    const eLat = this.clientPos.lat + (Math.random()-.5)*.001;
    const eLng = this.clientPos.lng + (Math.random()-.5)*.001;
    this._interval = setInterval(() => {
      if (!this._sim) return;  // stop sim when real WS data arrives
      step++;
      const t = this._ease(step / total);
      this.techPos = { lat: sLat+(eLat-sLat)*t, lng: sLng+(eLng-sLng)*t };
      this._drawCanvas();
      this._updateETA();
      if (step >= total) clearInterval(this._interval);
    }, 2000);
  }

  _drawCanvas() {
    const canvas = document.getElementById('mapCanvas'); if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = this.el.offsetWidth, h = this.el.offsetHeight;
    if (!w || !h) return;
    canvas.width = w*dpr; canvas.height = h*dpr;
    canvas.style.width = w+'px'; canvas.style.height = h+'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#0d1526'; ctx.fillRect(0,0,w,h);

    // Road grid
    ctx.strokeStyle='#1a2540'; ctx.lineWidth=10;
    for(let i=0;i<8;i++){ctx.beginPath();ctx.moveTo(0,h*.13*i+10);ctx.lineTo(w,h*.13*i+10);ctx.stroke();}
    for(let i=0;i<8;i++){ctx.beginPath();ctx.moveTo(w*.14*i+10,0);ctx.lineTo(w*.14*i+10,h);ctx.stroke();}
    ctx.strokeStyle='#141f38'; ctx.lineWidth=3;
    for(let i=0;i<18;i++){ctx.beginPath();ctx.moveTo(0,h*.058*i);ctx.lineTo(w,h*.058*i);ctx.stroke();}
    for(let i=0;i<18;i++){ctx.beginPath();ctx.moveTo(w*.058*i,0);ctx.lineTo(w*.058*i,h);ctx.stroke();}

    // Buildings
    ctx.fillStyle='#131e36';
    [[15,20,55,70],[90,35,60,55],[185,18,70,80],[300,25,55,70],[410,30,65,80],[520,18,55,75],
     [50,170,70,65],[170,185,65,60],[280,160,75,80],[400,175,60,70],[530,170,65,75],
     [25,320,70,65],[155,305,80,85],[295,330,65,70],[430,310,70,85]].forEach(([x,y,bw,bh])=>ctx.fillRect(x,y,bw,bh));

    const toXY = (lat,lng) => ({
      x: Math.max(30,Math.min(w-30, w/2+(lng-this.clientPos.lng)*9000)),
      y: Math.max(30,Math.min(h-30, h/2-(lat-this.clientPos.lat)*9000))
    });
    const cXY = toXY(this.clientPos.lat, this.clientPos.lng);
    const tXY = toXY(this.techPos.lat,   this.techPos.lng);

    // Route
    ctx.beginPath(); ctx.moveTo(tXY.x,tXY.y);
    ctx.quadraticCurveTo((tXY.x+cXY.x)/2+25,(tXY.y+cXY.y)/2-25,cXY.x,cXY.y);
    ctx.strokeStyle='rgba(0,200,150,0.55)'; ctx.lineWidth=3; ctx.setLineDash([8,6]); ctx.stroke(); ctx.setLineDash([]);

    // Client pin
    ctx.beginPath();ctx.arc(cXY.x,cXY.y,20,0,Math.PI*2);ctx.fillStyle='rgba(59,130,246,0.18)';ctx.fill();
    ctx.beginPath();ctx.arc(cXY.x,cXY.y,11,0,Math.PI*2);ctx.fillStyle='#3B82F6';ctx.fill();
    ctx.strokeStyle='white';ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle='white';ctx.font='bold 7px Inter';ctx.textAlign='center';ctx.fillText('YOU',cXY.x,cXY.y+3);

    // Tech pin
    ctx.beginPath();ctx.arc(tXY.x,tXY.y,22,0,Math.PI*2);ctx.fillStyle='rgba(0,200,150,0.2)';ctx.fill();
    ctx.beginPath();ctx.arc(tXY.x,tXY.y,13,0,Math.PI*2);ctx.fillStyle='#00C896';ctx.fill();
    ctx.strokeStyle='white';ctx.lineWidth=2.5;ctx.stroke();
    ctx.fillStyle='#000';ctx.font='bold 13px Arial';ctx.textAlign='center';ctx.fillText('✦',tXY.x,tXY.y+5);
  }

  _ease(t) { return t<.5?2*t*t:-1+(4-2*t)*t; }
  _dist(a,b) {
    const R=6371,dLat=(b.lat-a.lat)*Math.PI/180,dLng=(b.lng-a.lng)*Math.PI/180;
    const x=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;
    return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
  }
  destroy() { clearInterval(this._interval); }
}
window.LiveMap = LiveMap;
