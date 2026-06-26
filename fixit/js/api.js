/* FixIt – API client (talks to Express/PostgreSQL backend) */
const BASE = '';   // same origin – backend serves the frontend

class API {
  constructor() {
    this._accessToken  = localStorage.getItem('fixit_access')  || null;
    this._refreshToken = localStorage.getItem('fixit_refresh') || null;
    this._ws           = null;
    this._wsHandlers   = {};
    this._wsQueue      = [];
  }

  /* ── Token helpers ── */
  setTokens(access, refresh) {
    this._accessToken  = access;
    this._refreshToken = refresh;
    localStorage.setItem('fixit_access',  access);
    if (refresh) localStorage.setItem('fixit_refresh', refresh);
  }
  clearTokens() {
    this._accessToken = this._refreshToken = null;
    localStorage.removeItem('fixit_access');
    localStorage.removeItem('fixit_refresh');
  }
  get headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this._accessToken) h['Authorization'] = 'Bearer ' + this._accessToken;
    return h;
  }

  /* ── Core fetch with auto-refresh ── */
  async _fetch(path, opts = {}) {
    opts.headers = { ...this.headers, ...(opts.headers || {}) };
    let res = await fetch(BASE + '/api' + path, opts);

    if (res.status === 401 && this._refreshToken) {
      // Try refresh
      const r = await fetch(BASE + '/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this._refreshToken }),
      });
      if (r.ok) {
        const { accessToken } = await r.json();
        this.setTokens(accessToken, this._refreshToken);
        opts.headers['Authorization'] = 'Bearer ' + accessToken;
        res = await fetch(BASE + '/api' + path, opts);
      } else {
        this.clearTokens();
        window.location.reload();
        return;
      }
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status });
    return data;
  }

  get(path)         { return this._fetch(path); }
  post(path, body)  { return this._fetch(path, { method:'POST',  body: JSON.stringify(body) }); }
  patch(path, body) { return this._fetch(path, { method:'PATCH', body: JSON.stringify(body) }); }
  del(path)         { return this._fetch(path, { method:'DELETE' }); }

  /* ── Auth ── */
  async register(data) {
    const res = await this.post('/auth/register', data);
    this.setTokens(res.accessToken, res.refreshToken);
    return res;
  }
  async login(email, password) {
    const res = await this.post('/auth/login', { email, password });
    this.setTokens(res.accessToken, res.refreshToken);
    return res;
  }
  async logout() {
    await this.post('/auth/logout', { refreshToken: this._refreshToken }).catch(() => {});
    this.clearTokens();
    this.disconnectWS();
  }
  me() { return this.get('/auth/me'); }

  /* ── Technicians ── */
  getTechnicians(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this.get('/technicians' + (qs ? '?' + qs : ''));
  }
  getTechnician(id)           { return this.get('/technicians/' + id); }
  updateLocation(lat, lng)    { return this.patch('/technicians/location',     { lat, lng }); }
  updateAvailability(d)       { return this.patch('/technicians/availability',  d); }
  updateTechProfile(d)        { return this.patch('/technicians/profile',       d); }
  myJobs(status)              { return this.get('/technicians/me/jobs' + (status ? '?status='+status : '')); }

  /* ── Bookings ── */
  createBooking(data)         { return this.post('/bookings', data); }
  getBookings(status)         { return this.get('/bookings' + (status ? '?status='+status : '')); }
  getBooking(id)              { return this.get('/bookings/' + id); }
  acceptBooking(id)           { return this.patch('/bookings/' + id + '/accept'); }
  startBooking(id)            { return this.patch('/bookings/' + id + '/start'); }
  completeBooking(id, data)   { return this.patch('/bookings/' + id + '/complete', data); }
  cancelBooking(id, reason)   { return this.patch('/bookings/' + id + '/cancel', { reason }); }

  /* ── Media upload ── */
  async uploadMedia(bookingId, files) {
    const fd = new FormData();
    files.forEach(f => fd.append('files', f));
    const res = await fetch(BASE + '/api/bookings/' + bookingId + '/media', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + this._accessToken },
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data;
  }

  /* ── Payments ── */
  initiatePayment(data)       { return this.post('/payments/initiate', data); }
  getPayment(bookingId)       { return this.get('/payments/' + bookingId); }

  /* ── Reviews ── */
  createReview(data)          { return this.post('/reviews', data); }
  getTechReviews(techId)      { return this.get('/reviews/technician/' + techId); }

  /* ── Messages ── */
  getMessages(bookingId)      { return this.get('/messages/' + bookingId); }
  sendMessage(bookingId, body){ return this.post('/messages', { bookingId, body }); }

  /* ── Notifications ── */
  getNotifications()          { return this.get('/notifications'); }
  markNotificationsRead()     { return this.patch('/notifications/read'); }

  /* ── Admin ── */
  adminStats()                { return this.get('/admin/stats'); }
  adminTechnicians(status)    { return this.get('/admin/technicians' + (status ? '?verify_status='+status : '')); }
  adminVerifyTech(id, status) { return this.patch('/admin/technicians/' + id + '/verify', { status }); }
  adminBookings()             { return this.get('/admin/bookings'); }

  /* ── WebSocket (real-time) ── */
  connectWS() {
    if (this._ws?.readyState === WebSocket.OPEN) return;
    if (!this._accessToken) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const wsURL = `${proto}://${location.host}/ws?token=${this._accessToken}`;
    this._ws = new WebSocket(wsURL);

    this._ws.onopen    = () => {
      console.log('[WS] Connected');
      this._wsQueue.forEach(m => this._ws.send(JSON.stringify(m)));
      this._wsQueue = [];
      // Keep-alive ping every 25s
      this._pingInterval = setInterval(() => this.wsSend({ type:'ping' }), 25000);
    };
    this._ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        const handler = this._wsHandlers[msg.type];
        if (handler) handler(msg);
      } catch (_) {}
    };
    this._ws.onclose   = () => {
      clearInterval(this._pingInterval);
      console.log('[WS] Disconnected – reconnecting in 5s');
      setTimeout(() => this.connectWS(), 5000);
    };
    this._ws.onerror   = (e) => console.error('[WS] Error', e);
  }

  disconnectWS() {
    clearInterval(this._pingInterval);
    if (this._ws) { this._ws.onclose = null; this._ws.close(); this._ws = null; }
  }

  on(type, fn)  { this._wsHandlers[type] = fn; }
  off(type)     { delete this._wsHandlers[type]; }

  wsSend(msg) {
    if (this._ws?.readyState === WebSocket.OPEN) this._ws.send(JSON.stringify(msg));
    else this._wsQueue.push(msg);
  }

  sendLocation(lat, lng, bookingId) {
    this.wsSend({ type:'location_update', lat, lng, bookingId });
    this.updateLocation(lat, lng).catch(() => {});   // also persist to DB
  }

  /* ── Geo helpers ── */
  distanceKm(a, b) {
    if (!a?.lat || !b?.lat) return null;
    const R = 6371, dLat = (b.lat-a.lat)*Math.PI/180, dLng = (b.lng-a.lng)*Math.PI/180;
    const x = Math.sin(dLat/2)**2 + Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;
    return +(R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x))).toFixed(1);
  }

  getPosition() {
    return new Promise((res, rej) =>
      navigator.geolocation?.getCurrentPosition(
        p => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => res({ lat: -1.2921, lng: 36.8219 })   // default Nairobi CBD
      ) || res({ lat: -1.2921, lng: 36.8219 })
    );
  }
}

window.api = new API();
