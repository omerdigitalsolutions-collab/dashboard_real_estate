/**
 * ─── Firebase Cloud Functions — Central Export ────────────────────────────────
 *
 * This file is the single entry-point for all deployable Cloud Functions.
 * The Admin SDK MUST be initialized before any module that uses it is imported.
 *
 * Deployment namespacing follows Firestore collection boundaries:
 *   - agencies.*   → agency-level operations
 *   - users.*      → user / team operations
 */

// Initialize Admin SDK first (order matters)
import { setGlobalOptions } from 'firebase-functions/v2';
setGlobalOptions({ region: 'europe-west1' });
import './config/admin';

// ── Agencies Module ────────────────────────────────────────────────────────────
import { createAgencyAccount, checkPhoneAvailable, captureLead } from './agencies/onboarding';

// ── Users Module ───────────────────────────────────────────────────────────────
import { inviteAgent, sendAgentInvite, getInviteInfo, updateAgentRole, toggleAgentStatus, deleteAgent, completeAgentSetup, addAgentManually, generateAgencyJoinCode, saveAgencyJoinCode, joinWithCode, claimInviteToken } from './users/team';
import { updateAgentAvailability } from './users/updateAgentAvailability';

// ── Distribution Module ────────────────────────────────────────────────────────
import { distributeLead } from './distribution/distributeLead';
import { distributeProperty } from './distribution/distributeProperty';

// ── Tasks Module ───────────────────────────────────────────────────────────────
import { cleanupTasksOnLeadDelete, cleanupTasksOnPropertyDelete } from './tasks/cleanup';

// ── Properties Module ──────────────────────────────────────────────────────────
import { getLiveProperties } from './properties/getLiveProperties';
import { addProperty } from './properties/addProperty';
import { updateProperty } from './properties/updateProperty';
import { deleteProperty } from './properties/deleteProperty';
import { getCoordinates, getAddressSuggestions, getPlaceDetails, geocodeNewProperty } from './properties/geocode';
import { onPropertyCreatedMatchmaking, onGlobalPropertyCreatedMatchmaking, onWhatsappPropertyCreatedMatchmaking } from './properties/matchmaking';
import { processNaturalLanguageSearch } from './properties/processNaturalLanguageSearch';
import { importPropertyFromUrl } from './properties/importPropertyFromUrl';

// ── Leads Module ──────────────────────────────────────────────────────────────
import { webhookReceiveLead } from './leads/webhookReceiveLead';
import { addLead } from './leads/addLead';
import { updateLead } from './leads/updateLead';
import { getLiveLeads } from './leads/getLiveLeads';
import { matchPropertiesForLead } from './leads/matchPropertiesForLead';

// ── Catalogs Module ────────────────────────────────────────────────────────────
import { generateCatalog, updateCatalog as updateCatalogCF } from './catalogs/sharing';
import { getLiveProperties as catalogsGetLiveProperties } from './catalogs/getLiveProperties';
import { onPropertyLiked } from './catalogs/onPropertyLiked';

// ── Alerts Module ──────────────────────────────────────────────────────────────
import { triggerSystemAlert } from './alerts/triggers';

// ── WhatsApp Module ────────────────────────────────────────────────────────────
import { connectAgencyWhatsApp, disconnectAgencyWhatsApp, generateWhatsAppQR, checkWhatsAppStatus, sendWhatsappMessage, getGroups, disconnectWhatsApp, syncLeadChat } from './whatsapp';

// ── AI Module ──────────────────────────────────────────────────────────────────
import { askAgencyAgent } from './ai/agent';
import { extractAiData } from './ai/extractAiData';
import { askCopilot, getSmartInsights } from './ai/copilot';
import { textToActionAgent } from './ai/textToAction';
import { homerChatBot } from './ai/homerChatBot';
import { parseContractText } from './ai/parseContractText';

// ── Calendar Module ────────────────────────────────────────────────────────────
import { getAuthUrl, handleOAuthCallback, createEvent, deleteEvent, disconnect, listEvents } from './calendar';

// ── Deals Module ──────────────────────────────────────────────────────────────
import { addDeal } from './deals/addDeal';
import { updateDeal, deleteDeal } from './deals/updateDeal';

// ── Contracts Module ───────────────────────────────────────────────────────────
import { signDeal } from './contracts/signDeal';
import { onContractInstanceSigned } from './contracts/notifyInstanceSigned';

// ── Automation Module ──────────────────────────────────────────────────────────
import { webhookProcessGlobalYad2Email } from './automation/globalYad2Webhook';

// ── Super Admin Module ─────────────────────────────────────────────────────────
import { 
    superAdminUpdateExpenses, 
    superAdminGetDashboardStats, 
    setupSuperAdmin, 
    superAdminGetAgencyUsage, 
    superAdminUpdateAgencyPlan, 
    superAdminReactivateBilling,
    superAdminListAuthUsers, 
    superAdminSetAgencyStatus, 
    superAdminSetUserStatus, 
    superAdminApproveAgency 
} from './superadmin';
import { superAdminHealSelf } from './superadmin/healAdmin';
import { superAdminSetPlan } from './superadmin/setAgencyPlan';
import { superAdminImportGlobalPropertiesV2, superAdminGetImportMappingV2, superAdminConsolidateCityV2, superAdminPurgeOldGlobalPropertiesV2, superAdminCleanExistingDescriptionsV2 } from './admin/globalImport';

