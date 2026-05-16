import { onSchedule } from 'firebase-functions/v2/scheduler';
import { Timestamp } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { chunkArray } from './propertyScrapeUtils';

const db = admin.firestore();

export const resetIsNew = onSchedule(
    {
        schedule: '30 5 * * *',
        timeZone: 'Asia/Jerusalem',
        region:   'europe-west1',
    },
    async () => {
        const cutoff = Timestamp.fromDate(new Date(Date.now() - 48 * 60 * 60 * 1000));

        const staleSnap = await db.collectionGroup('properties')
            .where('isNew', '==', true)
            .where('addedToHomerAt', '<', cutoff)
            .get();

        if (staleSnap.empty) {
            logger.info('[resetIsNew] nothing to reset');
            return;
        }

        for (const chunk of chunkArray(staleSnap.docs, 400)) {
            const batch = db.batch();
            for (const doc of chunk) {
                batch.update(doc.ref, { isNew: false });
            }
            await batch.commit();
        }

        logger.info(`[resetIsNew] cleared ${staleSnap.size} stale properties`);
    }
);
