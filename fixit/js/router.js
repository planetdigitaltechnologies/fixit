/* FixIt – Client-side router */
class Router {
  constructor() {
    this.routes    = {};
    this.current   = null;
    this.params    = {};
    this.history   = [];
  }

  register(name, renderFn) { this.routes[name] = renderFn; return this; }

  async go(name, params = {}, addHistory = true) {
    if (!this.routes[name]) { console.warn('Unknown route:', name); return; }
    if (addHistory && this.current) this.history.push({ name: this.current, params: this.params });
    this.current = name;
    this.params  = params;
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.route === name);
    });
    const app = document.getElementById('app');
    app.classList.add('page-exit');
    await new Promise(r => setTimeout(r, 120));
    app.innerHTML = '';
    await this.routes[name](params);
    app.classList.remove('page-exit');
    app.classList.add('page-enter');
    await new Promise(r => setTimeout(r, 10));
    app.classList.remove('page-enter');
    window.scrollTo(0, 0);
  }

  back() {
    const prev = this.history.pop();
    if (prev) this.go(prev.name, prev.params, false);
    else       this.go('home', {}, false);
  }
}

window.router = new Router();
