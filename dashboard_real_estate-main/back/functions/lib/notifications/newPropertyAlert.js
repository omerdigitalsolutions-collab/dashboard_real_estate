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
exports.newPropertyAlertSecrets = void 0;
exports.notifyNewProperty = notifyNewProperty;
const admin = __importStar(require("firebase-admin"));
const params_1 = require("firebase-functions/params");
const resend_1 = require("resend");
const whatsappService_1 = require("../whatsappService");
const resendApiKey = (0, params_1.defineSecret)('RESEND_API_KEY');
// Export secrets so Cloud Functions triggers can declare them
exports.newPropertyAlertSecrets = [resendApiKey];
const db = admin.firestore();
const SOURCE_LABEL = {
    whatsapp_group: 'קבוצת WhatsApp',
    yad2_alert: 'Yad2',
    madlan_alert: 'מדלן',
    manual: 'הוזן ידנית',
};
function buildMessage(property, matchCount) {
    var _a;
    const sourceLabel = (_a = SOURCE_LABEL[property.source]) !== null && _a !== void 0 ? _a : 'מקור חיצוני';
    const txType = property.transactionType || property.type;
    const typeLabel = txType === 'rent' ? 'להשכרה' : 'למכירה';
    const location = property.city || property.address || 'לא ידוע';
    const price = property.price ? `${property.price.toLocaleString('he-IL')}₪` : 'מחיר לא ידוע';
    const rooms = property.rooms ? `${property.rooms} חד׳` : '';
    const details = [typeLabel, rooms, price].filter(Boolean).join(', ');
    const matchLine = matchCount > 0
        ? `המערכת מצאה ${matchCount} לקוחות מתאימים.\n`
        : '';
    return (`🏠 נכס חדש (${sourceLabel}): ${details} ב${location}\n` +
        matchLine +
        `פרטים: https://app.homer-crm.co.il/dashboard/properties`);
}
function buildEmailHtml(property, matchCount, recipientName) {
    var _a;
    const sourceLabel = (_a = SOURCE_LABEL[property.source]) !== null && _a !== void 0 ? _a : 'מקור חיצוני';
    const txType2 = property.transactionType || property.type;
    const typeLabel = txType2 === 'rent' ? 'להשכרה' : 'למכירה';
    const location = property.city || property.address || 'לא ידוע';
    const price = property.price ? `${property.price.toLocaleString('he-IL')} ₪` : 'מחיר לא ידוע';
    const rooms = property.rooms ? `${property.rooms} חדרים` : '';
    return `
<div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px;">
  <h2 style="color: #1a3c5e;">🏠 נכס חדש נוסף למערכת</h2>
  ${recipientName ? `<p>שלום ${recipientName},</p>` : ''}
  ${matchCount > 0
        ? `<p>המערכת זיהתה נכס חדש שהגיע דרך <strong>${sourceLabel}</strong> ומצאה <strong>${matchCount} לקוחות מתאימים</strong>.</p>`
        : `<p>נכס חדש הגיע דרך <strong>${sourceLabel}</strong>.</p>`}
  <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
    <tr><td style="padding: 6px 12px; background: #f5f5f5; font-weight: bold;">עיר / מיקום</td><td style="padding: 6px 12px;">${location}</td></tr>
    <tr><td style="padding: 6px 12px; background: #f5f5f5; font-weight: bold;">סוג עסקה</td><td style="padding: 6px 12px;">${typeLabel}</td></tr>
    ${rooms ? `<tr><td style="padding: 6px 12px; background: #f5f5f5; font-weight: bold;">חדרים</td><td style="padding: 6px 12px;">${rooms}</td></tr>` : ''}
    <tr><td style="padding: 6px 12px; background: #f5f5f5; font-weight: bold;">מחיר</td><td style="padding: 6px 12px;">${price}</td></tr>
    <tr><td style="padding: 6px 12px; background: #f5f5f5; font-weight: bold;">מקור</td><td style="padding: 6px 12px;">${sourceLabel}</td></tr>
  </table>
  <a href="https://app.homer-crm.co.il/dashboard/properties"
     style="display: inline-block; padding: 10px 20px; background: #1a3c5e; color: #fff; text-decoration: none; border-radius: 6px; margin-top: 8px;">
    לצפייה בנכסים
  </a>
  <p style="margin-top: 24px; font-size: 12px; color: #888;">hOMER CRM — noreply@homer-crm.co.il</p>
</div>`;
}
const YAD2_MADLAN_SOURCES = new Set(['yad2_alert', 'madlan_alert']);
async function notifyNewProperty(params) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const { agencyId, property, matchedLeads } = params;
    const matchCount = matchedLeads.length;
    const isYad2OrMadlan = YAD2_MADLAN_SOURCES.has(property.source);
    if (matchCount === 0 && !isYad2OrMadlan)
        return;
    // Fetch agency doc
    let agencyData;
    try {
        const agencyDoc = await db.collection('agencies').doc(agencyId).get();
        if (!agencyDoc.exists)
            return;
        agencyData = agencyDoc.data();
    }
    catch (err) {
        console.error('[notifyNewProperty] Failed to fetch agency:', err);
        return;
    }
    const isFromGroupChat = property.source === 'whatsapp_group';
    const channels = {
        // Never send WhatsApp replies to contacts who sent group messages
        whatsapp: !isFromGroupChat && ((_b = (_a = agencyData.notifications) === null || _a === void 0 ? void 0 : _a.newPropertyChannels) === null || _b === void 0 ? void 0 : _b.whatsapp) !== false,
        email: ((_d = (_c = agencyData.notifications) === null || _c === void 0 ? void 0 : _c.newPropertyChannels) === null || _d === void 0 ? void 0 : _d.email) !== false,
    };
    const message = buildMessage(property, matchCount);
    // --- Collect recipients ---
    // Manager: from officePhone + admin user email
    const officePhone = agencyData.officePhone ||
        ((_e = agencyData.whatsappIntegration) === null || _e === void 0 ? void 0 : _e.phoneNumber) ||
        ((_f = agencyData.billing) === null || _f === void 0 ? void 0 : _f.ownerPhone);
    const overrideEmail = (_g = agencyData.notifications) === null || _g === void 0 ? void 0 : _g.contactEmail;
    let adminEmail = overrideEmail;
    let adminName;
    if (!adminEmail) {
        try {
            const adminSnap = await db.collection('users')
                .where('agencyId', '==', agencyId)
                .where('role', '==', 'admin')
                .limit(1)
                .get();
            if (!adminSnap.empty) {
                const adminData = adminSnap.docs[0].data();
                adminEmail = adminData.email;
                adminName = adminData.displayName || adminData.name;
            }
        }
        catch (err) {
            console.error('[notifyNewProperty] Failed to fetch admin user:', err);
        }
    }
    // Unique agent IDs to notify (exclude undefined / 'all')
    const agentIds = [...new Set(matchedLeads
            .map(l => l.assignedAgentId)
            .filter((id) => !!id && id !== 'all'))];
    const agentInfos = [];
    if (agentIds.length > 0) {
        try {
            const agentDocs = await Promise.all(agentIds.map(id => db.collection('users').doc(id).get()));
            for (const doc of agentDocs) {
                if (doc.exists) {
                    const d = doc.data();
                    agentInfos.push({ phone: d.phone, email: d.email, name: d.displayName || d.name });
                }
            }
        }
        catch (err) {
            console.error('[notifyNewProperty] Failed to fetch agent users:', err);
        }
    }
    const integration = ((_h = agencyData.whatsappIntegration) === null || _h === void 0 ? void 0 : _h.isConnected)
        ? agencyData.whatsappIntegration
        : undefined;
    // --- Send WhatsApp ---
    if (channels.whatsapp && integration) {
        const phones = [officePhone, ...agentInfos.map(a => a.phone)].filter((p) => !!p);
        await Promise.all(phones.map(phone => (0, whatsappService_1.sendWhatsAppMessage)(integration, phone, message)
            .then(ok => console.log(`[notify WA] ${phone} → ${ok ? 'ok' : 'failed'}`))
            .catch(err => console.error('[notify WA] error:', err))));
    }
    else if (channels.whatsapp && !integration) {
        console.warn(`[notifyNewProperty] WhatsApp channel enabled but agency ${agencyId} has no active integration.`);
    }
    // --- Send Email ---
    if (channels.email) {
        const apiKey = resendApiKey.value();
        if (apiKey) {
            const resend = new resend_1.Resend(apiKey);
            const emailTargets = [];
            if (adminEmail)
                emailTargets.push({ email: adminEmail, name: adminName });
            // For group-sourced properties only notify admin, not agents
            if (!isFromGroupChat) {
                agentInfos.forEach(a => { if (a.email)
                    emailTargets.push({ email: a.email, name: a.name }); });
            }
            // Dedupe by email address
            const seen = new Set();
            const uniqueTargets = emailTargets.filter(t => {
                if (seen.has(t.email))
                    return false;
                seen.add(t.email);
                return true;
            });
            await Promise.all(uniqueTargets.map(target => {
                var _a;
                return resend.emails.send({
                    from: 'hOMER CRM <noreply@homer-crm.co.il>',
                    to: target.email,
                    subject: matchCount > 0
                        ? `🏠 נכס חדש נוסף — ${matchCount} לקוחות מתאימים`
                        : `🏠 נכס חדש נוסף מ${(_a = SOURCE_LABEL[property.source]) !== null && _a !== void 0 ? _a : property.source}`,
                    html: buildEmailHtml(property, matchCount, target.name),
                })
                    .then(() => console.log(`[notify Email] sent to ${target.email}`))
                    .catch(err => console.error(`[notify Email] failed for ${target.email}:`, err));
            }));
        }
        else {
            console.warn('[notifyNewProperty] RESEND_API_KEY not set — email skipped.');
        }
    }
}
//# sourceMappingURL=newPropertyAlert.js.map