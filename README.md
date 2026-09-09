# SplitMate

## What the App Does

SplitMate is a full-stack shared-expense management app modelled after Splitwise. Users create groups, add shared expenses, split costs equally or with custom amounts, track who owes whom, and record settlements to clear debts. All balances update in real time via WebSockets — when someone adds an expense, every other member viewing that group sees the updated balances and activity feed immediately without refreshing.

---

## How to Run It (clean-clone tested)

### Prerequisites

- Node.js v18 or above
- A MongoDB Atlas cluster (free tier works)

### 1. Clone and install

```bash
git clone <your-repo-url>
cd SplitMate

# Backend
cd apps/api
npm install

# Frontend (separate terminal)
cd apps/client
npm install
```

### 2. Configure the backend

Open `apps/api/.env` and set:

```
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/splitmate?retryWrites=true&w=majority
JWT_SECRET=<any-long-random-string>
REFRESH_TOKEN_EXPIRES_DAYS=7
BCRYPT_ROUNDS=11
PORT=3000
CLIENT_ORIGIN=http://localhost:5173
```

In Atlas:
- Database Access → your user has read/write on `splitmate`
- Network Access → whitelist your IP (or `0.0.0.0/0` for dev)

### 3. Seed test users (optional)

```bash
cd apps/api
node scripts/seed-users.mjs
```

| Name | Email | Password |
|------|-------|----------|
| Alice Sharma | `alice@example.com` | `Alice123` |
| Bob Mehta | `bob@example.com` | `Bobby456` |
| Carol Singh | `carol@example.com` | `Carol789` |
| David Rao | `david@example.com` | `David999` |
| Eve Kapoor | `eve@example.com` | `Evelyn11` |

### 4. Start the project

**Terminal 1 — Backend:**
```bash
cd apps/api
npm run start:dev
```
Wait for: `[NestApplication] Nest application successfully started`

**Terminal 2 — Frontend:**
```bash
cd apps/client
npm run dev
```

Open `http://localhost:5173`

---

## Data Model

All data lives in MongoDB Atlas. Six collections, related as follows:

```
users
  _id, name, email, passwordHash

refresh_tokens
  _id, userId → users._id, tokenHash, expiresAt, revokedAt

groups
  _id, name, ownerId → users._id, deletedAt

memberships                          ← many-to-many join: users ↔ groups
  _id, userId → users._id, groupId → groups._id

expenses
  _id, groupId → groups._id
  description, amountInPaisa, paidByUserId → users._id
  date, splitType (EQUAL | EXACT)
  splits: [{ userId → users._id, shareInPaisa }]   ← embedded array
  createdByUserId → users._id, deletedAt

settlements
  _id, groupId → groups._id
  fromUserId → users._id   ← the person who paid
  toUserId   → users._id   ← the person who received
  amountInPaisa, createdAt

activity_logs
  _id, groupId → groups._id
  actorUserId → users._id, type, entityId, metadata, createdAt
```

### Key relationships

- A **user** belongs to many **groups** through **memberships** (true many-to-many).
- An **expense** belongs to one group, has one payer, and has embedded **splits** — one entry per participant with their exact share in paisa.
- A **settlement** records a single payment from one member to another within a group.
- Balances are not stored — they are computed on every request from expenses and settlements (see Balance Calculation below).

---

## Money Storage and Rounding

### Storage format

Every monetary value in the database, API, and business logic is an **integer representing paisa** (the smallest Indian currency unit, 1/100th of a rupee). There are no floats anywhere in the data layer.

- ₹7,800 is stored as `780000`
- ₹1,560 is stored as `156000`

The frontend converts paisa to rupees only for display (`paisa / 100` formatted via `Intl.NumberFormat`), and multiplies back to paisa (`Math.round(rupees * 100)`) before sending to the API.

The API rejects any monetary field that is not a non-negative integer with HTTP 422.

### Rounding rule for equal splits

`splitEqually(amountInPaisa, memberIds)` in `apps/api/src/expenses/split-calculator.ts`:

1. Sort member IDs ascending (lexicographic) — this makes the result deterministic regardless of insertion order.
2. Base share = `Math.floor(amountInPaisa / n)`
3. Remainder = `amountInPaisa % n`
4. The first `remainder` members (in sorted order) each get `base + 1` paisa. The rest get `base`.

