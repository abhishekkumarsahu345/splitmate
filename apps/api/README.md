# SplitMate — API

The SplitMate backend is a REST + WebSocket API built with **NestJS**, **MongoDB** (Mongoose), and **Socket.io**. It handles authentication, group and expense management, real-time balance updates, and settlement recording.

---

## Project Overview

SplitMate lets groups of users track shared expenses and settle debts. Core flows:

1. User signs up / logs in
2. User creates a group and adds members by searching registered emails
3. Members add expenses, choosing equal or exact splits
4. The app calculates net balances and suggests the minimum set of payments to settle
5. Members record settlements, which update balances in real time for everyone in the group

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS (TypeScript) |
| Database | MongoDB via Mongoose |
| Authentication | JWT (access token) + rotating refresh token |
| Password hashing | bcrypt |
| Real-time | Socket.io |
| Validation | class-validator + class-transformer |

---

## Setup Instructions

### Prerequisites

- Node.js 18+
- A MongoDB instance (local or Atlas)

### Install

```bash
cd apps/api
npm install
```

### Environment Variables

Create `apps/api/.env`:

```env
PORT=3000
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/splitmate
JWT_SECRET=your-very-long-random-secret
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=30
BCRYPT_ROUNDS=11
CLIENT_ORIGIN=http://localhost:5173
```

| Variable | Purpose |
|---|---|
| `PORT` | HTTP server port (default 3000) |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret used to sign/verify access tokens |
| `JWT_EXPIRES_IN` | Access token TTL (e.g. `15m`) |
| `REFRESH_TOKEN_EXPIRES_DAYS` | Refresh token lifetime in days |
| `BCRYPT_ROUNDS` | bcrypt cost factor (11 recommended) |
| `CLIENT_ORIGIN` | Allowed CORS origin for the frontend |

### Run

```bash
# Development (watch mode)
npm run start:dev

# Production
npm run start:prod
```

---

## Authentication Architecture

### Access Token

- **Storage:** In-memory only (JavaScript module-level variable in `AuthContext.jsx`). Never written to `localStorage` or `sessionStorage`.
- **Why:** Avoids XSS-accessible token storage. Memory is cleared on tab close.
- **Type:** JWT signed with `JWT_SECRET`, expires in 15 minutes (`JWT_EXPIRES_IN`).
- **Usage:** Sent as `Authorization: Bearer <token>` header on every API request.

### Refresh Token

- **Storage:** `httpOnly`, `Secure`, `SameSite=Strict` cookie named `refresh_token`.
- **Why:** `httpOnly` prevents JavaScript access entirely (XSS cannot steal it). `SameSite=Strict` prevents CSRF. `Secure` ensures it is only sent over HTTPS.
- **Contents:** A random 32-byte hex string. The raw token is **never stored in the database** — only its SHA-256 hash is persisted (`RefreshToken` collection).
- **Rotation:** Every use of a refresh token invalidates (revokes) it and issues a new one. If a stolen token is replayed after legitimate use, the hash won't match any active token.
- **Expiry:** 30 days (configurable via `REFRESH_TOKEN_EXPIRES_DAYS`). A MongoDB TTL index auto-purges expired documents.

### Transparent Refresh Flow

The Axios interceptor in `apps/client/src/lib/api.js` detects `401` responses, calls `POST /auth/refresh`, updates the in-memory token, and retries the original request — transparently, without user interaction. Concurrent requests that 401 during a refresh are queued and retried together once the new token arrives.

### Password Hashing

Passwords are hashed with **bcrypt** at a configurable cost factor (`BCRYPT_ROUNDS`, default 11). Plain-text passwords are never stored or logged.

### Password Rules

- Minimum 8 characters
- Must contain at least one letter
- Must contain at least one digit

---

## Authorization

All protected routes require a valid JWT (enforced by `JwtAuthGuard`). Group-level access is enforced at the database query level, not just route level:

| Guard | Enforces |
|---|---|
| `JwtAuthGuard` | Valid JWT on every non-public route |
| `GroupMemberGuard` | Requester is a member of the target group |
| `GroupOwnerGuard` | Requester is the owner of the target group |

`GroupMemberGuard` and `GroupOwnerGuard` query the `Membership` and `Group` collections respectively — a valid token for a non-member user cannot access another group's data.

The evaluator can confirm this by calling `GET /groups/:id` with a valid JWT for a user who is not a member of that group — the response will be `403 Forbidden`.

---

## Group / Membership Model

Groups and users have a **many-to-many** relationship implemented through a dedicated `Membership` collection:

