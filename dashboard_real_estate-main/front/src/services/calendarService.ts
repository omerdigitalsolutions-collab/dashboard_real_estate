import { functions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';

/**
 * Retrieves the Google OAuth consent URL for the current user.
 */
export const getCalendarAuthUrl = async () => {
    try {
        const getUrlFn = httpsCallable<void, { url: string }>(functions, 'calendar-getAuthUrl');
        const result = await getUrlFn();
        return result.data.url;
    } catch (error) {
        console.error('Error fetching calendar auth URL:', error);
        throw error;
    }
};

/**
 * Fetches upcoming events from the user's primary Google Calendar.
 */
export const listCalendarEvents = async () => {
    try {
        const listEventsFn = httpsCallable<void, { success: boolean; events: any[] }>(functions, 'calendar-listEvents');
        const result = await listEventsFn();
        return result.data.events;
    } catch (error) {
        console.error('Error listing calendar events:', error);
        throw error;
    }
};

/**
 * Manually creates a Google Calendar event for a task.
 * @param taskId - The Firestore task ID
 */
export const createCalendarEvent = async (taskId: string) => {
    try {
        const createEventFn = httpsCallable<{ taskId: string }, { success: boolean; eventId?: string }>(functions, 'calendar-createEvent');
        const result = await createEventFn({ taskId });
        return result.data;
    } catch (error) {
        console.error('Error creating calendar event:', error);
        throw error;
    }
};

/**
 * Creates a generic Google Calendar event with a full payload.
 */
export const createEvent = async (payload: any) => {
    try {
        const createEventFn = httpsCallable<any, { success: boolean; eventId?: string }>(functions, 'calendar-createEvent');
        const result = await createEventFn(payload);
        return result.data;
    } catch (error) {
        console.error('Error creating calendar event:', error);
        throw error;
    }
};
