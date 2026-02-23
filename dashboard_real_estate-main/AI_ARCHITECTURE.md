# AI Architecture & Context Guide

This document is designed to provide AI coding assistants with a rapid, comprehensive understanding of the Omer Digital Real Estate Agency OS (Webot Engine) project.

## 1. System Overview

- **Architecture:** Frontend-First, Serverless Backend
- **Frontend:** React.js, TypeScript, Vite, Tailwind CSS, Lucide-react, React Router, React Leaflet (Maps), Recharts.
- **Backend:** Firebase (Firestore, Authentication, Storage), Firebase Cloud Functions (Node.js/TypeScript).

## 2. Directory Structure

- `/front` - Frontend Application
  - `/src/components` - UI Components (Cards, Modals, Forms, Maps)
  - `/src/pages` - Main views (Dashboard, Leads, Properties, Transactions, Agents, Settings, Login, Onboarding, AgentJoin, SharedCatalog)
  - `/src/services` - Data access layer (Firestore listeners and mutations, grouped by feature)
  - `/src/types` - Type definitions (TypeScript interfaces: `Lead`, `Property`, `Deal`, `Agency`, `User`)
  - `/src/hooks` - Custom React hooks for global state or real-time Firestore connections
  - `/src/utils` - Helper functions (date formatting, currency, validations)
- `/back/functions` - Backend Cloud Functions
  - `/src/agencies` - Agency onboarding and creation
  - `/src/users` - User and team management (invitations, role assignments)
  - `/src/properties` - Property CRUD, geocoding coordinates, and URL scraping imports
  - `/src/leads` - Lead CRUD, smart matching algorithms, CRM webhooks
  - `/src/catalogs` - Shared catalog (Webot) generation and snapshots
  - `/src/tasks` - Automated task cleanup triggers (e.g., when a lead is deleted)
  - `/src/alerts` - System alert triggers for the dashboards
  - `/src/whatsapp` - WhatsApp integration, QR code generation, messaging webhooks

## 3. Frontend Pages & Routing

- `Login.tsx` - Initial authentication and Google Sign-in.
- `Onboarding.tsx` - Agency account creation (Tenant root creation).
- `Dashboard.tsx` - Mission control: financial data, active properties, agent tasks, map view, and AI insights.
- `Leads.tsx` - Lead tracking, Kanban or table views, filtering, and "Smart Match" (finding properties for a lead).
- `Properties.tsx` - Property inventory management, status tracking, and map views.
- `Transactions.tsx` - Kanban board for deals pipeline (Tour -> Offer -> Contract -> Won/Lost).
- `Agents.tsx` - Team management (Admin/Manager only), inviting new agents.
- `Settings.tsx` - User/Agency profile, notifications, and WhatsApp connection setup.
- `SharedCatalog.tsx` - Public-facing Webot catalogs for clients (read-only snapshots).
- `AgentJoin.tsx` / `AgentSetup.tsx` - Flow for invited agents to join an existing agency via Magic Link.

## 4. Frontend Services (Data Layer)

All Firestore interactions are abstracted into services within `/src/services/` to keep UI components pure and handle Tenant Isolation properly:
- `agencyService.ts` - Agency metadata, settings.
- `alertService.ts` - System notifications/alerts.
- `authService.ts` - Firebase Authentication wrappers.
- `catalogService.ts` - Fetching/handling shared Webot catalogs.
- `dealService.ts` - Transaction/Deal kanban state management.
- `importService.ts` - Handling bulk data imports (Excel parsing, property scraping).
- `leadService.ts` - Lead management and querying.
- `propertyService.ts` - Property management and querying.
- `storageService.ts` - Firebase storage (images, attachments).
- `taskService.ts` - To-do tasks for agents.
- `teamService.ts` - Agent roster and roles inside the agency.
- `userService.ts` - Current logged-in user context.

## 5. Backend Cloud Functions (API & Triggers)

The backend exposes several HTTPS callables (accessed securely by the frontend service layer) and external webhooks (for integrations):
- **agencies:** `agencies-createAgencyAccount`
- **users:** `users-inviteAgent`, `users-getInviteInfo`, `users-updateAgentRole`, `users-toggleAgentStatus`, `users-completeAgentSetup`
- **tasks:** `tasks-cleanupTasksOnLeadDelete`, `tasks-cleanupTasksOnPropertyDelete`
- **properties:** `properties-getLiveProperties`, `properties-addProperty`, `properties-updateProperty`, `properties-deleteProperty`, `properties-importPropertyFromUrl`, `properties-getCoordinates`, `properties-getAddressSuggestions`
- **leads:** `leads-webhookReceiveLead`, `leads-addLead`, `leads-updateLead`, `leads-getLiveLeads`, `leads-matchPropertiesForLead`
- **catalogs:** `catalogs-generateCatalog`
- **alerts:** `alerts-triggerSystemAlert`
- **whatsapp:** `whatsapp-getWhatsAppQrCode`, `whatsapp-whatsappWebhook`

## 6. Security Model & Tenant Isolation

This is a multi-tenant application. Data security is paramount.
- **Tenant Isolation:** Every user (Agent/Manager) belongs to an `agencyId`.
- **Firestore Rules:** `firestore.rules` strictly enforces that users can only read/write documents where `document.agencyId == request.auth.token.agencyId`. Do not bypass this.
- **Public Access:** Only granted to documents inside `shared_catalogs` (Webot), and *only* if `expiresAt > request.time`.
- **Admin Privilege:** Cloud functions run with Admin privileges but internally validate the calling user's `agencyId` against the requested resource.

## 7. Development Guidelines for AI

1.  **Do Not Break Tenant Isolation:** Any new Firestore query or rule must include `agencyId`. Check the user's custom claims (`token.agencyId`) in Cloud Functions.
2.  **Service Layer Pattern:** Prefer adding methods to existing services in `/src/services/` over making direct `getDocs`/`onSnapshot` calls inside components.
3.  **Strict Typing:** Ensure all new data objects implement existing types (or update `/src/types/` as needed). TypeScript is enforced across the stack.
4.  **UI/UX Consistency:** Use Tailwind CSS along with `lucide-react` icons. Maintain the clean, RTL-friendly layout. Avoid introducing new styling paradigms unnecessarily.
5.  **Environment Variables:** Do not hardcode secret keys. Use Firebase environment configs or frontend `.env` logic cautiously.