```
User ──< Membership >── Group
         userId
         groupId
         (unique compound index)
```

This allows one user to belong to many groups and one group to have many users, without embedding arrays or denormalizing data.

### Member Removal Rule

A member can only be removed if their **net balance in that group is exactly zero**. The service computes:

```
net = paidCredit - owedDebit + settledPaid - settledReceived
```

If `net !== 0`, the removal is rejected with a `422` error.

---

## Expense Model

Each expense stores:

- `description`, `amountInPaisa`, `paidByUserId`, `date`, `splitType` (EQUAL | EXACT)
- `splits[]` — array of `{ userId, shareInPaisa }` subdocuments
- `createdByUserId` — for permission checks (edit/delete requires creator or group owner)
- `deletedAt` — soft-delete field (null = active)

Amounts are stored as **integer paisa** (1 rupee = 100 paisa) to avoid floating-point rounding errors.

---

## Equal Split Algorithm and Rounding Rule

When splitting ₹`N` equally among `k` members:

1. Compute `floor(N / k)` — the base share for each member.
2. Compute the remainder `r = N mod k`.
3. Add 1 paisa to each of the first `r` members (sorted by `userId` string, ascending — deterministic).

**Example — ₹100 / 3 members:**
- Base share: `floor(10000 / 3)` = 3333 paisa
- Remainder: `10000 mod 3` = 1
- Member 1 (sorted first): 3334 paisa = ₹33.34
- Member 2: 3333 paisa = ₹33.33
- Member 3: 3333 paisa = ₹33.33
- Total: 3334 + 3333 + 3333 = **10000 paisa = ₹100.00 ✓**

**Example — ₹1 / 3 members:**
- Base share: `floor(100 / 3)` = 33 paisa
- Remainder: `100 mod 3` = 1
- Member 1: 34 paisa
- Member 2: 33 paisa
- Member 3: 33 paisa
- Total: 34 + 33 + 33 = **100 paisa = ₹1.00 ✓**

No money is invented or discarded.

---

## Money Representation

All monetary values are stored and transmitted as **integer paisa** (smallest unit of INR, 1/100th of a rupee). The frontend converts to rupees for display using `formatMoney()`. This eliminates floating-point arithmetic errors in all financial calculations.

---

## Balance Calculation

For each group, `BalancesService.getBalances(groupId)` produces a `Record<userId, { name, email, balance }>` where:

- `balance > 0` means the user is **owed** that amount by the group
- `balance < 0` means the user **owes** that amount to the group
- `balance = 0` means settled

The formula per user:

```
balance = sum(expenses where paidBy === user) [credit]
        - sum(splits where userId === user)   [debit]
        + sum(settlements where fromUserId === user) [paid a debt]
        - sum(settlements where toUserId === user)   [received payment]
```

### Simplified Debts

`getSimplified()` runs a greedy creditor/debtor matching algorithm (`debt-simplifier.ts`) that produces the **minimum number of transactions** to zero all balances. Creditors and debtors are sorted descending by amount; each iteration matches the largest creditor against the largest debtor.

---

## Settlement Logic

Before a settlement is created:

1. Both payer and payee must be current group members.
2. `getSimplified()` is called — a `directDebt` entry must exist where `from === payerId` and `to === payeeId`.
3. If no such debt exists: `422 — No outstanding balance from payer to payee`.
4. If `amountInPaisa > directDebt.amountInPaisa`: `422 — Settlement amount exceeds outstanding balance (max: ₹X.XX)`.

Settlements are persisted and factored into all future balance calculations. They are NOT soft-deleted when a group is deleted — the full cascade delete includes settlements.

---

## Pagination

Expense listing (`GET /groups/:id/expenses`) uses **server-side pagination**:

- Query params: `page` (default 1), `pageSize` (default 20, max 100)
- The database query uses `.skip((page - 1) * pageSize).limit(pageSize)` — no client-side slicing
- Total count is returned alongside data for frontend page rendering

Activity log and settlement history are also server-side paginated with the same pattern.

---

## Sorting

Expenses support sorting by:

- `sortBy=date` (default) — uses compound index `{ groupId, date: -1 }`
- `sortBy=amount` — uses compound index `{ groupId, amountInPaisa: -1 }`
- `sortOrder=asc|desc`

The DB index on both sort fields ensures efficient sorting without full collection scans.

---

## WebSocket Technology

**Socket.io** is used for real-time updates (via `@nestjs/websockets`). Polling is not used anywhere.

### WebSocket Authentication

On every socket connection, the gateway (`SocketGateway.handleConnection`) extracts `socket.handshake.auth.token` and verifies it as a JWT. If the token is missing or invalid, the socket is immediately disconnected. This means:

