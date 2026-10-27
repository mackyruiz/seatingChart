# Seating Chart App

A data-driven office seating chart: desks are database records rendered on a canvas over an
uploaded floor plan image, not hand-drawn shapes. Built from `seating-chart-app-spec.md` —
see that file for the full requirements this implements.

## Architecture

```
server/   Node/Express REST API + SQLite database + uploaded floor plan images
client/   React + react-konva single-page app (the floor plan editor/viewer)
```

- **App code** (`server/src`, `client/src`), **floor plan images** (`server/uploads`), and
  **data** (`server/data/seating.db`) are kept separate on purpose (spec §9) so each can be
  backed up/managed independently.
- **Desks are data**, not drawings: `{ id, floorId, x, y, width, height, rotation, label,
  department, deskType, assignedPersonId, status }`, rendered from JSON onto an SVG/canvas
  layer (react-konva) over a non-interactive background image.
- **Sites and floors are database records**, editable from the Admin page — adding one shows
  up in every picker immediately, with no code change or redeploy.

## Requirements

- Node.js 22.5 or newer (uses the built-in `node:sqlite` module — no native database driver
  to compile, no separate database server to install/run).

## First-time setup

```bash
# 1. Backend
cd server
npm install
cp .env.example .env
# Edit .env: set a real JWT_SECRET, and either set SEED_OWNER_PASSWORD or let the seed
# script generate one for you (it prints it once).
npm run seed      # creates the owner account + (if the DB is empty) demo sites/floors/desks
npm run dev        # http://localhost:4000

# 2. Frontend (separate terminal)
cd client
npm install
npm run dev        # http://localhost:5173 (proxies /api to the backend above)
```

Open http://localhost:5173, sign in with the owner email/password printed by `npm run seed`.

### Resetting a password

There's no self-service "forgot password" flow in v1 (see auth notes below). If someone is
locked out — including the owner account itself — reset their password directly from the
server:

```bash
cd server
npm run reset-password -- someone@example.com          # generates and prints a new password
npm run reset-password -- someone@example.com NewPass1!  # or set one explicitly (8+ chars)
```

This requires access to the server/database, which is the point — it's an IT/admin operation,
not something exposed over the API. It's recorded in the audit log as `password_reset_cli`.

## Roles

| Role | View & search | Edit desks | Assign people | Manage sites/floors | Manage users |
|---|---|---|---|---|---|
| `employee` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `manager` | ✅ | ❌ (can send a change request) | ❌ | ❌ | ❌ |
| `admin` (Facilities) | ✅ | ✅ | ✅ | ✅ | ❌ |
| `owner` (IT) | ✅ | ✅ | ✅ | ✅ | ✅ |

Every role check is re-enforced server-side in `server/src/middleware/roles.js` and applied
per-route — the frontend hiding a button is a convenience, not the security boundary.

## Using the app

- **Everyone**: pick a site/floor, pan (drag) and zoom (scroll) the floor plan, search by
  desk label or occupant name (centers + highlights the match), filter/dim by department,
  click a desk for details, export the current view as CSV/JSON.
- **Facilities/Admin**: click "Edit floor" to enter edit mode — drag desks to move them, use
  the corner handles to resize/rotate, "+ Add desk" then click the plan to place one, open a
  desk to relabel/reassign/delete it. "History / undo" shows the last 10 auto-saved snapshots
  per floor with one-click revert.
- **Admin page** (`/admin`, admin+): create/rename/archive sites and floors, upload a floor
  plan background (PNG/JPG; for a PDF, convert its first page to an image before uploading —
  see note below), manage the people directory, view the audit log. Owner-only: manage user
  accounts and roles.

## Security notes (spec §8)

- **Auth**: email/password behind a single provider abstraction
  (`server/src/auth/provider.js`) so SAML SSO with JIT provisioning can be added later without
  touching routes or the frontend — see the comment at the top of that file for the exact
  seam. Sessions are a signed, httpOnly, `SameSite` cookie; no endpoint (including read-only
  ones) is reachable unauthenticated.
- **Authorization**: role checks happen in Express middleware on every mutating/admin route,
  independent of the UI.
- **Input validation**: every request body is parsed through a `zod` schema
  (`server/src/utils/validation.js`) that also strips control characters from free text.
  All SQL is parameterized — no string-built queries.
- **File uploads**: images are decoded and re-encoded with `sharp` before being written to
  disk under a generated filename (never the client-supplied name), rejecting anything that
  isn't a real raster image. `server/uploads` is a plain static directory, not on any
  executable path.
- **Transport**: run behind HTTPS in any real deployment; set `COOKIE_SECURE=true` once you
  do, so session cookies get `Secure`.
- **Rate limiting**: `/api/auth/login` has a strict limiter; all of `/api` has a looser
  backstop limiter against scripted mass-edits/scraping.
- **Audit log**: every create/update/delete/login/export is recorded with who/what/when
  (Admin page → Audit log).
- **Data minimization**: the people directory stores name/department/email/Slack only.

### Known limitation: PDF backgrounds

Uploading a PDF works only if the server's `sharp`/libvips build includes PDF support, which
varies by platform. If an upload is rejected, convert the PDF's first page to PNG/JPG (e.g.
`pdftoppm -png -r 150 plan.pdf plan`) and upload that instead — this is the "PDF converted to
image on upload" path the spec allows for.

## Production build

```bash
cd client && npm run build   # outputs client/dist — serve as static files behind your reverse proxy
cd server && npm start        # set NODE_ENV=production, a real JWT_SECRET, COOKIE_SECURE=true
```

Point your reverse proxy / static host at `client/dist`, and route `/api/*` to the Node
server. Back up `server/data/seating.db` and `server/uploads/` on a schedule — those two
directories are the entire state of the app.
