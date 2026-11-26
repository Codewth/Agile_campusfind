# CampusFind — Full-stack smart lost-and-found platform

## University platform features

CampusFind now includes a responsive light/dark interface, personalised dashboard, an interactive schematic campus map with C Block C1–C12, D Block D1–D6, A/B/K/P/N Blocks, Gobbler, Paid Mess, Parking and LRC, location activity heatmap, saved reports, private inventory, notifications, private recovery conversations, database-backed campus assistance, enhanced claim statuses, report timelines, renewal and administrator analytics. Location markers open reports for that place. Map positions are schematic rather than surveyed coordinates; estimates and match scores are never presented as proof of ownership.

CampusFind is a **working full-stack development project**, with a React/Vite/Tailwind frontend and its own **Node.js HTTP API + persistent SQLite backend**. It no longer needs Firebase credentials to run locally. This application is a proposed software implementation beyond the discovery-only *Agile Software Development – Submission 1* PDF; the sample interviews in that PDF are illustrative, not verified research evidence.

## What's included

- Register, log in and log out with secure server-side password hashing (scrypt), random revocable sessions and HttpOnly, SameSite cookies.
- Public catalog of lost/found item reports with server-side search/filter/pagination; create, edit and delete your own reports.
- Optional JPG/PNG/WebP photo uploads up to 5 MB with extension and file-signature checks, served from the backend; file replacement/deletion.
- Status workflow (`open`, `claimed`, `resolved`) enforced by owner permissions.
- Explainable rule-based lost/found matching in the React app.
- **Private recovery claims:** users ask for an item handover; only the report owner sees the private note and can accept/reject; requesters can cancel. Accepting a claim marks the report `claimed`. A request is *not* proof of ownership; use campus staff for verification.
- Abuse flags and a protected administrator moderation API/UI. Only explicitly promoted accounts can see flags or hide/reinstate listings.
- Request-size limits, field validation, password brute-force throttling for login, SQLite foreign keys and transactions, non-sensitive public report data.
- Automated backend integration tests plus matching unit tests.

## Requirements

- **Node.js 22.13 or later** (includes built-in `node:sqlite`; still marked experimental in Node 22).
- npm and internet access to install the **frontend** packages the first time.

## Run everything locally (Windows / macOS / Linux)

Open this folder in VS Code, open a terminal, then run:

```bash
npm install
npm run dev:all
```

Open **http://localhost:5173**. You can register a user and create reports without configuring Firebase, an external database or any API key.

The frontend is a Vite dev server on port **5173**. The backend is on **http://localhost:3001**. Vite automatically proxies `/api` calls to the backend. Your reports, accounts, photos and claims survive restarts in `server/data/` (excluded from ZIP/Git).

If you prefer two terminals:

```bash
npm run dev:server
# In a second terminal:
npm run dev
```

Visit **http://localhost:3001/api/health** to verify the API itself. If you cannot run `npm install` because of internet access, you can still run and test the API independently:

```bash
npm run dev:server
npm run test:all
```

### Create a campus administrator

1. Register normally from the website using an intended admin email address.
2. Stop the backend, then use this command in the project folder (replace with that registered account's email):

```bash
npm run admin:grant -- admin@college.edu
```

3. Restart `npm run dev:all`, refresh/sign in, then open `/admin` for moderation. Revoke with `npm run admin:revoke -- admin@college.edu`.

No one gets administrator privileges merely by entering a certain email at registration.

## Tests

```bash
npm run test:all     # All backend + matching tests; no package installation required
npm run test:backend # Backend integration tests only
npm run test:core    # Matching logic tests only
npm run test         # Vitest tests; requires npm install
npm run build        # Frontend build; requires npm install
```

### Environment variables

- `DATABASE_PATH`: persistent SQLite file path. Default: `server/data/campusfind.sqlite`.
- `UPLOAD_DIR`: persistent upload directory. Default: `server/data/uploads`.
- `DIST_DIR`: built Vite directory. Default: `dist`.
- `CLIENT_ORIGIN`: comma-separated allowed browser origins.
- `CAMPUS_EMAIL_DOMAIN`: optional registration domain restriction.
- `FIREBASE_PROJECT_ID` or `VITE_FIREBASE_PROJECT_ID`: optional Firebase Google sign-in project.

The built-in assistant is database-backed and explicitly labelled; no external AI credentials are required. External identity providers and production SMS/email are not simulated.

## Deploy with persistent storage

`npm run build && npm start` serves the React frontend and `/api` from the **same Node.js server on port 3001**. A Dockerfile is included:

```bash
docker build -t campusfind .
docker run --rm -p 3001:3001 -v campusfind-data:/data campusfind
```

Open **http://localhost:3001** in this Docker example. Host this container on a provider supporting **persistent disk/volume** (e.g., an appropriately configured VM or container host). Configure HTTPS through the host/reverse proxy, backups, allowed campus email domains, origin restrictions, and durable persistent storage before inviting real users. Use `DATABASE_PATH=/data/campusfind.sqlite` and `UPLOAD_DIR=/data/uploads` with a mounted persistent volume.

**Important Vercel distinction:** a standard Vercel serverless deployment does **not provide a durable writable filesystem** for SQLite and uploaded photos. Do **not** deploy this exact backend to Vercel serverless expecting user data to persist. The previously created Vercel project is **not a running backend**. For Vercel hosting, migrate the server to managed Postgres and object storage, or host the backend separately on a persistent-volume service. See `docs/BACKEND.md` for details. No live production deployment is claimed by this source package.

## Project layout

```text
server/
  app.js            HTTP server and API routes, authorization, image handling
  store.js          SQLite tables/migrations and public output serializers
  validation.js     Strong server-side validation + image type verification
  index.js          Backend process entry point
  admin.js          Out-of-band admin promotion CLI
  dev.js            Run frontend + backend together
src/
  App.jsx           React routes
  context/          API cookie session authentication
  lib/data.js       Browser API client and refresh subscription
  lib/match.js      Transparent matching algorithm
  pages/            Browse, auth, reports, private claims, moderation
  components/       Reusable UI
  ...
tests/              Node integration tests and matching tests
Dockerfile          One-process full-stack Docker build
vercel.json         Legacy SPA routing, not a SQLite deployment solution
```

## Security and limitations

This is **functional coursework/demo software**, not a university-verified production system. Email domain restrictions are optional and **email ownership is not verified**. Password-reset emails, automatic school-authorized ownership verification, staff real-identity checks, push/email notifications, distributed rate limits, audit-log retention, disaster-recovery backups, and high-load performance testing have not been implemented. Use campus staff for identity and handover checks; do not submit student ID numbers, phone numbers or passwords in public item descriptions or private claim notes. Images are publicly accessible when their listing is visible. A moderator can hide flagged listings, but automated image-content moderation is not supplied.

### Original coursework

The Discovery and Agile planning documents under `docs/` explain the scope and source assignment. These must not be mistaken for completed stakeholder research. `docs/CampusFind_Agile_Portfolio.pdf` is an **earlier architectural portfolio** produced before the standalone backend and should not be used as an up-to-date deployment guide.

For endpoint-by-endpoint documentation see **`docs/BACKEND.md`**.
