/**
 * ─── Calendar Module — Shared Types ──────────────────────────────────────────
 *
 * All TypeScript interfaces and types shared across the calendar module.
 */

// ── OAuth Token Storage ───────────────────────────────────────────────────────

/**
 * The shape of OAuth2 tokens as returned by Google and stored in Firestore.
 */
export interface StoredTokens {
    access_token: string;
    refresh_token: string;
    expiry_date: number;   // Unix timestamp in milliseconds
    token_type: string;
    scope: string;
}

// ── Event Creation ────────────────────────────────────────────────────────────

/**
 * A structured time value as required by the Google Calendar API.
 */
export interface CalendarDateTime {
    /**
     * ISO 8601 datetime string, e.g. "2025-06-15T09:00:00"
     */
    dateTime: string;
    /**
     * IANA timezone name, e.g. "Asia/Jerusalem"
     */
    timeZone: string;
}

/**
 * An attendee entry for a Google Calendar event.
 */
export interface CalendarAttendee {
    email: string;
    displayName?: string;
}

/**
 * The payload required to create a new Google Calendar event.
 * Mirrors the relevant subset of the Google Calendar Events resource.
 */
export interface CalendarEventPayload {
    /** Short, human-readable title of the event. */
    summary: string;
    /** Optional detailed description / agenda. */
    description?: string;
    /** Optional physical or virtual location. */
    location?: string;
    /** Event start time. */
    start: CalendarDateTime;
    /** Event end time. */
    end: CalendarDateTime;
    /** Optional list of attendees to invite. */
    attendees?: CalendarAttendee[];

    /** The user ID of the agent assigned to this meeting task. */
    assignedToAgentId?: string;

    /** Polymorphic CRM relationship (e.g. Lead or Property). */
    relatedTo?: {
        id: string;
        type: 'lead' | 'property';
        name: string;
    };

    /** Buyer lead ID linked to this meeting. */
    buyerId?: string;
    /** Seller lead ID linked to this meeting. */
    sellerId?: string;
    /** Property ID linked to this meeting. */
    propertyId?: string;
}

// ── Create Event Result ───────────────────────────────────────────────────────

/**
 * The data returned after successfully creating a Google Calendar event.
 */
export interface CreateEventResult {
    eventId: string;
    htmlLink: string;
}

// ── Entity Linking ────────────────────────────────────────────────────────────

/**
 * The CRM entry structure for synchronization with Firestore.
 * Matches the frontend interface 'AppTask' in front/src/types/index.ts.
 */
export interface AppTask {
    id: string;
    agencyId: string;
    createdBy: string;
    assignedToAgentId?: string; // legacy single-assignee
    assignedToAgentIds?: string[]; // multi-assignee list of UIDs
    title: string;
    description?: string;
    status?: string;
    dueDate: any; // Firestore Timestamp
    priority: 'High' | 'Medium' | 'Low';
    isCompleted: boolean;
    completedAt?: any | null;
    type: 'meeting' | 'call' | 'general';
    googleEventId?: string;
    relatedTo?: {
        id: string;
        type: 'lead' | 'property';
        name?: string;
    };
    buyerId?: string;
    sellerId?: string;
    propertyId?: string;
    createdAt?: any;
    updatedAt?: any;
}

/**
 * The CRM entity types that can be linked to a Google Calendar event.
 */
export type CalendarEntityType = 'lead' | 'property';
