# hOMER — AI Architecture & Context Guide

> **For AI coding assistants.** Read this before touching any file in this repo.  
> Last updated: 2026-02-25

---

## 1. System Overview

| Layer | Technology |
|---|---|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, React Router |
| **State / Data** | Firestore real-time listeners, Context API, custom hooks |
| **Backend** | Firebase Cloud Functions (Node.js 20 / TypeScript, Gen 2) |
| **Auth** | Firebase Authentication + Custom Claims (role, agencyId) |
| **Storage** | Firebase Storage (property images, profile photos) |
| **Payments** | Stripe (webhook → Cloud Function → Firestore provisioning) |
| **WhatsApp** | WAHA self-hosted *or* Green API, fully managed server-side |
| **Maps** | React Leaflet + Nominatim geocoding via Cloud Function |
| **Charts** | Recharts |
| **Kanban** | @dnd-kit |
| **Dashboard Grid** | react-grid-layout (layout saved per-user in Firestore) |

---

## 2. Multi-Tenant Isolation (CRITICAL)

Every document in Firestore carries an `agencyId` field.

```
User → belongs to Agency (1:1)
Lead / Property / Deal / Task / Alert → belongs to Agency (N:1)
```

**Rules of Tenant Isolation (never break these):**

1. **Every new Firestore query** must include `.where('agencyId', '==', agencyId)`.
2. **Every Cloud Function** that accepts an `agencyId` from the client must re-verify it server-side via `users/{uid}.agencyId` — never trust the client-supplied value.
3. **Firestore Security Rules** enforce isolation as a safety net (not the primary guard).
4. **Custom Claims** (`agencyId`, `role`) are set by `agencies-createAgencyAccount` and synced by `users-updateAgentRole`.
5. **Super Admins** (`role: 'super_admin'`) bypass tenant isolation only in `useGlobalStats` and `SuperAdminDashboard`.

---

## 3. Directory Structure

```
/
├── front/src/
│   ├── pages/          Main views (one file per route)
│   ├── components/     UI components (Cards, Modals, Kanban, Settings, etc.)
│   ├── services/       Firestore SDK wrappers (client-side reads & writes)
│   ├── hooks/          Custom React hooks
│   ├── context/        AuthContext, PreferencesContext
│   ├── utils/          webhookClient, analytics, constants, seedDatabase
│   └── types/          Shared TypeScript types (Lead, Property, Deal, Agency …)
│
└── back/functions/src/
    ├── agencies/       Agency creation & provisioning
    ├── users/          Team management, invitations, RBAC
    ├── properties/     CRUD, geocoding, URL scraping, import
    ├── leads/          CRUD, smart matching, external webhook intake
    ├── catalogs/       Webot shared catalog snapshots
    ├── tasks/          Firestore trigger cleanups
    ├── alerts/         System alert triggers
    ├── whatsapp.ts     WhatsApp managed integration (WAHA / Green API)
    ├── stripeWebhook.ts Stripe payment processing & agency provisioning
    └── config/admin.ts Firebase Admin SDK init
```

---

## 4. Pages & Routing

| Route | File | Access |
|---|---|---|
| `/` | `LandingPage.tsx` | Public |
| `/login` | `Login.tsx` | Public |
| `/register` | `Register.tsx` | Public |
| `/onboarding` | `Onboarding.tsx` | Authenticated, no agency yet |
| `/dashboard` | `Dashboard.tsx` | Any role |
| `/leads` | `Leads.tsx` | Any role |
| `/properties` | `Properties.tsx` | Any role |
| `/transactions` | `Transactions.tsx` | Any role |
| `/agents` | `Agents.tsx` | admin / manager only |
| `/settings` | `Settings.tsx` | Any role |
| `/super-admin` | `SuperAdminDashboard.tsx` | `super_admin` only |
| `/catalog/:id` | `SharedCatalog.tsx` | Public (expiry-gated) |
| `/join/:inviteId` | `AgentJoin.tsx` | Public (magic link) |

---

## 5. Cloud Functions — Security Audit

> **Legend:** ✅ = Properly secured | ⚠️ = Note/caveat | 🔴 = Security gap

### `agencies-createAgencyAccount`
✅ Auth guard → ✅ Duplicate-user check → ✅ Sets Custom Claims atomically  
*Sets `role: 'admin'` and `agencyId` via `setCustomUserClaims`.*