**Example:** ₹100 split 3 ways = 10000 paisa ÷ 3 = base 3333, remainder 1. Result: member[0] gets 3334 paisa, member[1] and member[2] get 3333 each. Total: 3334 + 3333 + 3333 = 10000. No paisa is ever lost or invented.

### Balance calculation

Balances are derived, not stored:

```
balance = paidCredit - owedDebit + settledPaid - settledReceived

where:
  paidCredit      = sum of amountInPaisa for expenses where user is paidByUserId
  owedDebit       = sum of shareInPaisa for splits where split.userId = user
  settledPaid     = sum of amountInPaisa for settlements where fromUserId = user
  settledReceived = sum of amountInPaisa for settlements where toUserId = user
```

Positive balance = others owe this user. Negative balance = this user owes others.

---

## Stack Choice and Why

| Layer | Choice | Reason |
|---|---|---|
| Backend | **NestJS** (plain JavaScript) | Structured module system, built-in DI, native Socket.io support via `@WebSocketGateway`, class-validator for request validation |
| Database | **MongoDB Atlas + Mongoose** | Flexible schema for embedded splits array; Atlas replica set required for multi-document transactions |
| Auth | **JWT + httpOnly cookies** | Access token in memory (XSS-safe), refresh token in httpOnly cookie (CSRF-mitigated with SameSite) |
| Real-time | **Socket.io** | Room-based broadcasting, auto-reconnect, fallback to polling, works with NestJS gateway |
| Frontend | **React 19 + Vite** | Fast HMR, small bundle, modern React patterns |
| Styling | **Tailwind CSS** | Utility-first, no runtime cost |
| Forms | **React Hook Form + Zod** | Schema-driven validation, inline field errors, no re-renders on every keystroke |

---

## Refresh-Token Flow

### What is stored where

| Token | Stored | Why |
|---|---|---|
| Access token | JavaScript module-level variable in `AuthContext` | Never written to localStorage or sessionStorage — disappears on tab close, invisible to XSS |
| Refresh token | `httpOnly` cookie (`refresh_token`) | Not readable by JS; `Secure` + `SameSite=Strict` (dev) / `SameSite=None` (production cross-domain) |
| Refresh token hash | `refresh_tokens` MongoDB collection | Only the SHA-256 hash is stored — the plaintext never persists server-side |

### Flow on login

1. Server issues a signed JWT (15-minute expiry) in the response body.
2. Server generates a random 32-byte refresh token, SHA-256 hashes it, stores the hash with `expiresAt`, and sets the plaintext as an httpOnly cookie.
3. Client stores the JWT in memory.

### Flow on expiry

1. Any API request returns 401.
2. The Axios interceptor catches it, queues concurrent 401s, calls `POST /auth/refresh` once.
3. Server reads the cookie, finds the hash, validates expiry and revocation, issues a new access token and a new refresh token (rotation — old one is revoked).
4. Interceptor updates the in-memory token, dispatches `auth:token-refreshed` event (socket reconnects with new token), retries all queued requests.
5. If `/auth/refresh` also returns 401, the user is logged out and redirected to `/login`.

### Reuse detection

If a refresh token that has already been revoked is presented, the server invalidates all refresh tokens for that user and returns 401 — this detects stolen token reuse.

---

## WebSocket Setup

### Technology choice

**Socket.io** via `@nestjs/platform-socket.io`. Chosen for built-in room support, automatic reconnection, and NestJS integration.

### How the socket is authenticated

The client sends the JWT access token in the Socket.io handshake `auth` payload:

```js
io(SOCKET_URL, { auth: { token: accessToken } })
```

On the server, `handleConnection()` in `SocketGateway` verifies the token using the same `JWT_SECRET` as the REST API. If the token is missing, expired, or invalid, the socket is immediately disconnected. No unauthenticated socket can join any room.

When the access token silently refreshes (token rotation), the client reconnects the socket with the new token — this prevents the socket from becoming permanently stale after a token rotation.

### How events are scoped to the right members

Events are never emitted to the global namespace. Two room types are used:

**`group:{groupId}`**
The client emits `join:group` when navigating to a group page. Before joining, the server performs a database membership check (`Membership.exists({ userId, groupId })`). Only confirmed members can join the room. The client emits `leave:group` on navigation away.

