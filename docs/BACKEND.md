# CampusFind Backend — implementation and API reference

## Architecture

Node 22 built-in HTTP server, `node:sqlite` with persistent WAL-mode SQLite DB, local file storage and server-enforced access control. No npm server dependencies, no Firebase credentials. One Node process can serve the Vite `dist/` directory and APIs on one origin; in development Vite proxies `/api` to Node.

- Account passwords use per-account random salts with `crypto.scryptSync`; raw passwords are never stored.
- On login/registration, a cryptographically random 256-bit session token is issued as an HttpOnly SameSite=Lax cookie. Only a SHA-256 hash of the token is stored in SQLite. Sessions expire after seven days and are revoked on logout.
- Cookie `Secure` is set for HTTPS connections (including common HTTPS reverse proxies via `X-Forwarded-Proto`). Deploy behind an HTTPS reverse proxy; avoid direct exposure of plaintext HTTP.
- CORS-style Origin checking rejects browser writes from other origins; on same-origin deployment, the page and API share a host. Authentication and write authorization are enforced on the server, not trusted from the UI.
- Report reads are public unless a moderator hides a report. Claim notes and flags are not part of public records. Only owners can modify their reports. Claim notes are visible only to report owners and requesters.
- Accepting a pending claim and rejecting competing pending claims runs as a SQLite transaction. Claims are **not staff verification**.
- Files are limited to JPG, PNG, WebP, below 5 MB, and checked against MIME magic bytes; filenames are random UUIDs. Photos on hidden listings are not publicly accessible without owner/admin rights.
- Registration may be restricted to `CAMPUS_EMAIL_DOMAIN`. Email address ownership is not verified by the app.

### Data model

`users (id, name, email, salt, password_hash, role, created_at)`

`sessions (token_hash, user_id, expires_at)`

`reports (id, owner_id, title, description, type, category, colour, location, incident_date, keywords, status, image_file, image_mime, moderation_status, created_at, updated_at)`

`claims (id, report_id, requester_id, note, status, created_at, updated_at)`

`flags (id, report_id, reporter_id, reason, status, created_at)`

SQLite uses foreign keys with cascading deletions for related claims/flags/sessions. Schema is automatically initialized and additive columns migrated on startup. No historical test accounts are shipped.

## Endpoints

All routes are relative to `/api`. Every endpoint returns JSON on success/failure except `GET /images/:filename`, which returns an image.

| Method | Route | Access | Purpose |
|---|---|---|---|
| GET | `/health` | Public | Health check |
| POST | `/auth/register` | Public | Create account `{name,email,password}` (password 8–128 chars), then set session cookie |
| POST | `/auth/login` | Public | Authenticate `{email,password}` |
| GET | `/auth/me` | Public | Return current `user` or `null` |
| POST | `/auth/logout` | Public | Revoke current token, clear cookie |
| GET | `/reports` | Public | List visible reports; query filters `q`, `type`, `category`, `status`, `page`, `limit` |
| GET | `/reports?mine=1` | User | Own reports, including hidden reports |
| GET | `/reports/:id` | Public | Read visible listing; hidden listing accessible to owner/admin |
| POST | `/reports` | User | Create validated report with optional `imageData` data URL |
| PATCH | `/reports/:id` | Owner | Update report fields and optionally upload replacement image |
| DELETE | `/reports/:id` | Owner | Delete report, claims, flags and image |
| PATCH | `/reports/:id/status` | Owner | Set `open`, `claimed`, or `resolved` |
| GET | `/images/:file` | Public* | Fetch image (hidden photos visible only to owner/admin) |
| POST | `/reports/:id/claims` | Other user | Private claim `{note}`, 10–500 chars, one claim per user per report |
| GET | `/claims?scope=incoming` | User | Claims against user's own reports |
| GET | `/claims?scope=outgoing` | User | Claims submitted by current user |
| PATCH | `/claims/:id` | Owner/requester | Owner `accepted`/`rejected`; requester `cancelled` |
| POST | `/reports/:id/flag` | User | Report a listing for moderation `{reason}` 10–500 chars |
| GET | `/admin/flags` | Admin | View flags and their status |
| PATCH | `/admin/flags/:id` | Admin | Mark flag `reviewed` or `dismissed` |
| PATCH | `/admin/reports/:id/moderation` | Admin | Hide or restore listing `{status:'hidden'|'visible'}` |

The frontend uses same-origin session cookies, automatically refreshed report listing snapshots, and a client-side matching algorithm (`src/lib/match.js`). The API is the authority for every mutation.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Node server listener |
| `DATABASE_PATH` | `server/data/campusfind.sqlite` | Persistent DB path |
| `UPLOAD_DIR` | `server/data/uploads` | Persistent photo directory |
| `DIST_DIR` | `dist` | Vite build served in production |
| `CLIENT_ORIGIN` | localhost:5173, localhost:4173, localhost:3001 | Comma-separated permitted origins beyond same-host |
| `CAMPUS_EMAIL_DOMAIN` | unset | Optional required email domain for signup |
| `NODE_ENV` | unset | Use `production` in the deployed container |

Environment variables must be supplied by the host. Node does not automatically load `.env` files in this implementation; `.env.example` is a reference template. You may use `node --env-file=.env server/index.js` or set variables in the host. Avoid committing `.env` files.

## Deployment and operations

For a one-process local simulation, run `npm install && npm run build && npm start`, then visit `http://localhost:3001`. In production use Docker or Node on a persistent disk with HTTPS via reverse proxy; mount both SQLite database **and** uploads. Back up all three SQLite WAL files consistently (or use the SQLite backup API) plus image files. Apply an off-machine backup policy, set restrictive filesystem permissions, and review user registration before rollout.

Vercel functions have ephemeral local filesystems: do not deploy with `DATABASE_PATH` pointing inside a function instance. To deploy this architecture on Vercel, first replace SQLite with a managed DB (PostgreSQL) and move uploaded images to durable object storage (e.g., S3/Vercel Blob), then retest the entire authorization and file lifecycle.

## Tests and known gaps

`npm run test:all` executes 17 Node built-in tests for health, signup/login/logout, report CRUD/owner validation, private claims, image format checking, flags, and admin authorization, plus score matching tests. This verifies a local backend with isolated temporary SQLite files, not a production deployment.

Further hardening required before a real university rollout: email confirmation, password reset, global/distributed rate limiting, CAPTCHA/anti-abuse, content moderation, protected audit trail, backup/restore drills, production monitoring, formal ownership-verification protocol, retention/deletion policy, and load testing. No admin user is seeded automatically; promotion requires host-level CLI access.