### `users-inviteAgent`
✅ Auth guard → ✅ RBAC (`role === 'admin'`) → ✅ Email regex validation  
✅ Same-agency check on target → ✅ Stub document prevents double-invite  
✅ Email sent via Gmail SMTP (password via Secret Manager, not env)

### `users-updateAgentRole` / `users-toggleAgentStatus`
✅ Auth guard → ✅ `role === 'admin'` check → ✅ `isActive !== false` check  
✅ Same-agency cross-check on target → ✅ Custom Claims synced on role change  
✅ Self-suspension blocked in `toggleAgentStatus`

### `users-completeAgentSetup` / `users-getInviteInfo`
✅ Auth guard → ✅ Invite token validated → ✅ Stub doc consumed atomically

### `properties-addProperty` / `properties-updateProperty` / `properties-deleteProperty`
✅ Auth guard → ✅ Agency membership verified via `users/{uid}` lookup  
✅ `agencyId` and `status` injected server-side (cannot be spoofed by client)

### `properties-geocodeNewProperty` / `properties-getCoordinates`
✅ Auth guard → Used for Nominatim geocoding (avoids CORS from browser)

### `properties-importPropertyFromUrl`
✅ Auth guard → URL scraping delegated to server (avoids CORS + API key exposure)

### `leads-addLead` / `leads-updateLead`
✅ Auth guard → ✅ Agency membership verified server-side  
✅ `status: 'new'` always injected server-side

### `leads-webhookReceiveLead` *(onRequest — public)*
✅ Timing-safe secret validation (`crypto.timingSafeEqual`)  
✅ Stealth 200 response on invalid secret (prevents endpoint discovery)  
✅ `agencyId` comes from query param, validated against Firestore existence

### `leads-matchPropertiesForLead`
✅ Auth guard → ✅ Agency isolation in property queries

### `catalogs-generateCatalog`
✅ Auth guard → ✅ Snapshot created for `shared_catalogs` with `expiresAt`  
✅ Public read of catalog gated by `expiresAt > request.time` in Firestore Rules

### `whatsapp-generateWhatsAppQR`
✅ Auth guard → ✅ `agencyId` resolved from `users/{uid}` (never trusted from client)  
✅ WAHA credentials never returned to frontend  
✅ Session named `agency_{agencyId}` — isolated per tenant

### `whatsapp-checkWhatsAppStatus`
✅ Auth guard → ✅ Polls WAHA/Green API server-side  
✅ Updates Firestore status atomically on connection confirmed

### `whatsapp-sendWhatsappMessage`
✅ Auth guard → ✅ Credentials fetched from `agencies/{agencyId}` server-side  
✅ Status checked before sending (rejects if not `'connected'`)  
✅ Frontend only sends `{ phone, message }` — never a token

### `whatsapp-disconnectWhatsApp`
✅ Auth guard → ✅ Stops WAHA session → ✅ Clears Firestore status

### `whatsapp-whatsappWebhook` *(onRequest — public)*
✅ `X-Webhook-Secret` header validation (env: `WAHA_WEBHOOK_SECRET`)  
✅ Idempotency check via `idMessage` deduplication  
✅ Phone normalisation (international → local Israeli format)  
✅ Supports both WAHA session format and Green API instance format

### `stripeWebhook` *(onRequest — public)*
✅ Stripe signature verification (`stripe.webhooks.constructEvent`)  
✅ Agency provisioning only triggers on `checkout.session.completed`  
✅ Creates Firebase Auth user + Firestore agency atomically

---

## 6. Client-Side Services — Security Notes

Direct Firestore SDK calls (in `/services/`) rely on **Firestore Security Rules** as their primary guard. This is acceptable for the current architecture but note the following:

| Service | Risk Level | Note |
|---|---|---|
| `dealService.ts` — `addDeal`, `updateDeal`, `deleteDeal` | ⚠️ Medium | No server-side agency membership enforcement. Relies entirely on Firestore Rules. Recommendation: migrate to Cloud Functions if RBAC on deals is needed. |
| `leadService.ts` — direct updates | ⚠️ Low | Same pattern. Firestore Rules guard `agencyId` match. |
| `propertyService.ts` — image upload | ✅ Low | Storage Rules restrict uploads to `agencies/{agencyId}/**`, validated by Auth. |
| `agencyService.ts` — `updateAgencyGoals`, `updateAgencySettings` | ⚠️ Medium | Direct Firestore write. Rules require `auth.token.agencyId == agencyId`. Any role can update goals — no admin-only restriction at rule level. |