**`user:{userId}`**
Every authenticated socket automatically joins this personal room on connect. It receives `activity:new` events from all the user's groups — used to keep the dashboard net balance current without the user needing to be on a specific group page.

### What gets emitted and when

After every expense or settlement mutation (inside the service, after the transaction commits):
- `balances:updated` → `group:{groupId}` room — triggers balance and expense tab refetch
- `activity:new` → `group:{groupId}` room + each member's `user:{uid}` room — triggers activity feed update and dashboard refresh

### Disconnect and reconnect handling

Socket.io reconnects automatically with exponential backoff. The app is fully functional without the socket — all data is fetched via REST on mount. On reconnect (`socket.on('connect', handler)`), each active tab (`BalancesTab`, `ActivityTab`, `ExpensesTab`) and `DashboardPage` refetch their data from the API, recovering any events missed during the disconnection.

---

## What Was Hard

**Monetary integrity across form → API → database**

The form field accepts rupees (decimal input like `2500.00`), Zod coerces it to a number, and the submit handler multiplies by 100 and rounds. Getting this right without any floating-point error at the boundary required being explicit at every conversion point. Early versions had `amountInPaisa` excluded from the Zod resolver, which caused `rupeesToPaisa(undefined)` → `NaN` → `0` → a false "Amount must be at least ₹0.01" error on submit. This bug appeared in three separate modal components (`AddExpenseModal`, `EditExpenseModal`, and the onboarding `StepExpense` in `GroupsPage`) and each had to be fixed the same way.

**Settlement authorization**