- Unauthenticated clients cannot connect
- Expired tokens cause connection failure (client reconnects with a fresh token via the auth interceptor)

### WebSocket Group Authorization

Clients emit `join:group` to subscribe to group events. The gateway:

1. Validates the `groupId` is a valid MongoDB ObjectId
2. Queries `Membership` to verify the connected user is a member
3. Only then calls `socket.join('group:{groupId}')`

A non-member cannot receive any `group:{groupId}` room events regardless of what they emit.

### Event Scoping

| Event | Sent to |
|---|---|
| `balances:updated` | `group:{groupId}` room only |
| `activity:new` | `group:{groupId}` room **AND** each `user:{userId}` personal room |
| `settlement:created` | `group:{groupId}` room only |

Personal `user:{id}` rooms are joined automatically on socket connect (no emit needed). The dashboard listens to `activity:new` on the personal room to refresh stats when any group the user belongs to changes — without needing to join any group room.

### Disconnect / Reconnect Strategy

If the socket disconnects:

- The application continues working — all data is always readable from the REST API
- Socket.io client auto-reconnects with exponential backoff (built-in behavior)
- On reconnect, components that hold live data re-fetch from the API:
  - `ActivityTab`: resets to page 1 and fetches latest entries
  - `BalancesTab`: re-fetches balances and invalidates the simplified cache
  - `DashboardPage`: re-fetches dashboard stats

This means a reconnect always brings the UI into sync, even if events were missed during the disconnect window.

---

## API Overview

### Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/signup` | — | Register new user |
| POST | `/auth/login` | — | Login, returns access token + sets refresh cookie |
| POST | `/auth/refresh` | cookie | Rotate refresh token, return new access token |
| POST | `/auth/logout` | JWT | Revoke all refresh tokens |

### Users
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/users/search?q=` | JWT | Search registered users by name/email |

### Groups
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/groups` | JWT | Create group (owner = caller) |
| GET | `/groups` | JWT | List user's groups |
| GET | `/groups/:id` | JWT + Member | Get group details + members |
| PATCH | `/groups/:id` | JWT + Owner | Rename group |
| DELETE | `/groups/:id` | JWT + Owner | Delete group + cascade |
| POST | `/groups/:id/members` | JWT + Owner | Add member by userId |
| DELETE | `/groups/:id/members/:userId` | JWT + Owner | Remove member (if zero balance) |

### Expenses
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/groups/:id/expenses` | JWT + Member | Add expense |
| GET | `/groups/:id/expenses` | JWT + Member | List expenses (paginated + sorted) |
| PATCH | `/groups/:id/expenses/:eid` | JWT + Member + Creator/Owner | Edit expense |
| DELETE | `/groups/:id/expenses/:eid` | JWT + Member + Creator/Owner | Delete expense (soft) |

### Balances
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/groups/:id/balances` | JWT + Member | Net balance per member |
| GET | `/groups/:id/balances/simplified` | JWT + Member | Minimum payment suggestions |

### Settlements
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/groups/:id/settlements` | JWT + Member | Record a payment |
| GET | `/settlements/history` | JWT | User's full settlement history |

### Activity
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/groups/:id/activity` | JWT + Member | Paginated activity feed |

### Dashboard
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/dashboard` | JWT | Aggregated stats for the logged-in user |

---

## Important Design Decisions

### Why paisa (integer minor units)?
Floating-point arithmetic cannot represent all decimal fractions exactly. Storing amounts as integers (paisa = 1/100 rupee) ensures all arithmetic is exact integer math with no rounding drift.

### Why rotate refresh tokens?
Token rotation means each refresh token can only be used once. If a token is stolen and used by an attacker, the legitimate user's next refresh will find their token already revoked, alerting to a potential compromise. The server revokes all tokens for that user on detecting a reused/invalid token.

### Why soft-delete expenses?
Hard-deleting an expense would require re-computing historical balances from scratch. Soft-delete (`deletedAt` field) preserves audit history in the `ActivityLog` while excluding deleted expenses from balance calculations via `deletedAt: null` query filters.

### Why MongoDB transactions for financial writes?
All operations that write to multiple collections (create expense + activity log, remove member + log, etc.) are wrapped in MongoDB multi-document transactions. This prevents partial writes where, e.g., an expense is saved but the activity log entry is lost.

### Why greedy debt simplification?
The minimum-transaction algorithm reduces the number of payments users need to make. A group of N people can always settle debts with at most N-1 payments, regardless of the original expense structure.
