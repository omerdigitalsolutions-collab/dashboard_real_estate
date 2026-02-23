import { collection, doc, setDoc, Timestamp, addDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

export const seedInitialData = async (adminUid: string) => {
    try {
        const agencyId = 'agency_omer_01';

        console.log('🌱 Starting database seed...');

        // 1. Create Agency
        await setDoc(doc(db, 'agencies', agencyId), {
            agencyId,
            name: 'Omer Digital Solutions',
            subscriptionTier: 'pro',
            createdAt: Timestamp.now(),
        });
        console.log('✅ Agency created');

        // 2. Create Admin User
        await setDoc(doc(db, 'users', adminUid), {
            uid: adminUid,
            agencyId,
            name: 'עומר אסיס',
            role: 'admin',
            email: 'admin@omerdigital.co.il',
            phone: '054-1234567',
        });
        console.log('✅ Admin user created');

        // 3. Create Properties
        const propertiesRef = collection(db, 'properties');
        const propertyDocs = await Promise.all([
            addDoc(propertiesRef, {
                agencyId,
                agentId: adminUid,
                address: 'רוטשילד 22, תל אביב',
                type: 'sale',
                price: 4500000,
                status: 'active',
                daysOnMarket: 14,
                exclusivityEndDate: Timestamp.fromDate(new Date('2026-05-01')),
                lat: 32.0637,
                lng: 34.7745,
            }),
            addDoc(propertiesRef, {
                agencyId,
                agentId: adminUid,
                address: 'הנשיא 15, הרצליה',
                type: 'sale',
                price: 8200000,
                status: 'active',
                daysOnMarket: 5,
                exclusivityEndDate: Timestamp.fromDate(new Date('2026-04-10')),
                lat: 32.1622,
                lng: 34.8454,
            }),
            addDoc(propertiesRef, {
                agencyId,
                agentId: adminUid,
                address: 'דיזנגוף 100, תל אביב',
                type: 'rent',
                price: 8500,
                status: 'active',
                daysOnMarket: 2,
                exclusivityEndDate: null,
                lat: 32.0823,
                lng: 34.7815,
            }),
        ]);
        console.log('✅ Properties created');

        // 4. Create Leads
        const leadsRef = collection(db, 'leads');
        const leadDocs = await Promise.all([
            addDoc(leadsRef, {
                agencyId,
                name: 'ישראל ישראלי',
                phone: '050-1112223',
                source: 'Facebook',
                assignedTo: adminUid,
                createdAt: Timestamp.now(),
            }),
            addDoc(leadsRef, {
                agencyId,
                name: 'שרה כהן',
                phone: '052-3334445',
                source: 'Yad2',
                assignedTo: adminUid,
                createdAt: Timestamp.now(),
            }),
            addDoc(leadsRef, {
                agencyId,
                name: 'דוד לוי',
                phone: '054-5556667',
                source: 'Google',
                assignedTo: adminUid,
                createdAt: Timestamp.now(),
            }),
            addDoc(leadsRef, {
                agencyId,
                name: 'רחל שפירא',
                phone: '053-7778889',
                source: 'Instagram',
                assignedTo: adminUid,
                createdAt: Timestamp.now(),
            }),
            addDoc(leadsRef, {
                agencyId,
                name: 'משה אברהם',
                phone: '058-9990001',
                source: 'Referral',
                assignedTo: adminUid,
                createdAt: Timestamp.now(),
            }),
        ]);
        console.log('✅ Leads created');

        // 5. Create Deals
        const dealsRef = collection(db, 'deals');
        await Promise.all([
            addDoc(dealsRef, {
                agencyId,
                propertyId: propertyDocs[0].id,
                leadId: leadDocs[0].id,
                agentId: adminUid,
                stage: 'tour',
                projectedCommission: 4500000 * 0.02,
                updatedAt: Timestamp.now(),
            }),
            addDoc(dealsRef, {
                agencyId,
                propertyId: propertyDocs[1].id,
                leadId: leadDocs[1].id,
                agentId: adminUid,
                stage: 'offer',
                projectedCommission: 8200000 * 0.02,
                updatedAt: Timestamp.now(),
            }),
            addDoc(dealsRef, {
                agencyId,
                propertyId: propertyDocs[0].id,
                leadId: leadDocs[2].id,
                agentId: adminUid,
                stage: 'contract',
                projectedCommission: 4500000 * 0.02,
                updatedAt: Timestamp.now(),
            }),
            addDoc(dealsRef, {
                agencyId,
                propertyId: propertyDocs[2].id,
                leadId: leadDocs[3].id,
                agentId: adminUid,
                stage: 'tour',
                projectedCommission: 8500,
                updatedAt: Timestamp.now(),
            }),
        ]);
        console.log('✅ Deals created');

        // 6. Create Tasks
        const tasksRef = collection(db, 'tasks');
        await Promise.all([
            addDoc(tasksRef, {
                agencyId,
                agentId: adminUid,
                title: 'לשלוח הסכם בלעדיות לישראל ישראלי',
                isCompleted: false,
                dueDate: Timestamp.fromDate(new Date('2026-02-21')),
                createdAt: Timestamp.now(),
            }),
            addDoc(tasksRef, {
                agencyId,
                agentId: adminUid,
                title: 'סיור נכס עם משפחת כהן - 14:00',
                isCompleted: false,
                dueDate: Timestamp.fromDate(new Date('2026-02-20')),
                createdAt: Timestamp.now(),
            }),
            addDoc(tasksRef, {
                agencyId,
                agentId: adminUid,
                title: 'לעדכן תמחור נכס ברחוב רוטשילד',
                isCompleted: true,
                dueDate: Timestamp.fromDate(new Date('2026-02-19')),
                createdAt: Timestamp.now(),
            }),
        ]);
        console.log('✅ Tasks created');

        // 7. Create Alerts
        const alertsRef = collection(db, 'alerts');
        await Promise.all([
            addDoc(alertsRef, {
                agencyId,
                targetAgentId: adminUid,
                message: '⚠️ הבלעדיות על נכס ברחוב הנשיא פגה עוד 3 ימים',
                type: 'warning',
                isRead: false,
                createdAt: Timestamp.now(),
            }),
            addDoc(alertsRef, {
                agencyId,
                targetAgentId: 'all',
                message: '🎉 ברוכים הבאים למערכת! כל הנתונים נטענו בהצלחה.',
                type: 'info',
                isRead: false,
                createdAt: Timestamp.now(),
            }),
        ]);
        console.log('✅ Alerts created');

        console.log('🎉 Database seeding completed successfully!');
        return { success: true, agencyId };
    } catch (error) {
        console.error('❌ Error seeding database:', error);
        return { success: false, error };
    }
};
