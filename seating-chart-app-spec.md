# Seating Chart App — Build Instructions

## 1. Problem Statement
We currently maintain our office seating chart as a static PDF originally created in Adobe Illustrator. Updating it requires Illustrator specifically, and every desk is a hand-drawn, non-uniform box with no underlying data. Moving, adding, or removing a desk means manually redrawing shapes, which is slow and error-prone. We want a lightweight, web-based app that anyone with the right permissions can use to view, update, and save the floor plan — no design software required.

## 2. Scope & Scale
- Launching with 2 buildings, 1 floor each, but **sites must be dynamic, not hardcoded** — Admins should be able to add, rename, or archive a building/site from within the app itself (no code change or redeploy needed) as the company grows.
- Data model should support multiple floors per building even though each current site only needs one floor — a "site" contains one or more "floors," each floor has its own background image and desk set.
- ~100–200 desks total across the current 2 sites; design for this to grow as sites are added.
- Admin must be able to **upload a floor plan image per floor per site** (PNG/JPG, or a PDF converted to image on upload) to use as the background layer described in Section 3.
- The app's building/site/floor picker (tabs or dropdown) should populate from the database, not a fixed list — adding a new site in the admin UI should make it immediately selectable everywhere in the app.

## 3. Core Design Principle (read this before building anything)
**Desks must be data objects, not drawings.** The #1 root cause of the current pain is that a "desk" is just an arbitrary shape on an image. Instead:
- Each desk is a record: `{ id, floorId, x, y, width, height, rotation, label, department, deskType, assignedPersonId, status }`. A floor belongs to a site; sites and floors are themselves records an Admin can create, not fixed values in code.
- The floor plan renders desks *from this data* onto a canvas/SVG layer, optionally overlaid on a background image (the existing floor plan PDF/image, converted to PNG, used purely as a non-interactive backdrop for walls/doors/furniture context).
- Adding a desk = add a record. Deleting a desk = remove a record (with confirmation, and it should never corrupt neighboring desks). Moving a desk = drag it; only x/y changes.
- This guarantees uniformity automatically, since desks are rendered from a small set of consistent shape templates, not redrawn freehand each time.

## 4. Personas & User Stories

### Facilities / Admin (primary maintainer)
- Can upload/replace the background floor plan image.
- Can add, move, resize, relabel, and delete desks.
- Can assign or unassign an employee to a desk.
- Can add, rename, or archive a site/building and its floors as the company's footprint changes, without needing IT or a code change.
- Wants a fast, uncluttered editing experience — no design tool required.

### Hiring Manager / Team Lead
- Wants to see where their team currently sits, at a glance.
- Wants to filter/highlight by team or department.
- May request a desk or block of desks for a new hire (request/comment, not necessarily direct edit rights).
- Does not need full edit access — read access plus lightweight "request a change" capability.

### Employee
- Wants to search for a colleague by name and see where they sit.
- Wants to view their own desk location.
- Read-only access only.