The original settlement form had a free "Who paid" dropdown, meaning any logged-in user could settle on behalf of any other member. The fix required three layers: backend enforcement (`dto.payerId !== req.user.id` → 422), frontend locking (payer field is read-only, hardcoded to the current user), and UX redesign (Settle button only appears on the logged-in user's own debt row).

**MongoDB transaction requirements**

Atlas requires a replica set for multi-document transactions. The local dev MongoDB standalone does not support them. This forced all development to use Atlas from day one, which added complexity to the setup but was the right call — all group deletions, expense creates/updates, and settlements are atomic.

**Real-time balance display bug**

The `BalancesTab` socket handler originally tried to use the `balances:updated` socket payload directly as the balance map. But the server sends `{ groupId }` as the payload, not actual balance data. So `setBalances({ groupId: '...' })` was called on every live update, corrupting the display. Fixed by always calling `fetchBalances()` and ignoring the payload content.

---

## Known Issues / What is Incomplete

- **No email verification** — signup does not verify email ownership. A fake email can be used.
- **No password reset** — there is no forgot-password flow.
- **No push notifications** — mobile users not actively viewing the app do not receive notifications.
- **Partial settlement validation** — you can record a settlement for any amount up to the full debt, but there is no explicit "partial settlement" concept. Multiple settlements are additive and the balance reflects all of them correctly.
- **Group name editing** — `PATCH /groups/:id` exists on the backend but there is no UI for renaming a group.
- **No pagination on activity feed** — the activity tab does paginate but there is no infinite scroll; older entries require manual page navigation.

---

## What I Would Improve With More Time

- **Push notifications** — notify members via FCM/APNs when they are added to a group or an expense includes them.
- **Expense categories and charts** — tag expenses (Food, Transport, etc.) and show a spending breakdown chart on the dashboard.
- **Email verification and password reset** — proper account security flows.
- **Offline support (PWA)** — cache the last known state with a service worker so the app is usable on slow connections.
- **Bulk settle** — a "Settle all my debts" button that records multiple settlements in one action.
- **Mobile-native feel** — the UI is responsive but not optimized for touch; swipe gestures and bottom sheets would improve mobile UX.
- **Code splitting** — the frontend bundles to a single 518 kB JS file. Splitting by route would cut initial load time significantly.
- **Test coverage** — unit tests for `splitEqually` and `simplifyDebts` exist in structure but are not fully written out. Integration tests for the settlement flow would prevent regressions.

---

## Where I Used AI and What I Learned

I used **Kiro (AI-powered IDE)** throughout this project as a development partner.

**What I used it for:**
- Generating the initial NestJS module structure (controllers, services, DTOs, schemas)
- Writing the Mongoose aggregation pipelines for balance calculation and dashboard stats
- Debugging the `rupeesToPaisa` / Zod coercion bug that appeared in three separate form components — the AI traced the exact execution path from `useWatch` through Zod's `.omit()` to the undefined value
- Writing the debt simplification algorithm and verifying its correctness against edge cases
- Setting up the Socket.io gateway with JWT authentication and room-scoped broadcasting
- Configuring the production deployment (identifying the `sameSite: 'strict'` vs `'none'` cookie issue for cross-domain Vercel + Render)

**What I learned:**
- **Integer-only arithmetic is non-negotiable for financial apps.** Floats accumulate rounding errors. Storing paisa as integers and only converting to rupees for display is the correct pattern — not an optional optimization.
- **Authorization must be server-side.** The frontend can hide buttons, but the API must enforce rules independently. The settlement impersonation bug (any user could settle on behalf of any other) only existed because the backend wasn't checking `dto.payerId === req.user.id`.
- **MongoDB transactions require a replica set.** This is not obvious from the docs and costs time when you discover it during integration testing.
- **Real-time state management is subtle.** The decision to treat socket events as invalidation signals (refetch from API) rather than applying them as state patches avoids a whole class of race conditions and stale-state bugs.
- **AI is most useful when you give it precise constraints.** Saying "fix the amount validation bug" produced generic suggestions. Saying "the Zod resolver omits amountInPaisa which means useWatch returns undefined before the user types anything" produced the exact fix immediately.

---

## Project Structure

```
SplitMate/
├── apps/
│   ├── api/                    ← NestJS backend (port 3000)
│   │   ├── src/
│   │   │   ├── auth/           POST /auth/signup|login|refresh|logout
│   │   │   ├── users/          UsersService (no public controller)
│   │   │   ├── groups/         CRUD + member management
│   │   │   ├── expenses/       CRUD + split calculator
│   │   │   ├── balances/       GET balances + simplified debts
│   │   │   ├── settlements/    POST settlement + GET history
│   │   │   ├── activity/       Activity log per group
│   │   │   ├── dashboard/      Aggregated user summary
│   │   │   ├── socket/         Socket.io gateway
│   │   │   └── common/         ValidationPipe, HttpExceptionFilter
│   │   ├── scripts/            Seed scripts
│   │   └── .env                ← configure this
│   │
│   └── client/                 ← React + Vite frontend (port 5173)
│       └── src/
│           ├── pages/          Login, Signup, Dashboard, Groups, GroupDetail, History
│           ├── components/     Tabs, modals, shared UI
│           ├── hooks/          useSocket, useApi
│           ├── lib/            api.js (Axios), socketClient.js, formatMoney.js
│           ├── schemas/        Zod schemas for all forms
│           └── contexts/       AuthContext (in-memory token)
```

---

## Environment Variables

### Backend (`apps/api/.env`)

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Secret for signing JWT access tokens |
| `REFRESH_TOKEN_EXPIRES_DAYS` | Refresh token lifetime in days (default: 7) |
| `BCRYPT_ROUNDS` | bcrypt cost factor (default: 11) |
| `PORT` | API port (default: 3000) |
| `CLIENT_ORIGIN` | Frontend URL for CORS — set to your Vercel URL in production |
| `NODE_ENV` | Set to `production` on Render |

### Frontend (`apps/client/.env`)

| Variable | Description |
|---|---|
| `VITE_API_URL` | Leave empty for local dev (Vite proxy handles it). Set to your Render URL in production (e.g. `https://splitmate-api.onrender.com`) |

---

## Deployment (Vercel + Render)

### Render (Backend)

| Setting | Value |
|---|---|
| Root Directory | `apps/api` |
| Build Command | `npm install && npm run build` |
| Start Command | `npm run start:prod` |

Add environment variables in the Render dashboard: `MONGODB_URI`, `JWT_SECRET`, `REFRESH_TOKEN_EXPIRES_DAYS`, `BCRYPT_ROUNDS`, `CLIENT_ORIGIN` (your Vercel URL), `NODE_ENV=production`.

### Vercel (Frontend)

| Setting | Value |
|---|---|
| Root Directory | `apps/client` |
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |

Add environment variable: `VITE_API_URL` = your Render service URL (no trailing slash).

**Deploy Render first** to get the backend URL, then set `VITE_API_URL` on Vercel, then update `CLIENT_ORIGIN` on Render with the Vercel URL.
