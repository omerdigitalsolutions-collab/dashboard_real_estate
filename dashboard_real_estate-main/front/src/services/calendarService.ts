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
        const createEventFn = httpsCallable<{ taskId: string }, { success: boolean; eventId?: string; htmlLink?: string }>(functions, 'calendar-createEvent');
        const result = await createEventFn({ taskId });
        return result.data;
    } catch (error) {
        console.error('Error creating calendar event:', error);
        throw error;
    }
};

/**
 * Disconnects the Google Calendar integration for the current user.
 */
export const disconnectCalendar = async () => {
    try {
        const disconnectFn = httpsCallable<void, { success: boolean }>(functions, 'calendar-disconnect');
        const result = await disconnectFn();
        return result.data;
    } catch (error) {
        console.error('Error disconnecting calendar:', error);
        throw error;
    }
};

export const createEvent = async (payload: any) => {
    try {
        const createEventFn = httpsCallable<any, { success: boolean; eventId?: string; htmlLink?: string }>(functions, 'calendar-createEvent');
        const result = await createEventFn(payload);
        return result.data;
    } catch (error) {
        console.error('Error creating calendar event:', error);
        throw error;
    }
};

/**
 * Deletes a Google Calendar event and its CRM task via backend.
 * @param taskId - The Firestore task ID to delete.
 */
export const deleteCalendarEvent = async (taskId: string): Promise<boolean> => {
    try {
        const deleteEventCall = httpsCallable<{ taskId: string }, { success: boolean }>(functions, 'calendar-deleteEvent');
        const result = await deleteEventCall({ taskId });
        return result.data.success;
    } catch (error) {
        console.error('Error deleting calendar event:', error);
        throw error;
    }
};
