# Karina-MD Platform v2.0

A full-stack WhatsApp bot script platform built on **Express + MongoDB + Vercel**. Browse, upload, and download WhatsApp bot scripts; share reusable JavaScript code snippets; publish platform update logs; and run a complete support ticket system — all from one cohesive admin-managed dashboard.

## Features

### Public pages
- **Home** (`/`) — Hero banner, live platform stats, featured scripts, latest updates, featured snippets, support CTA.
- **Scripts** (`/scripts`) — Browse, search, filter by category, sort by newest/popular/downloads/featured. Paginated.
- **Script detail** (`/scripts/:slug`) — Full description, long description, changelog, file info sidebar, download button (real file download via API).
- **Snippets** (`/snippets`) — Browse reusable code snippets. Inline copy button on each card.
- **Snippet detail** (`/snippets/:slug`) — Full code view with copy button, view & copy counts.
- **Downloads** (`/downloads`) — All scripts in a compact list view, sorted by download count, one-click direct download.
- **Updates** (`/updates`) — Paginated changelog of all platform updates, filterable by category.
- **Support** (`/support`) — Open a new support ticket, or look up all tickets you've submitted by email.
- **Ticket detail** (`/support/ticket/:ticketNumber`) — View ticket thread, reply, see status badges. Secured with an access token (or admin login).

### Admin panel (`/admin`)
Separate admin page (no longer on home). Requires JWT auth.
- **Dashboard stats** — Aggregate counts of updates, scripts, snippets, tickets, downloads, views.
- **Updates tab** — Create new update (title, version, description, category, tags, pin, publish toggle). Live table of all updates with delete.
- **Scripts tab** — Upload new script with file picker (auto-loads file content into textarea) or paste manually. Set category, tags, thumbnail, changelog, external URL, featured, published, binary flags. Live table of all scripts with view/download/delete actions.
- **Snippets tab** — Add new snippet with title, language, description, tags, code, featured, published. Live table with view/delete.
- **Tickets tab** — Search/filter tickets by status, priority, free text. Click "Open" to view ticket thread and reply as admin.

### Backend API (`/api/*`)
- **Auth**: `POST /auth/login`, `GET /auth/check` (JWT Bearer)
- **Updates**: `GET /updates/latest`, `GET /updates/all`, `GET /updates/:id`, `POST /updates/upload`, `PUT /updates/:id`, `DELETE /updates/:id`
- **Scripts**: `GET /scripts/list`, `GET /scripts/featured`, `GET /scripts/categories/counts`, `GET /scripts/:idOrSlug`, `GET /scripts/:idOrSlug/download`, `POST /scripts/create`, `PUT /scripts/:id`, `DELETE /scripts/:id`
- **Snippets**: `GET /snippets/list`, `GET /snippets/featured`, `GET /snippets/:idOrSlug`, `POST /snippets/:idOrSlug/copy`, `POST /snippets/create`, `PUT /snippets/:id`, `DELETE /snippets/:id`
- **Tickets**: `POST /tickets/create`, `GET /tickets/mine`, `GET /tickets/:ticketNumber`, `POST /tickets/:ticketNumber/reply`, `GET /tickets/admin/list`, `PUT /tickets/:ticketNumber/status`, `DELETE /tickets/:ticketNumber`
- **Admin**: `GET /admin/stats`, `GET /admin/all-scripts`, `GET /admin/all-snippets`, `GET /admin/all-updates`

### Models (MongoDB)
- `User` — admin credentials (bcrypt hashed)
- `UpdateFile` — platform updates/changelogs
- `Script` — downloadable script with embedded file content (up to 5 MB)
- `Snippet` — code snippet with language, tags, view/copy counts
- `Ticket` — support ticket with embedded `messages[]` thread, status workflow, access token

### Security
- JWT auth for all admin routes
- bcrypt password hashing
- Rate limiting on auth (15 req/15min), ticket creation (5/hour), ticket reply (30/hour), general API (200/10min)
- HTML escape on all user-provided content rendered in the DOM
- Ticket access token required for non-admin ticket viewing/replying
- File size limit (5 MB) and JSON body limit (6 MB) enforced

## Setup

### Prerequisites
- Node.js 18+
- MongoDB Atlas account (free tier works)
- Vercel account (for deployment)

