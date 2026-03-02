import * as functions from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

export const superAdminGetDashboardStats = functions.https.onCall(async (request) => {
    // Auth: Must verify request.auth.token.superAdmin === true
    if (!request.auth || request.auth.token.superAdmin !== true) {
        throw new functions.https.HttpsError('permission-denied', 'Super Admin privileges required.');
    }

    const db = getFirestore();

    try {
        // Build base stats queries
        const [agenciesSnap, usersSnap, financesDoc] = await Promise.all([
            db.collection('agencies').get(),
            db.collection('users').get(),
            db.collection('admin_settings').doc('finances').get()
        ]);

        const totalAgencies = agenciesSnap.size;
        const totalUsers = usersSnap.size;
        const activeAgencies = agenciesSnap.docs.filter((doc) => doc.data().status === 'active').length;

        // Calculate Current Month Expenses
        let fixedSum = 0;
        let variableSum = 0;
        let marketingSum = 0;
        let totalExpenses = 0;

        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const currentMonthStr = `${yyyy}-${mm}`; // YYYY-MM

        if (financesDoc.exists) {
            const financesData = financesDoc.data();
            const fixed = financesData?.fixedSubscriptions || [];
            const variable = financesData?.variableCosts || [];
            const marketing = financesData?.marketingCosts || [];

            // 1. Sum all monthlyCost from fixedSubscriptions
            fixedSum = fixed.reduce((sum: number, item: any) => sum + (Number(item.monthlyCost) || 0), 0);

            // 2. Filter variableCosts for current month and sum
            variableSum = variable
                .filter((item: any) => item.month === currentMonthStr)
                .reduce((sum: number, item: any) => sum + (Number(item.cost) || 0), 0);

            // 3. Filter marketingCosts for current month and sum
            marketingSum = marketing
                .filter((item: any) => item.month === currentMonthStr)
                .reduce((sum: number, item: any) => sum + (Number(item.cost) || 0), 0);

            // 4. Total Expenses
            totalExpenses = fixedSum + variableSum + marketingSum;
        }

        // Return compiled stats
        return {
            success: true,
            data: {
                totalAgencies,
                activeAgencies,
                totalUsers,
                totals: {
                    expenses: {
                        fixed: fixedSum,
                        variable: variableSum,
                        marketing: marketingSum,
                        total: totalExpenses
                    }
                }
            }
        };

    } catch (error: any) {
        console.error('[superAdminGetDashboardStats] Error:', error);
        throw new functions.https.HttpsError('internal', 'Error generating dashboard stats.');
    }
});