### Recommended Future Migrations (Server-Side)

| Current Location | Suggested Cloud Function | Reason |
|---|---|---|
| `dealService.addDeal` (client) | `deals-addDeal` (server) | Validate duplicate property/lead assignments server-side |
| `agencyService.updateAgencySettings` (client) | `agencies-updateSettings` (server) | Enforce admin-only restriction, sanitize `customDealStages` |
| `importService.ts` bulk import (client) | `properties-bulkImport` (server) | Avoid large data payloads from browser; enforce rate limits |

---

## 7. Environment Variables & Secrets

| Variable | Where Set | Used By |
|---|---|---|
| `GMAIL_APP_PASSWORD` | Firebase Secret Manager | `users/team.ts` — invite emails |
| `WEBHOOK_SECRET` | Firebase Secret Manager | `leads/webhookReceiveLead.ts` |
| `WAHA_BASE_URL` | Firebase Secret Manager | `whatsapp.ts` — all WAHA calls |
| `WAHA_MASTER_KEY` | Firebase Secret Manager | `whatsapp.ts` — WAHA Bearer auth (blank = Green API mode) |
| `WAHA_WEBHOOK_SECRET` | Firebase Secret Manager | `whatsapp.ts` — inbound webhook validation |
| `GREEN_API_WEBHOOK_SECRET` | Firebase Secret Manager | `whatsapp.ts` — fallback header name |
| `STRIPE_SECRET_KEY` | Firebase Secret Manager | `stripeWebhook.ts` |
| `STRIPE_WEBHOOK_SECRET` | Firebase Secret Manager | `stripeWebhook.ts` |
| `VITE_FIREBASE_*` | `.env` (frontend, public) | Firebase SDK init |

> ⚠️ **Never commit `.env` files with real keys to Git.** Use `.env.example` templates only.

---

## 8. Firestore Data Model

```
agencies/{agencyId}
  ├── settings: { customDealStages: [], ... }
  ├── monthlyGoals / yearlyGoals
  └── whatsappIntegration: { status, sessionName, idInstance?, apiTokenInstance? }

users/{uid}
  ├── agencyId, role, name, email, phone
  ├── isActive, profileImage
  └── whatsappTemplates: [{ id, name, content }]

leads/{leadId}
  ├── agencyId, name, phone, email, source
  ├── status, assignedAgentId
  ├── requirements: { desiredCity[], maxBudget, minRooms, propertyType[] }
  └── messages/{msgId}   ← WhatsApp inbound messages

properties/{propertyId}
  ├── agencyId, address, city, type, price
  ├── status, assignedAgentId
  └── images: string[]   ← Firebase Storage URLs

deals/{dealId}
  ├── agencyId, leadId, propertyId, assignedAgentId
  ├── stage, projectedCommission, actualCommission
  └── probability

tasks/{taskId}       ← per-agency tasks with leadId/propertyId refs
alerts/{alertId}     ← system-generated notifications
shared_catalogs/{id} ← Webot snapshots (public with expiry)
```

---

## 9. Development Guidelines for AI

1. **Never break tenant isolation.** Every query needs `agencyId`. Every Cloud Function needs server-side membership verification.
2. **Prefer Cloud Functions for writes** that have business logic (status injection, RBAC, deduplication).
3. **Never return secrets to the frontend.** WhatsApp tokens, API keys, SMTP passwords — all stay in Cloud Functions.
4. **Input validation in Cloud Functions** must come before Firestore reads (fail fast, reduce cost).
5. **UI patterns:** Tailwind CSS, `lucide-react` icons, `dir="rtl"` for Hebrew layout.
6. **No unnecessary renders:** Use `useMemo`, `useCallback`, debounced Firestore saves in heavy views (Kanban, Dashboard).
7. **Service layer:** Firebase code belongs in `/services/`, not inside React components.
8. **Firestore indexes:** Document required composite indexes in code comments (e.g., `agencyId ASC + createdAt DESC`).



⚠️ 3 נקודות לשיפור עתידי (לא קריטיות)
שירות קליינט	הבעיה	המלצה
dealService.addDeal/deleteDeal	מסתמך רק על Firestore Rules, ללא RBAC server-side	להעביר ל-Cloud Function
agencyService.updateAgencySettings	כל role יכול לשנות הגדרות משרד	להגביל ל-admin בפונקציה
importService (bulk import)	הכל עובד בדפדפן — קובץ גדול עלול להיות בעייתי	להעביר ל-Cloud Function