### Local development
```bash
# 1. Install dependencies
npm install

# 2. Create .env from template
cp .env.example .env
# Edit .env with your MongoDB Atlas URI and a strong JWT secret

# 3. Seed an admin user (creates or updates)
npm run seed
# Or with custom credentials:
ADMIN_USERNAME=myadmin ADMIN_PASSWORD=Str0ngP@ss npm run seed

# 4. Run dev server (uses Vercel dev)
npm run dev
# Visit http://localhost:3000
```

### Deploy to Vercel
1. Push this project to a GitHub/GitLab/Bitbucket repository.
2. In Vercel dashboard: **Add New Project** → import the repo.
3. In **Project Settings → Environment Variables**, add:
   - `MONGODB_URI` — your MongoDB Atlas connection string
   - `JWT_SECRET` — a strong random string (e.g. from `openssl rand -hex 48`)
   - `JWT_EXPIRES_IN` (optional, defaults to `7d`)
4. **Deploy**. Vercel will detect the `api/index.js` serverless function and serve `public/` as static assets automatically via `vercel.json`.
5. After first deploy, run the seed script locally with the production `MONGODB_URI` to create the admin user:
   ```bash
   MONGODB_URI=your-production-uri ADMIN_USERNAME=admin ADMIN_PASSWORD=yourpass npm run seed
   ```
6. Visit `https://your-project.vercel.app/admin` and log in.

## Tech stack
- **Backend**: Express 4, Mongoose 8, JSON Web Tokens, bcryptjs, express-rate-limit
- **Frontend**: Vanilla HTML/CSS/JS, GSAP 3 for animations, no build step required
- **Database**: MongoDB Atlas
- **Hosting**: Vercel (serverless functions + static assets)

## Project structure
```
karina-md/
├── api/
│   ├── config/db.js              # MongoDB connection (cached for serverless)
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── updateController.js
│   │   ├── scriptController.js
│   │   ├── snippetController.js
│   │   ├── ticketController.js
│   │   └── adminController.js
│   ├── middleware/
│   │   ├── auth.js               # JWT middleware + optional auth
│   │   └── rateLimiter.js        # Rate limiters for different endpoints
│   ├── models/
│   │   ├── User.js
│   │   ├── UpdateFile.js
│   │   ├── Script.js
│   │   ├── Snippet.js
│   │   └── Ticket.js
│   ├── utils/helpers.js          # Slug, token, validation helpers
│   └── index.js                  # Express app entry
├── public/
│   ├── css/
│   │   ├── style.css             # Original home page styling (extended)
│   │   └── shared.css            # Cross-page shared components
│   ├── js/
│   │   ├── shared.js             # API client, navbar/footer injection, toasts
│   │   ├── main.js               # Home page logic
│   │   └── admin.js              # Admin panel logic
│   ├── index.html                # Home page
│   ├── scripts.html              # Scripts listing
│   ├── script-detail.html        # Script detail + download
│   ├── snippets.html             # Snippets listing
│   ├── snippet-detail.html       # Snippet detail + copy
│   ├── downloads.html            # Downloads center
│   ├── updates.html              # Platform updates listing
│   ├── support.html              # Open ticket + my tickets
│   ├── ticket-detail.html        # View ticket thread
│   └── admin.html                # Admin dashboard (separate page)
├── scripts/
│   └── seedAdmin.js              # Admin user seeder
├── .env.example
├── package.json
├── vercel.json                   # Routing config for Vercel
└── README.md
```

## How the support ticket system works
1. User visits `/support`, fills the "New Ticket" form with their name, email, subject, description, category, and priority.
2. Server creates a `Ticket` document with a unique `ticketNumber` (e.g. `TKN-2026-AB12CD`) and a random 40-char `accessToken`.
3. Both are displayed in a success modal — the user must save them.
4. The user can later view their ticket via the URL `/support/ticket/TKN-2026-AB12CD?token=...`.
5. They can also list all their tickets by email on the "My Tickets" tab — but to actually open one, they must enter the access token (this prevents email-only enumeration).
6. Admins log in via `/admin`, see all tickets in the Tickets tab, and can open any ticket without a token to reply or change status.

## License
Private project. © Karina-MD. Developed by kyyinfinite.
