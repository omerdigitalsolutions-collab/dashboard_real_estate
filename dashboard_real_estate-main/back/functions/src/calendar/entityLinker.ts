/**
 * ─── Calendar Module — Entity Linker ─────────────────────────────────────────
 *
 * Demonstrates the relational pattern for linking a Google Calendar event ID
 * back to a core CRM entity (Lead or Property) in Firestore.
 *
 * This module provides two writes per link:
 *
 *   1. Entity document gets a `calendarEventId` field so Calendar events are
 *      discoverable when loading a Lead or Property profile.
 *
 *   2. A dedicated `calendarLinks/{eventId}` document acts as a reverse lookup,
 *      allowing you to find the CRM record from a Calendar event ID (useful for
 *      webhook-driven updates from Google Calendar push notifications).
 *
 * Extend this module to support:
 *   - Multiple events per entity (use a subcollection: leads/{id}/calendarEvents)
 *   - Unlinking / event deletion
 *   - Syncing status changes back from Google Calendar to the entity
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { CalendarEntityType } from './types';

const db = getFirestore();

/**
 * Maps a CRM entity type to its corresponding Firestore collection name.
 */
const COLLECTION_MAP: Record<CalendarEntityType, string> = {
    lead: 'leads',
    property: 'properties',
};

/**
 * The Firestore collection used for reverse lookups (eventId → entity).
 */
const CALENDAR_LINKS_COLLECTION = 'calendarLinks';

// ── linkEventToEntity ─────────────────────────────────────────────────────────

/**
 * Links a Google Calendar event to a CRM entity (Lead or Property).
 *
 * Performs two atomic Firestore writes:
 *   - Sets `calendarEventId` on the entity document (forward link)
 *   - Creates a `calendarLinks/{eventId}` document (reverse lookup)
 *
 * @param entityType - The type of CRM entity ('lead' | 'property').
 * @param entityId   - The Firestore document ID of the entity.
 * @param eventId    - The Google Calendar event ID (returned by createCalendarEvent).
 *
 * Example usage (in leads module after scheduling a follow-up):
 * ```ts
 * const { eventId } = await createCalendarEvent(userId, payload);
 * await linkEventToEntity('lead', lead.id, eventId);
 * ```
 */
export async function linkEventToEntity(
    entityType: CalendarEntityType,
    entityId: string,
    eventId: string
): Promise<void> {
    const collection = COLLECTION_MAP[entityType];

    // ── Write 1: Forward link — stamp eventId onto the entity ────────────────
    const entityRef = db.collection(collection).doc(entityId);

    await entityRef.update({
        calendarEventId: eventId,
        calendarLinkedAt: FieldValue.serverTimestamp(),
    });

    // ── Write 2: Reverse lookup document ────────────────────────────────────
    const linkRef = db.collection(CALENDAR_LINKS_COLLECTION).doc(eventId);

    await linkRef.set({
        eventId,
        entityType,
        entityId,
        collection,
        linkedAt: FieldValue.serverTimestamp(),
    });

    console.info(
        `[calendar] Linked event ${eventId} → ${entityType} ${entityId} (collection: ${collection})`
    );
}

// ── unlinkEventFromEntity ─────────────────────────────────────────────────────

/**
 * Removes the Calendar event link from both the entity and the reverse lookup.
 * Call this when a Google Calendar event is cancelled or deleted.
 *
 * @param entityType - The type of CRM entity ('lead' | 'property').
 * @param entityId   - The Firestore document ID of the entity.
 * @param eventId    - The Google Calendar event ID to unlink.
 */
export async function unlinkEventFromEntity(
    entityType: CalendarEntityType,
    entityId: string,
    eventId: string
): Promise<void> {
    const collection = COLLECTION_MAP[entityType];

    const entityRef = db.collection(collection).doc(entityId);
    await entityRef.update({
        calendarEventId: FieldValue.delete(),
        calendarLinkedAt: FieldValue.delete(),
    });

    const linkRef = db.collection(CALENDAR_LINKS_COLLECTION).doc(eventId);
    await linkRef.delete();

    console.info(
        `[calendar] Unlinked event ${eventId} from ${entityType} ${entityId}`
    );
}
