# AI Architecture & Context Guide

This document is designed to provide AI coding assistants with a rapid, comprehensive understanding of the hOMER (Omer Digital) Real Estate Agency OS project.

## 1. System Overview

- **Architecture:** Frontend-First, Serverless Backend
- **Frontend:** React.js, TypeScript, Vite, Tailwind CSS, Lucide-react, React Router, React Leaflet (Maps), Recharts, react-grid-layout (Dashboard), @dnd-kit (Kanban).
- **Backend:** Firebase (Firestore, Authentication, Storage), Firebase Cloud Functions (Node.js/TypeScript).

## 2. Directory Structure

- `/front` - Frontend Application
  - `/src/components` - UI Components (Cards, Modals, Forms, Maps, Deals Kanban, WhatsApp Bulk Sending)
  - `/src/pages` - Main views (LandingPage, Dashboard, Leads, Properties, Transactions, Agents, Settings, Login, Onboarding, AgentJoin, SharedCatalog, SuperAdminDashboard)
  - `/src/services` - Data access layer (Firestore listeners and mutations, bulk imports)
  - `/src/types` - Type definitions (`Lead`, `Property`, `Deal`, `Agency`, `User`)
  - `/src/hooks` - Custom React hooks (`useLiveDashboardData`, `useSuperAdmin`)
  - `/src/context` - Global contexts (`AuthContext`, `PreferencesContext`)
  - `/src/utils` - Helper functions (date formatting, excel processing, seed data)
- `/back/functions` - Backend Cloud Functions
  - `/src/agencies` - Agency onboarding and creation
  - `/src/users` - User and team management (invitations, role assignments)
  - `/src/properties` - Property CRUD, geocoding coordinates, URL scraping imports
  - `/src/leads` - Lead CRUD, smart matching algorithms, CRM webhooks
  - `/src/catalogs` - Shared catalog (Webot) generation and snapshots
  - `/src/tasks` & `/src/alerts` - Automated cleanup triggers and system notifications
  - `/src/whatsapp` - WhatsApp integration, QR code generation, messaging webhooks

## 3. Frontend Pages & Routing

- `LandingPage.tsx` - Public-facing marketing website showcasing hOMER's features.
- `Login.tsx` - Authentication and Google Sign-in.
- `Onboarding.tsx` - Agency account creation (Tenant root creation).
- `Dashboard.tsx` - Mission control: Customizable drag-and-drop widgets (react-grid-layout) tracking financial data, alerts, and map views. Saves layouts automatically.
- `SuperAdminDashboard.tsx` - System-wide admin panel for managing cross-agency data and billing metrics.
- `Leads.tsx` - Lead tracking, filtering, and "Smart Match" (finding properties for a lead).
- `Properties.tsx` - Property inventory, status tracking, map views, and bulk Excel imports.
- `Transactions.tsx` - Drag-and-drop Kanban board (@dnd-kit) for deals pipeline (Tour -> Offer -> Contract -> Won/Lost).
- `Agents.tsx` - Team management (Admin/Manager only), inviting new agents.
- `Settings.tsx` - User/Agency profile, notification preferences, and advanced WhatsApp Webhooks connection setup.
- `SharedCatalog.tsx` - Public-facing Webot catalogs for clients (read-only snapshots).
- `AgentJoin.tsx` / `AgentSetup.tsx` - Flow for invited agents to join an existing agency via Magic Link.

## 4. Architecural Patterns & State Management

- **Tenant Isolation:** Every user (except Super Admins) belongs to an `agencyId`. All Firestore queries and rules strictly enforce that users can only read/write documents where `document.agencyId == request.auth.token.agencyId`.
- **Context API:** `AuthContext` provides global user data. `PreferencesContext` manages local/Firestore UI states like theme, customizable dashboard layouts, and feature toggles, handling debounced saves to prevent massive read/writes.
- **Service Layer Pattern:** Firestore interactions are abstracted into `/src/services/` (e.g., `agencyService.ts`, `importService.ts`, `dealService.ts`) to keep React components pure.
- **Bulk Operations:** `importService.ts` leverages `xlsx` parsing to handle large-scale imports of Properties, Leads, and Deals from spreadsheets, transforming Hebrew schema synonyms into internal data types.

## 5. Security Model

- **Firestore Rules:** Custom `.rules` files enforce boundaries. Write access to sensitive configurations (e.g., `whatsappTemplates`) is granted to specific roles.
- **Roles:** 
    - `super-admin`: Can view high-level metrics across all agencies.
    - `admin`/`manager`: Can invite agents and edit agency details.
    - `agent`: Standard access bounded by `agencyId`.
- **Public Access:** Granted only to documents inside `shared_catalogs` (Webot) natively, and *only* if `expiresAt > request.time`.

## 6. Development Guidelines for AI

1.  **Do Not Break Tenant Isolation:** Any new Firestore query must include `agencyId`. Always pass the `agencyId` down to service methods.
2.  **Service Abstraction:** Put Firebase code in `services/`, not inside React UI components.
3.  **UI/UX:** Use Tailwind CSS along with `lucide-react` icons. Support `dir="rtl"` standard layout. Use generic and dynamic variable tokens (`slate-50`, `blue-900`) instead of flat colors.
4.  **No Unnecessary Renders:** When building heavy views (like the Deals Kanban or Interactive Dashboard), use `memo`, specific hooks, or debounced saving to reduce flicker and unwanted render cycles.