### IT / Security Owner
- Needs to maintain the app long-term with minimal specialized tooling (i.e., not dependent on Illustrator or any one person's local setup).
- Needs role-based access control, audit logging, and assurance the app has no obvious vulnerabilities (especially since it may contain employee names and org data).
- Wants straightforward hosting, backup, and update process.

## 5. Functional Requirements

### Viewing
- Web page, responsive (works on desktop and tablet at minimum).
- Pan/zoom on the floor plan.
- Search bar: type a name, the matching desk highlights/centers on screen.
- Filter/highlight by department or team (color-coding).
- Click a desk to see occupant details (name, team, maybe contact/Slack link).

### Editing (Facilities/Admin role only)
- Drag-and-drop to move a desk.
- Click "add desk" to place a new uniform desk shape; click to delete (with confirm).
- Resize/rotate desk shape via handles (optional but nice-to-have).
- Assign a desk to a person via search/dropdown of employees (or free-text if no employee directory integration).
- **Add/rename/archive a site (building) or floor** directly in the app — this creates a new entry in the site/floor list and makes it immediately available in the picker; no developer involvement required.
- Upload/replace background floor plan image per floor (PNG/JPG/PDF-converted).
- Save persists changes; changes should not require redeploying the app.

### Change tracking
- Every save records who changed what and when (audit log).
- Ability to view recent change history and revert if something breaks (even a simple "last 10 versions" undo is enough — doesn't need to be git-level).

### Data export
- Ability to export current seating data as CSV/JSON (for reporting, headcount, etc.) — this is something the old PDF-only approach couldn't do.

## 6. Roles & Permissions
| Role | View | Search | Edit desks | Assign people | Manage floors/upload background | Manage users/roles |
|---|---|---|---|---|---|---|
| Employee | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Hiring Manager | ✅ | ✅ | ❌ (comment/request only) | ❌ | ❌ | ❌ |
| Facilities/Admin | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| IT/Owner | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

## 7. Non-Functional Requirements
- **Lightweight**: no requirement for specialized design software to maintain it going forward.
- **Fast**: floor plan with a few hundred desks should load and pan smoothly.
- **Simple UI**: an admin with no design background should be able to add/move/delete a desk in a few clicks.
- **Uniform desks by construction** — see Section 3. Don't allow free-hand shape drawing for desks; use templates.
- Works in modern browsers without plugins.

## 8. Security Requirements (for IT sign-off)
- **Authentication (v1)**: simple email/password login (or magic-link) is acceptable for launch. No anonymous access — every view, including read-only, requires a logged-in account.
- **Authentication (future)**: design the auth layer so it can be swapped for **SAML-based SSO with Just-In-Time (JIT) provisioning** without a rework — i.e., keep authentication behind a single abstraction (e.g., a standard auth library/middleware) rather than hardcoding password logic throughout the app. When SAML/JIT is added, a new employee logging in via SSO for the first time should be auto-provisioned an account with a default role (e.g., "Employee") based on their SAML assertion, with no manual account creation needed. Favor libraries/frameworks with built-in or well-supported SAML providers (e.g., `passport-saml`, `python3-saml`, or a hosted auth provider like Auth0/Okta that supports both password and SAML) so this upgrade path is low-effort.
- **Authorization**: enforce the role table above on the backend, not just hidden UI buttons — every edit/admin API call must re-check the user's role server-side.
- **Input validation**: sanitize all inputs (desk labels, names, uploaded files) to prevent injection (SQL injection, XSS via desk labels rendered on screen).
- **File upload safety**: validate file type/size for background image uploads; store outside of any executable path; scan or restrict to image formats only.
- **Transport security**: HTTPS only.
- **Least sensitive data**: avoid storing anything beyond name/team/desk — no need for personal data like home address, phone number, etc.
- **Audit logging**: log who changed what, when (see Section 5).
- **Rate limiting / abuse protection**: prevent scripted mass-edits or scraping of the employee directory.
- **Dependency hygiene**: use well-maintained libraries; avoid embedding secrets/API keys in frontend code.
- **Backups**: regular automated backup of the desk/floor data (this is now a database, not a static file — it needs a backup plan IT doesn't currently have for the PDF).

## 9. IT / Maintenance Requirements
- Should be dependent on **no special software** (i.e., not Illustrator) to update — only the web app itself.
- Clear separation of: (a) app code, (b) floor plan background images, (c) desk/employee/site data (database) — so IT can back up/manage each independently.
- Simple deployment story (e.g., a single web app + database that can be hosted internally or on a low-cost cloud host) — avoid unnecessary infrastructure complexity given this is an internal tool.
- Should support adding/removing admin users without a code change.
- Should support adding/removing entire sites (buildings/floors) without a code change or redeploy — this is a data operation performed by an Admin, not an engineering task.

## 10. Suggested Technical Approach (adjust to your team's stack preferences)
- **Frontend**: a canvas/SVG-based editor (e.g., React + `react-konva`, Fabric.js, or plain SVG with drag handlers) rendering desks from JSON data over a background image.
- **Backend**: simple REST API (Node/Express, Python/FastAPI, etc.) with a small relational database (Postgres/SQLite) storing floors, desks, and assignments.
- **Auth**: v1 uses basic email/password or magic-link login with roles stored in the DB, built behind an auth abstraction/middleware so SAML SSO with JIT provisioning can be added later without restructuring the app.
- **Hosting**: any low-cost web host (internal server, or a small cloud instance) — avoid overengineering since this is a single-team internal tool.

## 11. Out of Scope (for v1)
- Desk booking/reservation system (hot-desking) — this is a fixed seating chart, not a scheduling tool like Skedda/Maptician.
- Mobile native app.
- Integration with HR systems (can be a v2 nice-to-have to auto-populate employee names).

## 12. Success Criteria
- Facilities can move/add/delete a desk in under 1 minute without opening any design software.
- An employee can find a colleague's desk via search in under 10 seconds.
- A hiring manager can view their team's seating layout without needing edit access.
- IT can confirm role-based access control is enforced server-side and no unauthenticated user can view or edit internal seating data.
