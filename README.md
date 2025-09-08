# Field Service App (Vite + React + Tailwind)

## Run locally
```bash
npm install
npm run dev
```
Open the URL shown (usually http://localhost:5173).

## Build
```bash
npm run build
npm run preview
```

## Deploy to Netlify
- Push this folder to GitHub.
- In Netlify: **Add new site → Import from Git** → select your repo.
- Build command: `npm run build`
- Publish directory: `dist`

## Notes
- Large scripture/topic library is in `public/data/suggestions.json` and is auto-loaded at startup.
- Data you enter is stored in `localStorage` on the device.
