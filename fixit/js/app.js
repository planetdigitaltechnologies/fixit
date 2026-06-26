/* FixIt PWA – Main App v2 (PostgreSQL backend) */
class FixItApp {
  constructor() {
    this._deferredInstall = null;
    this._map   = null;
    this._poll  = null;
    this.state  = {};
  }

  /* ══════════ BOOT ══════════ */
  async boot() {
    this._setupPWA();
    const loggedIn = await auth.init();
    auth.onChange(() => this._onAuthChange());
    this._setupRoutes();
    this._setupWSHandlers();

    if (loggedIn) {
      this._showNav(true);
      router.go(auth.isTech() ? 'techDash' : 'home', {}, false);
    } else {
      this._showNav(false);
      router.go('landing', {}, false);
    }
    this.state.location = await api.getPosition();
  }

  _setupPWA() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
          reg.installing?.addEventListener('statechange', e => {
            if (e.target.state === 'installed' && navigator.serviceWorker.controller)
              this.showToast('Update available – refresh to apply', 'info', 7000);
          });
        });
      });
    }
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault(); this._deferredInstall = e;
      document.getElementById('installBanner')?.classList.remove('hidden');
    });
    window.addEventListener('appinstalled', () => {
      document.getElementById('installBanner')?.classList.add('hidden');
      this.showToast('FixIt installed ✓', 'success');
    });
    document.getElementById('installBtn')?.addEventListener('click', () => this.installPWA());
    document.getElementById('dismissInstall')?.addEventListener('click', () =>
      document.getElementById('installBanner')?.classList.add('hidden'));
  }

  async installPWA() {
    if (!this._deferredInstall) { this.showToast('Use browser menu → "Add to Home Screen"', 'info'); return; }
    this._deferredInstall.prompt();
    const { outcome } = await this._deferredInstall.userChoice;
    if (outcome === 'accepted') this.showToast('Installing…', 'success');
    this._deferredInstall = null;
  }

  _showNav(show) {
    document.getElementById('bottomNav')?.classList.toggle('hidden', !show);
  }

  _onAuthChange() {
    this._showNav(auth.loggedIn());
    if (!auth.loggedIn()) router.go('landing', {}, false);
  }

  _setupWSHandlers() {
    api.on('tech_location', msg => {
      if (this._map) this._map.moveTech(msg.lat, msg.lng);
    });
    api.on('booking_status', msg => {
      if (msg.status === 'accepted') this.showToast('Your booking was accepted! Tracking technician…', 'success');
      if (msg.status === 'completed') this.showToast('Job complete! Please pay.', 'success');
    });
    api.on('chat_message', msg => {
      if (msg.sender_id !== auth.user?.id) {
        this.showToast('💬 ' + (msg.sender_name || 'Technician') + ': ' + msg.body.slice(0, 60), 'info');
        if (this.state.chatBookingId === msg.booking_id) this._loadMessages(msg.booking_id);
      }
    });
  }

  /* ══════════ ROUTES ══════════ */
  _setupRoutes() {
    router
      .register('landing',       () => this._renderLanding())
      .register('login',         () => this._renderLogin())
      .register('register',      p  => this._renderRegister(p))
      .register('home',          () => this._renderHome())
      .register('search',        p  => this._renderSearch(p))
      .register('techProfile',   p  => this._renderTechProfile(p))
      .register('booking',       p  => this._renderBooking(p))
      .register('tracking',      p  => this._renderTracking(p))
      .register('chat',          p  => this._renderChat(p))
      .register('payment',       p  => this._renderPayment(p))
      .register('review',        p  => this._renderReview(p))
      .register('history',       () => this._renderHistory())
      .register('account',       () => this._renderAccount())
      .register('notifications', () => this._renderNotifications())
      .register('techDash',      () => this._renderTechDash())
      .register('admin',         () => this._renderAdmin());
  }

  /* ══════════ LANDING ══════════ */
  _renderLanding() {
    document.getElementById('app').innerHTML = `
    <div class="landing">
      <nav class="top-nav glass">
        <div class="logo">Fix<span>It</span></div>
        <div class="nav-right">
          <button class="btn-ghost sm" onclick="router.go('login')">Sign in</button>
          <button class="btn-accent sm" onclick="router.go('register',{role:'client'})">Get started</button>
        </div>
      </nav>
      <section class="hero">
        <div class="hero-badge">✓ Verified · Insured · On-demand</div>
        <h1>Home services,<br><em>at your door</em><br>in minutes.</h1>
        <p class="hero-sub">Plumbers, electricians & mechanics — verified with real-time national ID checks, tracked live on a map, paid securely via M-Pesa.</p>
        <div class="hero-cta">
          <button class="btn-accent lg" onclick="router.go('register',{role:'client'})">Find a technician</button>
          <button class="btn-ghost lg"  onclick="router.go('register',{role:'technician'})">Join as professional</button>
        </div>
        <div class="hero-stats">
          <div class="stat"><span class="sn">500+</span><span class="sl">Verified pros</span></div>
          <div class="sd"></div>
          <div class="stat"><span class="sn">4.8★</span><span class="sl">Avg rating</span></div>
          <div class="sd"></div>
          <div class="stat"><span class="sn">12 min</span><span class="sl">Avg arrival</span></div>
        </div>
      </section>
      <section class="land-section">
        <h2 class="land-h2">What do you need fixed?</h2>
        <div class="services-grid">
          ${[{icon:'🔧',name:'Plumber',desc:'Leaks, drainage, pipe fitting, water systems',id:'plumber'},
             {icon:'⚡',name:'Electrician',desc:'Wiring, solar, smart home, generators',id:'electrician'},
             {icon:'🚗',name:'Mechanic',desc:'Roadside rescue, diagnostics, brakes & tyres',id:'mechanic'}]
            .map(s=>`<div class="service-tile" onclick="router.go('register',{role:'client'})">
              <div class="st-icon">${s.icon}</div><div class="st-name">${s.name}</div>
              <div class="st-desc">${s.desc}</div><div class="st-arrow">→</div></div>`).join('')}
        </div>
      </section>
      <section class="land-section alt">
        <div style="max-width:960px;margin:0 auto;padding:0 20px">
          <h2 class="land-h2">Why clients trust FixIt</h2>
          <div class="trust-grid">
            ${[{i:'🆔',t:'Real-time IPRS ID verification',d:'Every technician verified against Kenya IPRS database before their first job.'},
               {i:'📍',t:'Live GPS tracking',d:'Watch your technician move toward you live — exactly like ordering a ride.'},
               {i:'💳',t:'Secure M-Pesa payments',d:'Pay only when the job is done. Funds held until you confirm completion.'},
               {i:'⭐',t:'Verified reviews',d:'Every rating is tied to a real completed job. No fake reviews.'},
               {i:'📸',t:'Photo job reports',d:'Send photos so technicians arrive prepared with the right tools.'},
               {i:'🛡️',t:'Background-checked',d:'All technicians are background-checked and professionally certified.'}]
              .map(f=>`<div class="trust-tile"><div class="tt-icon">${f.i}</div><div class="tt-title">${f.t}</div><div class="tt-desc">${f.d}</div></div>`).join('')}
          </div>
        </div>
      </section>
      <section class="land-section">
        <h2 class="land-h2">How it works</h2>
        <div class="steps-row">
          ${[{n:'1',t:'Describe the problem',d:'Tell us what needs fixing and attach photos.'},
             {n:'2',t:'Pick a technician',d:'Browse verified nearby pros, check ratings & rates.'},
             {n:'3',t:'Track them live',d:'Share your location and watch them arrive on the map.'},
             {n:'4',t:'Pay securely',d:'Pay via M-Pesa or card once the job is done.'}]
            .map(s=>`<div class="step-tile"><div class="step-num">${s.n}</div><div class="step-title">${s.t}</div><div class="step-desc">${s.d}</div></div>`).join('')}
        </div>
      </section>
      <footer class="land-footer">
        <div class="logo" style="font-size:22px">Fix<span>It</span></div>
        <p>© 2024 FixIt Technologies Ltd · Nairobi, Kenya · All technicians verified</p>
        <div class="footer-links"><a href="#">Privacy</a> · <a href="#">Terms</a> · <a href="#">Safety</a> · <a href="#">Support</a></div>
      </footer>
    </div>`;
  }

  /* ══════════ LOGIN ══════════ */
  _renderLogin() {
    document.getElementById('app').innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <button class="back-link" onclick="router.go('landing')">← Back</button>
        <div class="logo center">Fix<span>It</span></div>
        <h2>Welcome back</h2><p class="auth-sub">Sign in to your FixIt account</p>
        <div class="form-group"><label>Email</label><input id="lEmail" type="email" placeholder="you@example.com" autocomplete="email"></div>
        <div class="form-group"><label>Password</label>
          <div class="pw-wrap"><input id="lPass" type="password" placeholder="Your password" autocomplete="current-password">
          <button class="pw-eye" onclick="this.previousElementSibling.type=this.previousElementSibling.type==='password'?'text':'password'">👁</button></div>
        </div>
        <button class="btn-accent full" id="loginBtn" onclick="app.doLogin()">Sign in</button>
        <p class="auth-switch">No account? <a href="#" onclick="router.go('register',{role:'client'});return false">Register free</a></p>
        <div class="demo-panel">
          <p class="demo-label">Demo accounts (password: Demo@1234)</p>
          <div class="demo-row">
            <button class="demo-btn" onclick="app.fillDemo('client@fixit.demo')">Client</button>
            <button class="demo-btn" onclick="app.fillDemo('james@fixit.demo')">Technician</button>
            <button class="demo-btn" onclick="app.fillDemo('admin@fixit.ke')">Admin</button>
          </div>
        </div>
      </div>
    </div>`;
  }

  fillDemo(email) {
    document.getElementById('lEmail').value = email;
    document.getElementById('lPass').value  = 'Demo@1234';
  }

  /* ══════════ REGISTER ══════════ */
  _renderRegister(p = {}) {
    const role = p.role || this.state.regRole || 'client';
    this.state.regRole = role;
    document.getElementById('app').innerHTML = `
    <div class="auth-page">
      <div class="auth-card wide">
        <button class="back-link" onclick="router.go('landing')">← Back</button>
        <div class="logo center">Fix<span>It</span></div>
        <div class="tab-switch">
          <button class="${role==='client'?'active':''}" onclick="router.go('register',{role:'client'})">I need help</button>
          <button class="${role==='technician'?'active':''}" onclick="router.go('register',{role:'technician'})">I'm a professional</button>
        </div>
        <h2>${role==='client'?'Create client account':'Register as technician'}</h2>
        <p class="auth-sub">${role==='client'?'Find verified professionals near you':'Start earning on FixIt'}</p>
        <div class="form-row">
          <div class="form-group"><label>Full name <span class="req">*</span></label><input id="rName" type="text" placeholder="John Kamau" autocomplete="name"></div>
          <div class="form-group"><label>Phone <span class="req">*</span></label><input id="rPhone" type="tel" placeholder="+254 7XX XXX XXX"></div>
        </div>
        <div class="form-group"><label>Email <span class="req">*</span></label><input id="rEmail" type="email" placeholder="you@example.com" autocomplete="email"></div>
        <div class="form-group"><label>Password <span class="req">*</span></label>
          <div class="pw-wrap"><input id="rPass" type="password" placeholder="Min 8 characters">
          <button class="pw-eye" onclick="this.previousElementSibling.type=this.previousElementSibling.type==='password'?'text':'password'">👁</button></div>
        </div>
        ${role==='technician'?`
        <hr class="divider"><h3 class="section-sub">Professional details</h3>
        <div class="form-row">
          <div class="form-group"><label>Trade <span class="req">*</span></label>
            <select id="rCat"><option value="plumber">🔧 Plumber</option><option value="electrician">⚡ Electrician</option><option value="mechanic">🚗 Mechanic</option></select>
          </div>
          <div class="form-group"><label>Years experience</label><input id="rExp" type="number" min="0" placeholder="5"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Hourly rate (KES) <span class="req">*</span></label><input id="rRate" type="number" min="500" placeholder="1500"></div>
          <div class="form-group"><label>National ID <span class="req">*</span></label><input id="rIdNum" type="text" placeholder="28471923"></div>
        </div>
        <div class="form-group"><label>Certificate / Licence no. <span class="req">*</span></label><input id="rCert" type="text" placeholder="NCA-PL-3421 / EBK-2023-001 / NTSA-M-1234"></div>
        <div class="form-group"><label>Short bio</label><textarea id="rBio" rows="3" placeholder="Describe your specialties…"></textarea></div>
        <div class="verify-box"><div class="vb-icon">🆔</div>
          <div><strong>IPRS identity verification</strong><br><span>Your National ID will be verified against the Kenya IPRS database. Your account will be activated after admin approval.</span></div>
        </div>`:''}
        <button class="btn-accent full" id="regBtn" onclick="app.doRegister()">
          ${role==='technician'?'Register & submit for verification':'Create account'}
        </button>
        <p class="auth-switch">Already registered? <a href="#" onclick="router.go('login');return false">Sign in</a></p>
      </div>
    </div>`;
  }

  /* ══════════ CLIENT HOME ══════════ */
  async _renderHome() {
    const u = auth.user;
    const hr = new Date().getHours();
    const greet = hr<12?'Good morning':hr<17?'Good afternoon':'Good evening';
    document.getElementById('app').innerHTML = `
    <div class="client-home">
      <div class="home-topbar">
        <div><div class="home-greet">${greet}, <strong>${u.name.split(' ')[0]}</strong> 👋</div>
          <div class="home-loc">📍 ${this.state.location?'Nairobi, Kenya':'Locating…'}</div></div>
        <div class="home-top-right">
          <button class="notif-btn" id="notifBtn" onclick="router.go('notifications')">🔔</button>
          <div class="avatar-sm" onclick="router.go('account')">${u.avatar_initials||u.name[0]}</div>
        </div>
      </div>
      <div class="search-bar-home" onclick="router.go('search',{})">
        <span class="sb-icon">🔍</span><span class="sb-placeholder">Search plumbers, electricians, mechanics…</span>
      </div>
      <div class="section-hdr"><h3>Services</h3></div>
      <div class="cat-row">
        ${[{id:'plumber',icon:'🔧',label:'Plumber'},{id:'electrician',icon:'⚡',label:'Electrician'},{id:'mechanic',icon:'🚗',label:'Mechanic'}]
          .map(c=>`<button class="cat-btn" onclick="router.go('search',{cat:'${c.id}'})"><span class="cb-icon">${c.icon}</span><span class="cb-label">${c.label}</span></button>`).join('')}
      </div>
      <div class="section-hdr"><h3>Available nearby</h3><a href="#" onclick="router.go('search',{});return false">See all</a></div>
      <div id="nearbyList" class="card-scroll"><div class="list-loading">Loading…</div></div>
      <div class="section-hdr" style="margin-top:8px"><h3>Recent bookings</h3><a href="#" onclick="router.go('history');return false">View all</a></div>
      <div id="recentList" class="list-col"><div class="list-loading">Loading…</div></div>
    </div>`;
    this._loadHomeData();
  }

  async _loadHomeData() {
    try {
      const loc = this.state.location || {};
      const [techsRes, bookingsRes, notifsRes] = await Promise.all([
        api.getTechnicians({ online: true, lat: loc.lat, lng: loc.lng, limit: 10 }),
        api.getBookings(),
        api.getNotifications(),
      ]);
      const nearbyEl = document.getElementById('nearbyList');
      const recentEl = document.getElementById('recentList');
      if (nearbyEl) nearbyEl.innerHTML = techsRes.technicians?.length
        ? techsRes.technicians.map(t => this._scrollCard(t)).join('') : '<div class="empty-msg">No technicians online right now.</div>';
      if (recentEl) recentEl.innerHTML = bookingsRes?.length
        ? bookingsRes.slice(0,3).map(b => this._bookingRow(b)).join('') : '<div class="empty-msg">No bookings yet. Find a professional above!</div>';
      const unread = notifsRes?.filter(n => !n.is_read).length || 0;
      const nb = document.getElementById('notifBtn');
      if (nb && unread > 0) nb.innerHTML = `🔔<span class="notif-badge">${unread}</span>`;
    } catch (e) { this.showToast('Could not load data: ' + e.message, 'error'); }
  }

  /* ══════════ SEARCH ══════════ */
  async _renderSearch(p = {}) {
    const cat = p.cat || '';
    this.state.searchCat = cat;
    document.getElementById('app').innerHTML = `
    <div class="search-page">
      <div class="search-topbar">
        <div class="search-input-wrap">
          <span>🔍</span>
          <input id="searchInput" type="search" placeholder="Search professionals…" oninput="app.filterSearch(this.value)">
        </div>
      </div>
      <div class="filter-bar">
        ${['All','Plumber','Electrician','Mechanic'].map(c=>`
        <button class="filter-chip ${(!cat&&c==='All')||(cat===c.toLowerCase())?'active':''}"
          onclick="router.go('search',{cat:'${c==='All'?'':c.toLowerCase()}'})">
          ${c==='Plumber'?'🔧 ':c==='Electrician'?'⚡ ':c==='Mechanic'?'🚗 ':''}${c}
        </button>`).join('')}
      </div>
      <div class="sort-bar">
        <label>Sort:</label>
        <select id="sortSel" onchange="app.sortSearch(this.value)">
          <option value="rating">Top rated</option>
          <option value="distance">Nearest</option>
          <option value="rate">Lowest rate</option>
          <option value="jobs">Most experienced</option>
        </select>
      </div>
      <div id="techGrid" class="tech-grid"><div class="list-loading">Finding professionals…</div></div>
    </div>`;
    this._loadTechGrid();
  }

  async _loadTechGrid() {
    const el = document.getElementById('techGrid'); if (!el) return;
    try {
      const loc  = this.state.location || {};
      const cat  = this.state.searchCat;
      const sort = document.getElementById('sortSel')?.value || 'rating';
      const q    = document.getElementById('searchInput')?.value || '';
      const params = { sort, limit: 50 };
      if (cat)   params.category = cat;
      if (loc.lat) { params.lat = loc.lat; params.lng = loc.lng; }
      const res = await api.getTechnicians(params);
      let techs = res.technicians || [];
      if (q) techs = techs.filter(t => t.name.toLowerCase().includes(q.toLowerCase()) || t.category.includes(q.toLowerCase()));
      el.innerHTML = techs.length ? techs.map(t => this._techCard(t)).join('') : '<div class="empty-msg">No professionals found.</div>';
    } catch(e) { el.innerHTML = '<div class="empty-msg">Could not load. Check connection.</div>'; }
  }

  filterSearch() { this._loadTechGrid(); }
  sortSearch()   { this._loadTechGrid(); }

  /* ══════════ TECH PROFILE ══════════ */
  async _renderTechProfile(p = {}) {
    const techId = p.techId || this.state.viewingTechId;
    let tech     = p.tech   || this.state.viewingTech;
    this.state.viewingTechId = techId || tech?.id;
    document.getElementById('app').innerHTML = `<div class="page-loading">Loading profile…</div>`;
    try {
      if (!tech && techId) tech = await api.getTechnician(techId);
      this.state.viewingTech = tech;
      const stars = n => '★'.repeat(Math.round(n||0)) + '☆'.repeat(5-Math.round(n||0));
      const loc   = this.state.location;
      const dist  = loc && tech.current_lat ? api.distanceKm(loc, {lat:tech.current_lat,lng:tech.current_lng}) : null;
      document.getElementById('app').innerHTML = `
      <div class="profile-page">
        <div class="profile-topbar">
          <button class="back-link white" onclick="router.back()">← Back</button>
          <button class="share-btn" onclick="navigator.share?.({title:'FixIt',url:location.href})">⎋</button>
        </div>
        <div class="profile-hero">
          <div class="profile-av">${tech.avatar_initials||tech.name?.split(' ').map(n=>n[0]).join('')}</div>
          <h2>${tech.name}</h2>
          <div class="profile-cat">${tech.category==='plumber'?'🔧 Plumber':tech.category==='electrician'?'⚡ Electrician':'🚗 Mechanic'}</div>
          ${tech.verify_status==='verified'?'<div class="badge-v">✓ Verified & Certified</div>':'<div class="badge-pend">⏳ Verification pending</div>'}
          <div class="profile-rating">${stars(tech.rating)} <b>${tech.rating||'New'}</b> <span>(${tech.total_jobs||0} jobs, ${tech.total_reviews||0} reviews)</span></div>
          ${dist?`<div class="profile-dist">📍 ${dist} km away</div>`:''}
        </div>
        <div class="profile-body">
          <div class="info-grid-4">
            <div class="ig-item"><div class="ig-l">Experience</div><div class="ig-v">${tech.experience_yrs||0} yrs</div></div>
            <div class="ig-item"><div class="ig-l">Rate</div><div class="ig-v">KES ${(tech.hourly_rate||0).toLocaleString()}/hr</div></div>
            <div class="ig-item"><div class="ig-l">Status</div><div class="ig-v">${tech.is_online?'<span class="dot-online"></span> Online':'Offline'}</div></div>
            <div class="ig-item"><div class="ig-l">Jobs done</div><div class="ig-v">${tech.total_jobs||0}</div></div>
          </div>
          <div class="pcard"><h4>About</h4><p>${tech.bio||'No bio provided.'}</p></div>
          <div class="pcard"><h4>Reviews</h4>
            ${(tech.reviews||[]).length
              ? tech.reviews.map(r=>`<div class="review-item">
                  <div class="ri-top"><span class="ri-stars">${stars(r.rating)}</span><span class="ri-name">${r.client_name||'Client'}</span><span class="ri-date">${new Date(r.created_at).toLocaleDateString()}</span></div>
                  <p class="ri-text">${r.comment||''}</p></div>`).join('')
              : '<p class="muted-p">No reviews yet — be the first!</p>'}
          </div>
          <div class="profile-actions">
            <button class="btn-accent full" onclick="router.go('booking',{tech:app.state.viewingTech})" ${!tech.is_available?'disabled':''}>
              ${tech.is_available?'Book now':'Currently unavailable'}
            </button>
          </div>
        </div>
      </div>`;
    } catch(e) { document.getElementById('app').innerHTML = `<div class="empty-msg">Could not load profile.</div>`; }
  }

  /* ══════════ BOOKING ══════════ */
  _renderBooking(p = {}) {
    const tech = p.tech || this.state.bookingTech;
    if (!tech) { router.go('search'); return; }
    this.state.bookingTech = tech;
    const callout = 500;
    const est = (tech.hourly_rate||0) + callout;
    document.getElementById('app').innerHTML = `
    <div class="booking-page">
      <div class="page-topbar"><button class="back-link" onclick="router.back()">← Back</button><h2>Book ${tech.name?.split(' ')[0]}</h2><div></div></div>
      <div class="booking-body">
        <div class="tech-summary">
          <div class="ts-av">${tech.avatar_initials||tech.name?.split(' ').map(n=>n[0]).join('')}</div>
          <div class="ts-info"><div class="ts-name">${tech.name} ${tech.verify_status==='verified'?'✓':''}</div>
            <div class="ts-meta">${tech.category==='plumber'?'🔧':tech.category==='electrician'?'⚡':'🚗'} ${tech.category} · KES ${(tech.hourly_rate||0).toLocaleString()}/hr</div></div>
          <div class="ts-online ${tech.is_online?'on':''}"></div>
        </div>
        <div class="form-group"><label>Describe the problem <span class="req">*</span></label>
          <textarea id="bIssue" rows="4" placeholder="E.g. Kitchen sink leaking under the pipe joints for 2 days…"></textarea></div>
        <div class="form-group"><label>Attach photos</label>
          <div class="photo-drop" onclick="document.getElementById('bPhotos').click()">
            <div style="font-size:32px">📷</div><div>Tap to add photos</div>
            <div class="muted-sm">Helps the technician arrive prepared</div>
            <input type="file" id="bPhotos" accept="image/*" multiple style="display:none" onchange="app.previewPhotos(this)">
          </div>
          <div id="photoRow" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"></div>
        </div>
        <div class="form-group"><label>Your location <span class="req">*</span></label>
          <div class="loc-field"><span>📍</span>
            <input id="bAddr" type="text" placeholder="Enter your address or estate">
            <button onclick="app.useGPS()" class="gps-btn">Use GPS</button>
          </div>
        </div>
        <div class="form-group"><label>Urgency</label>
          <div class="urgency-grid">
            ${['Emergency (now)','Within 2 hours','Today','Schedule later'].map((u,i)=>`
            <label class="urg-opt"><input type="radio" name="urg" value="${u}" ${i===0?'checked':''}><span>${u}</span></label>`).join('')}
          </div>
        </div>
        <div class="price-box">
          <div class="pb-row"><span>Hourly rate</span><span>KES ${(tech.hourly_rate||0).toLocaleString()}/hr</span></div>
          <div class="pb-row"><span>Call-out fee</span><span>KES ${callout.toLocaleString()}</span></div>
          <div class="pb-row"><span>Platform fee (5%)</span><span>KES ${Math.round(est*.05)}</span></div>
          <div class="pb-row total"><span>Estimated total</span><span>KES ${Math.round(est*1.05).toLocaleString()}+</span></div>
          <p class="muted-sm">Final amount depends on job. You pay only after completion.</p>
        </div>
        <button class="btn-accent full" id="bkBtn" onclick="app.confirmBooking()">Confirm & share location →</button>
      </div>
    </div>`;
  }

  /* ══════════ TRACKING ══════════ */
  async _renderTracking(p = {}) {
    const booking = p.booking || this.state.activeBooking;
    const tech    = p.tech    || this.state.trackingTech;
    if (!booking) { router.go('home'); return; }
    this.state.activeBooking = booking;
    this.state.trackingTech  = tech;

    // A booking that hasn't been accepted yet has no technician en route —
    // show a waiting state instead of a fake live map, and poll until it's accepted.
    if (booking.status === 'pending') {
      document.getElementById('app').innerHTML = `
      <div class="tracking-page" style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:40px 20px">
        <div class="th-av" style="width:64px;height:64px;font-size:22px;margin-bottom:20px">${tech?.avatar_initials||'T'}</div>
        <h2 style="margin-bottom:8px">Waiting for ${tech?.name||'technician'} to accept…</h2>
        <p class="muted-p" style="margin-bottom:24px">You'll see live tracking as soon as they confirm. This usually takes under a minute.</p>
        <div class="splash-spinner" style="margin-bottom:24px"></div>
        <button class="btn-danger sm" onclick="app.cancelBooking()">Cancel booking</button>
      </div>`;
      // Poll for acceptance every 4s
      clearInterval(this._pendingPoll);
      this._pendingPoll = setInterval(async () => {
        try {
          const fresh = await api.getBooking(booking.id);
          if (fresh.status !== 'pending') {
            clearInterval(this._pendingPoll);
            this.state.activeBooking = fresh;
            if (fresh.status === 'cancelled') { this.showToast('Booking was declined.', 'error'); router.go('home'); }
            else router.go('tracking', { booking: fresh, tech });
          }
        } catch (_) {}
      }, 4000);
      // Also react instantly if WS pushes the status change
      api.on('booking_status', msg => {
        if (msg.bookingId === booking.id && msg.status !== 'pending') {
          clearInterval(this._pendingPoll);
          api.getBooking(booking.id).then(fresh => router.go('tracking', { booking: fresh, tech }));
        }
      });
      return;
    }
    clearInterval(this._pendingPoll);

    document.getElementById('app').innerHTML = `
    <div class="tracking-page">
      <div class="tracking-topbar">
        <button onclick="router.go('home')" style="background:none;border:none;color:white;font-size:14px;cursor:pointer">← Home</button>
        <span style="color:white;font-weight:600">Live tracking</span>
        <button onclick="router.go('chat',{bookingId:'${booking.id}'})" style="background:none;border:none;color:white;font-size:22px;cursor:pointer">💬</button>
      </div>
      <div id="liveMap" style="width:100%;height:55vh"></div>
      <div class="tracking-sheet">
        <div class="sheet-handle"></div>
        <div class="tracking-header">
          <div class="th-av">${tech?.avatar_initials||'T'}</div>
          <div class="th-info"><div class="th-name">${tech?.name||'Technician'}</div>
            <div class="th-meta">${tech?.cert_number||''}</div></div>
          <div class="th-actions">
            <button class="icon-round" onclick="app.callTech()">📞</button>
            <button class="icon-round" onclick="router.go('chat',{bookingId:'${booking.id}'})">💬</button>
          </div>
        </div>
        <div class="status-track">
          ${['Confirmed','On the way','Arrived','In progress','Completed'].map((s,i)=>`
          <div class="st-step ${booking.status==='accepted'&&i<=1?'done':booking.status==='in_progress'&&i<=3?'done':booking.status==='completed'?'done':''}">
            <div class="st-dot"></div><div class="st-lbl">${s}</div>
          </div>`).join('')}
        </div>
        <div class="track-footer">
          <button class="btn-danger sm" onclick="app.cancelBooking()">Cancel</button>
          <button class="btn-ghost sm"  onclick="router.go('chat',{bookingId:'${booking.id}'})">Message</button>
          ${booking.status==='in_progress'?`<button class="btn-accent sm" onclick="app.markComplete('${booking.id}')">Mark complete</button>`:''}
        </div>
      </div>
    </div>`;

    const mapEl = document.getElementById('liveMap');
    if (this._map) this._map.destroy();
    this._map = new LiveMap(mapEl);
    const loc = this.state.location || {lat:-1.2921,lng:36.8219};
    const tLat = tech?.current_lat || loc.lat + 0.02;
    const tLng = tech?.current_lng || loc.lng + 0.02;
    this._map.render(loc, {lat:tLat,lng:tLng}, tech?.name||'Technician', (eta) => {
      if (eta === 0) this.showToast('🎉 Technician has arrived!', 'success');
    });

    // Real-time location via WebSocket
    api.on('tech_location', msg => {
      if (msg.bookingId === booking.id && this._map) this._map.moveTech(msg.lat, msg.lng);
    });
    api.on('booking_status', msg => {
      if (msg.bookingId === booking.id) {
        if (msg.status === 'completed') router.go('payment', { booking });
      }
    });
  }

  /* ══════════ CHAT ══════════ */
  async _renderChat(p = {}) {
    const bookingId = p.bookingId || this.state.chatBookingId;
    this.state.chatBookingId = bookingId;
    clearInterval(this._poll);
    document.getElementById('app').innerHTML = `
    <div class="chat-page">
      <div class="chat-topbar"><button class="back-link" onclick="router.back()">← Back</button><h2>Job Chat</h2><div></div></div>
      <div id="chatMsgs" class="chat-msgs"><div class="list-loading">Loading…</div></div>
      <div class="chat-bar">
        <input id="chatIn" type="text" placeholder="Type a message…" onkeydown="if(event.key==='Enter')app.sendMsg()">
        <button class="btn-accent" onclick="app.sendMsg()">→</button>
      </div>
    </div>`;
    if (bookingId) {
      await this._loadMessages(bookingId);
      this._poll = setInterval(() => this._loadMessages(bookingId), 5000);
    }
  }

  async _loadMessages(bookingId) {
    const el = document.getElementById('chatMsgs'); if (!el) { clearInterval(this._poll); return; }
    try {
      const msgs = await api.getMessages(bookingId);
      el.innerHTML = msgs.length ? msgs.map(m=>`
        <div class="msg-wrap ${m.sender_id===auth.user?.id?'mine':'theirs'}">
          <div class="bubble">${this._esc(m.body)}</div>
          <div class="msg-time">${new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>
        </div>`).join('') : '<div class="empty-msg">No messages yet. Say hello!</div>';
      el.scrollTop = el.scrollHeight;
    } catch(_) {}
  }

  async sendMsg() {
    const input = document.getElementById('chatIn'); if (!input?.value.trim()) return;
    const bId   = this.state.chatBookingId; if (!bId) return;
    const body  = input.value.trim(); input.value = '';
    try {
      // Send via WebSocket (fast) – also saved to DB server-side
      api.wsSend({ type:'chat_message', bookingId:bId, body });
      // Fallback: also HTTP in case WS is disconnected
      await api.sendMessage(bId, body).catch(()=>{});
      await this._loadMessages(bId);
    } catch(e) { this.showToast('Could not send message', 'error'); }
  }

  /* ══════════ PAYMENT ══════════ */
  _renderPayment(p = {}) {
    const booking = p.booking || this.state.payBooking;
    if (!booking) { router.go('home'); return; }
    this.state.payBooking = booking;
    const base    = parseFloat(booking.final_amount || booking.estimated_rate || 2000) + 500;
    const fee     = Math.round(base * 0.05 * 100) / 100;
    const total   = Math.round((base + fee) * 100) / 100;
    document.getElementById('app').innerHTML = `
    <div class="payment-page">
      <div class="page-topbar"><button class="back-link" onclick="router.go('home')">← Home</button><h2>Pay for service</h2><div></div></div>
      <div class="payment-body">
        <div class="invoice-card">
          <div class="invoice-hdr">🧾 Invoice <span>#${(booking.id||'').slice(0,8).toUpperCase()}</span></div>
          <div class="inv-row"><span>Service charge</span><span>KES ${(base-500).toLocaleString()}</span></div>
          <div class="inv-row"><span>Call-out fee</span><span>KES 500</span></div>
          <div class="inv-row"><span>Platform fee (5%)</span><span>KES ${fee.toLocaleString()}</span></div>
          <div class="inv-row total"><span>Total</span><span>KES ${total.toLocaleString()}</span></div>
        </div>
        <h4 style="margin:20px 0 10px">Pay with</h4>
        <div class="pay-methods">
          <label class="pay-opt"><input type="radio" name="pm" value="mpesa" checked onchange="document.getElementById('mpesaSec').style.display='block'">
            <span>📱 M-Pesa</span></label>
          <label class="pay-opt"><input type="radio" name="pm" value="card" onchange="document.getElementById('mpesaSec').style.display='none'">
            <span>💳 Card</span></label>
          <label class="pay-opt"><input type="radio" name="pm" value="wallet" onchange="document.getElementById('mpesaSec').style.display='none'">
            <span>👛 FixIt Wallet</span></label>
        </div>
        <div id="mpesaSec">
          <div class="form-group"><label>M-Pesa phone number</label>
            <input id="mpesaNo" type="tel" placeholder="+254 7XX XXX XXX" value="${auth.user?.phone||''}">
          </div>
          <p class="muted-sm">You'll receive an STK push to confirm payment on your phone.</p>
        </div>
        <button class="btn-accent full" id="payBtn" onclick="app.processPayment(${total})">
          Pay KES ${total.toLocaleString()}
        </button>
        <p class="muted-sm center" style="margin-top:10px">🔒 Secured · Technician paid only after you confirm job completion</p>
      </div>
    </div>`;
  }

  /* ══════════ REVIEW ══════════ */
  _renderReview(p = {}) {
    this.state.reviewBooking = p.booking || this.state.reviewBooking;
    this.state.reviewTech    = p.tech    || this.state.reviewTech;
    const tech = this.state.reviewTech;
    document.getElementById('app').innerHTML = `
    <div class="review-page">
      <div class="page-topbar"><button class="back-link" onclick="router.go('home')">Skip</button><h2>Rate the service</h2><div></div></div>
      <div class="review-body">
        <div class="review-av">${tech?.avatar_initials||'T'}</div>
        <h3>${tech?.name||'Technician'}</h3>
        <p class="muted-p">How was your experience?</p>
        <div class="star-row" id="starRow">
          ${[1,2,3,4,5].map(n=>`<button class="star-btn" onclick="app.setRating(${n})">★</button>`).join('')}
        </div>
        <div class="form-group" style="margin-top:20px;text-align:left"><label>Comment (optional)</label>
          <textarea id="reviewText" rows="4" placeholder="Share your experience…"></textarea>
        </div>
        <button class="btn-accent full" onclick="app.submitReview()">Submit review</button>
      </div>
    </div>`;
    this.state.reviewRating = 5;
    this.setRating(5);
  }

  setRating(n) {
    this.state.reviewRating = n;
    document.querySelectorAll('.star-btn').forEach((b,i) => b.style.color = i<n ? '#F59E0B' : 'rgba(255,255,255,0.2)');
  }

  /* ══════════ HISTORY ══════════ */
  async _renderHistory() {
    document.getElementById('app').innerHTML = `
    <div class="history-page">
      <div class="page-topbar"><div></div><h2>My bookings</h2><div></div></div>
      <div id="histList" class="list-col"><div class="list-loading">Loading…</div></div>
    </div>`;
    try {
      const bookings = await api.getBookings();
      const el = document.getElementById('histList');
      el.innerHTML = bookings?.length ? bookings.map(b=>this._bookingRow(b,'full')).join('') : '<div class="empty-msg">No bookings yet.</div>';
    } catch(e) { document.getElementById('histList').innerHTML = '<div class="empty-msg">Could not load bookings.</div>'; }
  }

  /* ══════════ ACCOUNT ══════════ */
  async _renderAccount() {
    const u = auth.user;
    document.getElementById('app').innerHTML = `
    <div class="account-page">
      <div class="acct-hero">
        <div class="acct-av">${u.avatar_initials||u.name[0]}</div>
        <h2>${u.name}</h2>
        <p class="muted-p">${u.email}</p>
        <p class="muted-p">${u.phone}</p>
      </div>
      <div class="acct-menu">
        ${[
          {icon:'📋',label:'My bookings',      action:"router.go('history')"},
          {icon:'🔔',label:'Notifications',     action:"router.go('notifications')"},
          {icon:'🔒',label:'Change password',    action:"app.showToast('Coming soon','info')"},
          {icon:'💳',label:'Payment methods',    action:"app.showToast('Coming soon','info')"},
          {icon:'🛡️',label:'Safety & support',  action:"app.showToast('Coming soon','info')"},
          ...(auth.isAdmin()?[{icon:'⚙️',label:'Admin panel',action:"router.go('admin')"}]:[]),
        ].map(m=>`<button class="menu-row" onclick="${m.action}"><span class="mr-icon">${m.icon}</span><span>${m.label}</span><span>›</span></button>`).join('')}
        <button class="menu-row danger" onclick="app.logout()"><span class="mr-icon">🚪</span><span>Sign out</span></button>
      </div>
    </div>`;
  }

  /* ══════════ NOTIFICATIONS ══════════ */
  async _renderNotifications() {
    document.getElementById('app').innerHTML = `
    <div class="notif-page">
      <div class="page-topbar"><button class="back-link" onclick="router.back()">← Back</button><h2>Notifications</h2><div></div></div>
      <div id="notifList" class="list-col"><div class="list-loading">Loading…</div></div>
    </div>`;
    try {
      await api.markNotificationsRead();
      const notifs = await api.getNotifications();
      const el = document.getElementById('notifList');
      el.innerHTML = notifs?.length ? notifs.map(n=>`
        <div class="notif-row"><div class="nr-title">${this._esc(n.title)}</div>
          <div class="nr-body">${this._esc(n.body)}</div>
          <div class="nr-time">${new Date(n.created_at).toLocaleString()}</div>
        </div>`).join('') : '<div class="empty-msg">No notifications yet.</div>';
    } catch(_) {}
  }

  /* ══════════ TECH DASHBOARD ══════════ */
  async _renderTechDash() {
    const u = auth.user;
    document.getElementById('app').innerHTML = `
    <div class="tech-dash">
      <div class="td-topbar">
        <div class="logo">Fix<span>It</span></div>
        <div style="display:flex;align-items:center;gap:12px">
          <div class="avail-toggle ${u.is_online?'on':''}" id="availToggle" onclick="app.toggleOnline()">
            <div class="avail-knob"></div>
            <span id="availLabel">${u.is_online?'Online':'Offline'}</span>
          </div>
          <div class="avatar-sm" onclick="router.go('account')">${u.avatar_initials||u.name[0]}</div>
        </div>
      </div>
      ${u.verify_status!=='verified'?`<div class="alert-warn">⚠️ Your identity is being verified. You can accept jobs once approved (usually within 24h).</div>`:''}
      <div class="td-hero">
        <div class="td-greet">Hey, ${u.name?.split(' ')[0]} 👋</div>
        <div class="td-stats">
          <div class="ts-card"><div class="ts-n">${u.total_jobs||0}</div><div class="ts-l">Total jobs</div></div>
          <div class="ts-card"><div class="ts-n">${u.rating||'—'}★</div><div class="ts-l">Rating</div></div>
          <div class="ts-card"><div class="ts-n">KES ${((u.total_jobs||0)*(u.hourly_rate||0)).toLocaleString()}</div><div class="ts-l">Est. earned</div></div>
        </div>
      </div>
      <div class="td-section"><h3>Incoming requests</h3></div>
      <div id="tdIncoming" class="list-col"><div class="list-loading">Loading…</div></div>
      <div class="td-section"><h3>Completed jobs</h3></div>
      <div id="tdDone" class="list-col"><div class="list-loading">Loading…</div></div>
      <div style="padding:20px;text-align:center"><button class="btn-ghost" onclick="app.logout()">Sign out</button></div>
    </div>`;
    this._loadTechJobs();

    // Listen for new booking requests via WS
    api.on('booking', msg => { this.showToast('📋 New booking request!', 'info'); this._loadTechJobs(); });
  }

  async _loadTechJobs() {
    try {
      const [active, done] = await Promise.all([
        api.myJobs('pending'),
        api.myJobs('completed'),
      ]);
      const el1 = document.getElementById('tdIncoming');
      const el2 = document.getElementById('tdDone');
      if (el1) el1.innerHTML = active?.length ? active.map(b=>this._techJobCard(b)).join('') : '<div class="empty-msg">No active requests.</div>';
      if (el2) el2.innerHTML = done?.length   ? done.slice(0,10).map(b=>this._bookingRow(b)).join('') : '<div class="empty-msg">No completed jobs yet.</div>';
    } catch(_) {}
  }

  /* ══════════ ADMIN ══════════ */
  async _renderAdmin() {
    if (!auth.isAdmin()) { router.go('home'); return; }
    document.getElementById('app').innerHTML = `
    <div class="admin-page">
      <div class="page-topbar"><button class="back-link" onclick="router.back()">← Back</button><h2>Admin Panel</h2><div></div></div>
      <div id="adminStats" class="admin-stats"><div class="list-loading">Loading…</div></div>
      <div class="admin-section"><h3>Pending verifications</h3>
        <div id="adminPending" class="list-col"><div class="list-loading">Loading…</div></div>
      </div>
      <div class="admin-section"><h3>Recent bookings</h3>
        <div id="adminBookings" class="list-col"><div class="list-loading">Loading…</div></div>
      </div>
    </div>`;
    try {
      const [stats, pending, bookings] = await Promise.all([
        api.adminStats(),
        api.adminTechnicians('pending'),
        api.adminBookings(),
      ]);
      document.getElementById('adminStats').innerHTML = `
        <div class="ad-s"><div>${stats.totalUsers}</div><span>Users</span></div>
        <div class="ad-s"><div>${stats.totalTechs}</div><span>Technicians</span></div>
        <div class="ad-s"><div>${stats.totalBookings}</div><span>Bookings</span></div>
        <div class="ad-s"><div>KES ${(stats.totalRevenue||0).toLocaleString()}</div><span>Revenue</span></div>`;
      document.getElementById('adminPending').innerHTML = pending?.length
        ? pending.map(t=>`<div class="admin-row">
            <div><strong>${t.name}</strong> · ${t.category} · ${t.cert_number}<br>
              <small style="color:var(--muted)">${t.email} · ID: ${t.id_number}</small></div>
            <div class="admin-actions">
              <button class="btn-accent sm" onclick="app.approveTech('${t.id}')">Approve</button>
              <button class="btn-danger sm" onclick="app.rejectTech('${t.id}')">Reject</button>
            </div></div>`).join('')
        : '<div class="empty-msg">No pending verifications.</div>';
      document.getElementById('adminBookings').innerHTML = bookings?.length
        ? bookings.slice(0,20).map(b=>`<div class="admin-row">
            <span>${b.id.slice(0,8)}</span><span>${b.client_name}</span>
            <span>${b.tech_name}</span><span>${b.status}</span>
            <span>${new Date(b.created_at).toLocaleDateString()}</span></div>`).join('')
        : '<div class="empty-msg">No bookings.</div>';
    } catch(e) { this.showToast('Admin load error: '+e.message,'error'); }
  }

  /* ══════════ CARD TEMPLATES ══════════ */
  _scrollCard(t) {
    const loc  = this.state.location;
    const dist = loc && t.current_lat ? api.distanceKm(loc,{lat:t.current_lat,lng:t.current_lng}) : null;
    return `<div class="scroll-card" onclick="router.go('techProfile',{techId:'${t.id}',tech:${JSON.stringify(t).replace(/"/g,'&quot;')}})">
      <div class="sc-av">${t.avatar_initials||t.name?.split(' ').map(n=>n[0]).join('')}</div>
      <div class="sc-name">${t.name?.split(' ')[0]}</div>
      <div class="sc-cat">${t.category==='plumber'?'🔧':t.category==='electrician'?'⚡':'🚗'}</div>
      <div class="sc-rating">★ ${t.rating||'New'}</div>
      ${dist?`<div class="sc-dist">${dist}km</div>`:''}
      ${t.is_online?'<div class="sc-online"></div>':''}
    </div>`;
  }

  _techCard(t) {
    const loc  = this.state.location;
    const dist = loc && t.current_lat ? api.distanceKm(loc,{lat:t.current_lat,lng:t.current_lng}) : null;
    const stars = n => '★'.repeat(Math.round(n||0))+'☆'.repeat(5-Math.round(n||0));
    return `<div class="tech-card" onclick="router.go('techProfile',{techId:'${t.id}',tech:${JSON.stringify(t).replace(/"/g,'&quot;')}})">
      <div class="tc-top">
        <div class="tc-av">${t.avatar_initials||t.name?.split(' ').map(n=>n[0]).join('')}</div>
        <div class="tc-info">
          <div class="tc-name">${t.name} ${t.verify_status==='verified'?'<span class="v-badge">✓ ID</span>':''} ${t.is_online?'<span class="dot-online"></span>':''}</div>
          <div class="tc-meta">${t.category==='plumber'?'🔧 Plumber':t.category==='electrician'?'⚡ Electrician':'🚗 Mechanic'} · ${t.experience_yrs||0} yrs exp</div>
          <div class="tc-stars">${stars(t.rating)} <span class="tc-rcount">${t.rating||'New'} (${t.total_jobs||0} jobs)</span></div>
        </div>
        <div class="tc-rate"><div>KES ${(t.hourly_rate||0).toLocaleString()}</div><div class="muted-sm">/hr</div>${dist?`<div class="tc-dist">${dist}km</div>`:''}</div>
      </div>
      <p class="tc-bio">${(t.bio||'').slice(0,100)}…</p>
    </div>`;
  }

  _bookingRow(b) {
    const sc={pending:'#F59E0B',accepted:'#3B82F6',in_progress:'#8B5CF6',completed:'#00C896',cancelled:'#EF4444'};
    const col=sc[b.status]||'#888';
    return `<div class="booking-row" onclick="app.openBooking('${b.id}','${b.status}')">
      <div class="br-top">
        <div class="br-issue">${this._esc((b.issue_title||b.issue_desc||'Job').slice(0,60))}…</div>
        <span class="br-status" style="background:${col}18;color:${col}">${b.status.replace('_',' ')}</span>
      </div>
      <div class="br-meta"><span>${b.tech_name||b.techName||'Technician'}</span><span>${new Date(b.created_at||b.createdAt).toLocaleDateString()}</span></div>
    </div>`;
  }

  _techJobCard(b) {
    return `<div class="job-card">
      <div class="jc-top">
        <span class="br-status" style="background:rgba(59,130,246,.12);color:#3B82F6">${b.status}</span>
        <span class="muted-sm">${new Date(b.created_at).toLocaleDateString()}</span>
      </div>
      <p class="jc-issue">${this._esc((b.issue_title||'').slice(0,80))}</p>
      <p class="jc-addr">📍 ${b.address||'Location shared'}</p>
      <p class="muted-sm">Client: ${b.client_name||'Client'} · ${b.urgency||''}</p>
      <div class="jc-actions">
        <button class="btn-accent sm" onclick="app.acceptJob('${b.id}')">Accept</button>
        <button class="btn-ghost sm"  onclick="router.go('chat',{bookingId:'${b.id}'})">Message</button>
        <button class="btn-ghost sm"  onclick="app.declineJob('${b.id}')">Decline</button>
      </div>
    </div>`;
  }

  /* ══════════ ACTIONS ══════════ */
  async doLogin() {
    const btn = document.getElementById('loginBtn');
    const email = document.getElementById('lEmail')?.value.trim();
    const pass  = document.getElementById('lPass')?.value;
    if (!email||!pass) { this.showToast('Please fill in all fields','error'); return; }
    btn.textContent='Signing in…'; btn.disabled=true;
    try {
      await auth.login(email, pass);
      this._showNav(true);
      router.go(auth.isTech()?'techDash':'home', {}, false);
    } catch(e) { this.showToast(e.message,'error'); btn.textContent='Sign in'; btn.disabled=false; }
  }

  async doRegister() {
    const btn  = document.getElementById('regBtn');
    const role = this.state.regRole || 'client';
    const name  = document.getElementById('rName')?.value.trim();
    const email = document.getElementById('rEmail')?.value.trim();
    const phone = document.getElementById('rPhone')?.value.trim();
    const pass  = document.getElementById('rPass')?.value;
    if (!name||!email||!phone||!pass) { this.showToast('Please fill in all required fields','error'); return; }
    if (pass.length<8) { this.showToast('Password must be at least 8 characters','error'); return; }
    btn.textContent = role==='technician'?'Verifying identity…':'Creating account…'; btn.disabled=true;
    try {
      const data = { name, email, phone, password: pass, role };
      if (role==='technician') {
        const idNumber  = document.getElementById('rIdNum')?.value.trim();
        const certNumber= document.getElementById('rCert')?.value.trim();
        const category  = document.getElementById('rCat')?.value;
        if (!idNumber||!certNumber||!category) {
          this.showToast('Complete all technician fields','error');
          btn.textContent='Register & submit for verification'; btn.disabled=false; return;
        }
        const loc = this.state.location || { lat:-1.2921, lng:36.8219 };
        Object.assign(data, {
          category, experienceYrs: parseInt(document.getElementById('rExp')?.value)||0,
          hourlyRate: parseInt(document.getElementById('rRate')?.value)||1500,
          idNumber, certNumber, bio: document.getElementById('rBio')?.value.trim()||'',
          currentLat: loc.lat, currentLng: loc.lng,
        });
        this.showToast('Checking IPRS national ID database…', 'info', 2000);
      }
      await auth.register(data);
      this.showToast('Account created! Welcome to FixIt 🎉','success');
      this._showNav(true);
      router.go(role==='technician'?'techDash':'home', {}, false);
    } catch(e) {
      this.showToast(e.message,'error');
      btn.textContent=role==='technician'?'Register & submit for verification':'Create account'; btn.disabled=false;
    }
  }

  async confirmBooking() {
    const tech  = this.state.bookingTech; if (!tech) return;
    const issue = document.getElementById('bIssue')?.value.trim();
    const addr  = document.getElementById('bAddr')?.value.trim();
    const urg   = document.querySelector('input[name="urg"]:checked')?.value||'normal';
    if (!issue) { this.showToast('Please describe the problem','error'); return; }
    if (!addr)  { this.showToast('Please enter your address','error'); return; }
    const btn = document.getElementById('bkBtn');
    btn.textContent='Confirming…'; btn.disabled=true;
    try {
      const loc = this.state.location||{};
      const booking = await api.createBooking({
        technicianId: tech.id||tech.user_id,
        issueTitle:   issue.slice(0,200),
        issueDesc:    issue,
        urgency:      urg,
        address:      addr,
        clientLat:    loc.lat||null,
        clientLng:    loc.lng||null,
      });
      // Upload photos if any
      const photoInput = document.getElementById('bPhotos');
      if (photoInput?.files?.length) {
        await api.uploadMedia(booking.id, Array.from(photoInput.files)).catch(()=>{});
      }
      this.state.activeBooking = booking;
      this.state.trackingTech  = tech;
      this.showToast('Booking confirmed! Tracking '+tech.name+'…','success');
      router.go('tracking', { booking, tech });
    } catch(e) {
      this.showToast(e.message,'error');
      btn.textContent='Confirm & share location →'; btn.disabled=false;
    }
  }

  async processPayment(total) {
    const btn    = document.getElementById('payBtn');
    const method = document.querySelector('input[name="pm"]:checked')?.value||'mpesa';
    const phone  = document.getElementById('mpesaNo')?.value;
    if (method==='mpesa'&&!phone) { this.showToast('Enter your M-Pesa number','error'); return; }
    btn.textContent='Processing…'; btn.disabled=true;
    try {
      await api.initiatePayment({
        bookingId: this.state.payBooking?.id,
        method, mpesaPhone: method==='mpesa'?phone:undefined,
      });
      if (method==='mpesa') this.showToast('STK push sent to '+phone+'. Confirm on your phone.','info',5000);
      btn.textContent='✓ Payment initiated'; btn.style.background='#00C896';
      setTimeout(()=>router.go('review',{booking:this.state.payBooking,tech:this.state.trackingTech}), 3000);
    } catch(e) {
      this.showToast(e.message,'error');
      btn.textContent='Pay KES '+total.toLocaleString(); btn.disabled=false;
    }
  }

  async submitReview() {
    const booking = this.state.reviewBooking;
    const tech    = this.state.reviewTech||this.state.trackingTech;
    try {
      if (booking) await api.createReview({
        bookingId: booking.id,
        rating:  this.state.reviewRating||5,
        comment: document.getElementById('reviewText')?.value.trim()||'',
      });
      this.showToast('Review submitted! Thank you.','success');
      router.go('home');
    } catch(e) { router.go('home'); }
  }

  async openBooking(id, status) {
    try {
      const booking = await api.getBooking(id);
      if (['accepted','in_progress'].includes(booking.status)) {
        this.state.activeBooking = booking;
        router.go('tracking', { booking, tech: { id: booking.technician_id, name: booking.tech_name, avatar_initials: booking.tech_avatar, cert_number: booking.cert_number, current_lat: booking.tech_lat, current_lng: booking.tech_lng } });
      } else if (booking.status==='completed') {
        this.state.payBooking = booking;
        router.go('payment', { booking });
      }
    } catch(e) { this.showToast('Could not open booking','error'); }
  }

  async acceptJob(bookingId) {
    try {
      await api.acceptBooking(bookingId);
      this.showToast('Job accepted! Client has been notified.','success');
      this._loadTechJobs();
    } catch(e) { this.showToast(e.message,'error'); }
  }

  async declineJob(bookingId) {
    try {
      await api.cancelBooking(bookingId, 'Technician declined');
      this.showToast('Job declined.','info');
      this._loadTechJobs();
    } catch(e) { this.showToast(e.message,'error'); }
  }

  async markComplete(bookingId) {
    try {
      await api.completeBooking(bookingId);
      this.showToast('Job marked complete. Waiting for client payment.','success');
      const booking = await api.getBooking(bookingId);
      router.go('payment', { booking });
    } catch(e) { this.showToast(e.message,'error'); }
  }

  async cancelBooking() {
    if (!confirm('Cancel this booking?')) return;
    try {
      clearInterval(this._pendingPoll);
      const b = this.state.activeBooking;
      if (b) await api.cancelBooking(b.id, 'Cancelled by client');
      if (this._map) { this._map.destroy(); this._map=null; }
      this.showToast('Booking cancelled.','info');
      router.go('home');
    } catch(e) { this.showToast(e.message,'error'); }
  }

  async toggleOnline() {
    const tog   = document.getElementById('availToggle');
    const label = document.getElementById('availLabel');
    const on    = !tog?.classList.contains('on');
    try {
      await api.updateAvailability({ isOnline: on, isAvailable: on });
      tog?.classList.toggle('on', on);
      if (label) label.textContent = on?'Online':'Offline';
      auth.user.is_online = on;
      this.showToast(on?'You are now online':'You are offline','info');
    } catch(e) { this.showToast(e.message,'error'); }
  }

  async approveTech(id) {
    try { await api.adminVerifyTech(id,'verified'); this.showToast('Technician approved ✓','success'); this._renderAdmin(); }
    catch(e) { this.showToast(e.message,'error'); }
  }

  async rejectTech(id) {
    try { await api.adminVerifyTech(id,'rejected'); this.showToast('Technician rejected','info'); this._renderAdmin(); }
    catch(e) { this.showToast(e.message,'error'); }
  }

  callTech() { this.showToast('📞 Calling technician…','info'); }

  async useGPS() {
    const loc = await api.getPosition();
    this.state.location = loc;
    const f = document.getElementById('bAddr');
    if (f) f.value = 'GPS location confirmed ('+loc.lat.toFixed(4)+', '+loc.lng.toFixed(4)+')';
    this.showToast('📍 GPS location captured','success');
  }

  previewPhotos(input) {
    const row = document.getElementById('photoRow'); if (!row) return;
    row.innerHTML = '';
    Array.from(input.files).slice(0,5).forEach(f => {
      const r = new FileReader();
      r.onload = e => {
        const img = document.createElement('img');
        img.src = e.target.result;
        img.style.cssText = 'width:70px;height:70px;object-fit:cover;border-radius:8px;border:1px solid rgba(255,255,255,.15)';
        row.appendChild(img);
      };
      r.readAsDataURL(f);
    });
  }

  async logout() {
    clearInterval(this._poll);
    clearInterval(this._pendingPoll);
    if (this._map) { this._map.destroy(); this._map=null; }
    await auth.logout();
  }

  _esc(str) {
    return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  showToast(msg, type='info', duration=3500) {
    const container = document.getElementById('toastContainer'); if (!container) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.style.background = {success:'#00C896',error:'#EF4444',info:'#3B82F6',warning:'#F59E0B'}[type]||'#3B82F6';
    t.textContent = msg;
    container.appendChild(t);
    setTimeout(()=>t.classList.add('toast-out'), duration-300);
    setTimeout(()=>t.remove(), duration);
  }
}

window.app = new FixItApp();
document.addEventListener('DOMContentLoaded', () => app.boot());
