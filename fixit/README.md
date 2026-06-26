# FixIt – Home Services On Demand

A full production PWA for connecting clients with verified plumbers, electricians, and mechanics in Kenya.

## Features
- **Client app**: Search professionals by category, view profiles & ratings, book with photo/location sharing, live GPS tracking (Uber-style), in-app chat, M-Pesa & card payment, reviews
- **Technician app**: Register with IPRS ID verification, toggle online/offline, accept/decline jobs, view history & earnings
- **Admin panel**: Approve/reject technicians, view all bookings and users
- **PWA**: Installs on phone home screen, works offline, push notifications

## Tech Stack
- Vanilla JS (no framework — fast, lightweight)
- IndexedDB (all data persists permanently on device)
- Service Worker v2 (offline + caching + push)
- Web App Manifest (installable PWA)
- CSS custom properties (dark theme)

## Deploy in 2 minutes

### Netlify (recommended — free)
1. Drag the `fixit/` folder to [app.netlify.com/drop](https://app.netlify.com/drop)
2. Done. Your app is live at `https://random-name.netlify.app`
3. Add custom domain in Netlify settings

### Vercel
```bash
npm i -g vercel
cd fixit
vercel --prod
```

### GitHub Pages
1. Push this folder to a GitHub repo
2. Go to Settings → Pages → Deploy from branch → main
3. Live at `https://yourusername.github.io/fixit`

### Apache/cPanel (shared hosting)
1. Upload all files to `public_html/`
2. `.htaccess` handles routing automatically

## File Structure
```
fixit/
├── index.html          # App shell (entry point)
├── manifest.json       # PWA manifest
├── sw.js               # Service worker (offline/caching)
├── netlify.toml        # Netlify deploy config
├── vercel.json         # Vercel deploy config
├── .htaccess           # Apache routing config
├── css/
│   └── app.css         # All styles
├── js/
│   ├── db.js           # IndexedDB (all data storage)
│   ├── auth.js         # Login/register/sessions
│   ├── api.js          # IPRS/M-Pesa/push API layer
│   ├── map.js          # Live GPS tracking map
│   ├── router.js       # Client-side page router
│   └── app.js          # All screens & app logic
└── icons/              # PWA icons (all sizes)
```

## Connecting a Real Backend
The `api.js` file has stub functions ready to replace with real APIs:
- `api.verifyID()` → Connect to Kenya IPRS API
- `api.mpesaSTK()` → Connect to Safaricom Daraja API
- `api.subscribePush()` → Connect to a push server (e.g. OneSignal, Firebase)

For a full backend, use Supabase (free tier) as a drop-in backend — swap IndexedDB calls in `db.js` with Supabase queries.
