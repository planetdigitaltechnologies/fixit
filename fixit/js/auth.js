/* FixIt – Auth (backed by PostgreSQL via API) */
class Auth {
  constructor() {
    this.user = null;
    this.tech = null;
    this._listeners = [];
  }

  async init() {
    if (!api._accessToken) return false;
    try {
      const me = await api.me();
      this.user = me;
      if (me.role === 'technician') this.tech = me;
      this._notify();
      api.connectWS();
      return true;
    } catch {
      api.clearTokens();
      return false;
    }
  }

  async register(data) {
    const res = await api.register(data);
    this.user = res.user;
    if (res.user.role === 'technician') this.tech = res.user;
    api.connectWS();
    this._notify();
    return res.user;
  }

  async login(email, password) {
    const res = await api.login(email, password);
    this.user = res.user;
    if (res.user.role === 'technician') this.tech = res.user;
    api.connectWS();
    this._notify();
    return res.user;
  }

  async logout() {
    await api.logout();
    this.user = null;
    this.tech = null;
    this._notify();
  }

  isAdmin()  { return this.user?.role === 'admin'; }
  isClient() { return this.user?.role === 'client'; }
  isTech()   { return this.user?.role === 'technician'; }
  loggedIn() { return !!this.user; }

  onChange(fn) { this._listeners.push(fn); }
  _notify()    { this._listeners.forEach(fn => fn(this.user)); }
}
window.auth = new Auth();