// ── Scheduled Jobs ─────────────────────────────────────────────────────────────
import { checkTrialExpiry } from './scheduled/checkTrialExpiry';
import { checkTrialExpiryAlerts } from './scheduled/checkTrialExpiryAlerts';
import { weeklyFollowUp } from './scheduled/weeklyFollowUp';
import { followUpCampaign } from './scheduled/followUpCampaign';
import { syncCalendar } from './scheduled/syncCalendar';

// ── Billing / Subscriptions ────────────────────────────────────────────────────
import { onSubscriptionRequestCreated, onNewAgencyRegistered } from './billing/manual_requests';

// ── Exports ───────────────────────────────────────────────────────────────────────────────────
// Clean function names produced:
//   agencies-createAgencyAccount
//   users-inviteAgent  |  users-getInviteInfo  |  users-updateAgentRole
//   users-toggleAgentStatus  |  users-completeAgentSetup | users-deleteAgent
//   properties-getLiveProperties  |  properties-addProperty
//   properties-updateProperty  |  properties-deleteProperty  |  properties-geocodeNewProperty
//   leads-webhookReceiveLead  |  leads-addLead
//   leads-updateLead  |  leads-getLiveLeads  |  leads-matchPropertiesForLead
//   catalogs-generateCatalog
//   calendar-getAuthUrl  |  calendar-handleOAuthCallback  |  calendar-createEvent
export const agencies = { createAgencyAccount, checkPhoneAvailable, captureLead };
export const users = { inviteAgent, sendAgentInvite, updateAgentRole, toggleAgentStatus, deleteAgent, completeAgentSetup, addAgentManually, generateAgencyJoinCode, saveAgencyJoinCode, joinWithCode, claimInviteToken, updateAgentAvailability };
export const distribution = { distributeLead, distributeProperty };
export const tasks = { cleanupTasksOnLeadDelete, cleanupTasksOnPropertyDelete };
export const properties = { getLiveProperties, addProperty, updateProperty, deleteProperty, getCoordinates, getAddressSuggestions, getPlaceDetails, geocodeNewProperty, onPropertyCreatedMatchmaking, onGlobalPropertyCreatedMatchmaking, onWhatsappPropertyCreatedMatchmaking, processNaturalLanguageSearch, importPropertyFromUrl };
export const leads = { webhookReceiveLead, addLead, updateLead, getLiveLeads, matchPropertiesForLead };
export const catalogs = { generateCatalog, updateCatalog: updateCatalogCF, getLiveProperties: catalogsGetLiveProperties, onPropertyLiked };
export const alerts = { triggerSystemAlert };
export const whatsapp = { connectAgencyWhatsApp, disconnectAgencyWhatsApp, generateWhatsAppQR, checkWhatsAppStatus, sendWhatsappMessage, syncLeadChat, getGroups, disconnectWhatsApp };
export const ai = { askAgencyAgent, extractAiData, askCopilot, getSmartInsights, textToActionAgent, homerChatBot, parseContractText };
export const calendar = { getAuthUrl, handleOAuthCallback, createEvent, deleteEvent, disconnect, listEvents };
export const automation = { webhookProcessGlobalYad2Email };
export const superadmin = {
    superAdminUpdateExpenses,
    superAdminGetDashboardStats,
    setupSuperAdmin,
    superAdminImportGlobalPropertiesV2,
    superAdminGetImportMappingV2,
    superAdminGetAgencyUsage,
    superAdminUpdateAgencyPlan,
    superAdminReactivateBilling,
    superAdminSetPlan,
    superAdminListAuthUsers,
    superAdminSetAgencyStatus,
    superAdminSetUserStatus,
    superAdminApproveAgency,
    superAdminHealSelf,
    superAdminConsolidateCityV2,
    superAdminPurgeOldGlobalPropertiesV2,
    superAdminCleanExistingDescriptionsV2
};

export const deals = { addDeal, updateDeal, deleteDeal };

export const contracts = { signDeal, onContractInstanceSigned };

export const billing = { onSubscriptionRequestCreated, onNewAgencyRegistered };

export const scheduled = { checkTrialExpiry, checkTrialExpiryAlerts, weeklyFollowUp, followUpCampaign, syncCalendar };

export { stripeWebhookHandler as stripeWebhook } from './stripeWebhook';
export { maxPaymentWebhook } from './maxWebhook';

// ── Calls Module ──────────────────────────────────────────────────────────────
import { twilioVoiceInbound } from './calls/twilioVoiceInbound';
import { twilioRecordingComplete } from './calls/twilioRecordingComplete';
import { twilioStatusCallback } from './calls/twilioStatusCallback';
import { purchaseVirtualNumber } from './calls/purchaseVirtualNumber';

export const calls = { twilioVoiceInbound, twilioRecordingComplete, twilioStatusCallback, purchaseVirtualNumber };

// ── AI WhatsApp Bot ────────────────────────────────────────────────────────────
// Top-level export so the URL is clean (no namespace prefix):
//   https://europe-west1-<project-id>.cloudfunctions.net/webhookWhatsAppAI
export { webhookWhatsAppAI } from './webhookWhatsAppAI';

// ── Homer Sales Bot ────────────────────────────────────────────────────────────
// Top-level export for Homer's own sales bot webhook:
//   https://europe-west1-<project-id>.cloudfunctions.net/webhookHomerSalesBot
export { webhookHomerSalesBot } from './sales/webhookHomerSalesBot';

// ── Public Invite Info ────────────────────────────────────────────────────────
// Top-level export to avoid hyphenated routing issues in v2
export { getInviteInfo } from './users/team';
