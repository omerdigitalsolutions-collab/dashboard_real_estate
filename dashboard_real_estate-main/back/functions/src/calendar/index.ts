/**
 * ─── Calendar Module — Barrel Export ─────────────────────────────────────────
 *
 * Single import point for all Cloud Function handlers in the calendar module.
 * Import from this file in src/index.ts:
 *
 *   import { getAuthUrl, handleOAuthCallback, createEvent } from './calendar';
 */

export { getAuthUrl, handleOAuthCallback } from './oauthHandlers';
export { createEvent } from './eventManager';
export { listEvents } from './listEvents';
export { disconnect } from './disconnect';

// ── Also export utility functions for use by other server-side modules ────────
export { createCalendarEvent } from './eventManager';
export { linkEventToEntity, unlinkEventFromEntity } from './entityLinker';
export { getOAuthClient } from './oauthClient';
export { saveUserTokens, getUserTokens, deleteUserTokens } from './tokenStore';
export type { CalendarEventPayload, StoredTokens, CreateEventResult, CalendarEntityType } from './types';
