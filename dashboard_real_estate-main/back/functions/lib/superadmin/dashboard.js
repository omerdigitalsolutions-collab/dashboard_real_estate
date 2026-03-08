"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.superAdminGetDashboardStats = void 0;
const functions = __importStar(require("firebase-functions/v2"));
const firestore_1 = require("firebase-admin/firestore");
exports.superAdminGetDashboardStats = functions.https.onCall({ cors: true }, async (request) => {
    // Auth: Must verify request.auth.token.superAdmin === true
    if (!request.auth || request.auth.token.superAdmin !== true) {
        throw new functions.https.HttpsError('permission-denied', 'Super Admin privileges required.');
    }
    const db = (0, firestore_1.getFirestore)();
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
            const fixed = (financesData === null || financesData === void 0 ? void 0 : financesData.fixedSubscriptions) || [];
            const variable = (financesData === null || financesData === void 0 ? void 0 : financesData.variableCosts) || [];
            const marketing = (financesData === null || financesData === void 0 ? void 0 : financesData.marketingCosts) || [];
            // 1. Sum all monthlyCost from fixedSubscriptions
            fixedSum = fixed.reduce((sum, item) => sum + (Number(item.monthlyCost) || 0), 0);
            // 2. Filter variableCosts for current month and sum
            variableSum = variable
                .filter((item) => item.month === currentMonthStr)
                .reduce((sum, item) => sum + (Number(item.cost) || 0), 0);
            // 3. Filter marketingCosts for current month and sum
            marketingSum = marketing
                .filter((item) => item.month === currentMonthStr)
                .reduce((sum, item) => sum + (Number(item.cost) || 0), 0);
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
    }
    catch (error) {
        console.error('[superAdminGetDashboardStats] Error:', error);
        throw new functions.https.HttpsError('internal', 'Error generating dashboard stats.');
    }
});
//# sourceMappingURL=dashboard.js.map