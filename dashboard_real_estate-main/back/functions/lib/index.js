"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInviteInfo = exports.webhookHomerSalesBot = exports.webhookWhatsAppAI = exports.calls = exports.maxPaymentWebhook = exports.stripeWebhook = exports.scheduled = exports.billing = exports.contracts = exports.deals = exports.superadmin = exports.automation = exports.calendar = exports.ai = exports.whatsapp = exports.alerts = exports.catalogs = exports.leads = exports.properties = exports.tasks = exports.distribution = exports.users = exports.agencies = void 0;
// Initialize Admin SDK first (order matters)
const v2_1 = require("firebase-functions/v2");
(0, v2_1.setGlobalOptions)({ region: 'europe-west1' });
require("./config/admin");
// ── Agencies Module ────────────────────────────────────────────────────────────
const onboarding_1 = require("./agencies/onboarding");
// ── Users Module ───────────────────────────────────────────────────────────────
const team_1 = require("./users/team");
const updateAgentAvailability_1 = require("./users/updateAgentAvailability");
// ── Distribution Module ────────────────────────────────────────────────────────
const distributeLead_1 = require("./distribution/distributeLead");
const distributeProperty_1 = require("./distribution/distributeProperty");
// ── Tasks Module ───────────────────────────────────────────────────────────────
const cleanup_1 = require("./tasks/cleanup");
// ── Properties Module ──────────────────────────────────────────────────────────
const getLiveProperties_1 = require("./properties/getLiveProperties");
const addProperty_1 = require("./properties/addProperty");
const updateProperty_1 = require("./properties/updateProperty");
const deleteProperty_1 = require("./properties/deleteProperty");
const geocode_1 = require("./properties/geocode");
const matchmaking_1 = require("./properties/matchmaking");
const processNaturalLanguageSearch_1 = require("./properties/processNaturalLanguageSearch");
const importPropertyFromUrl_1 = require("./properties/importPropertyFromUrl");
// ── Leads Module ──────────────────────────────────────────────────────────────
const webhookReceiveLead_1 = require("./leads/webhookReceiveLead");
const addLead_1 = require("./leads/addLead");
const updateLead_1 = require("./leads/updateLead");
const getLiveLeads_1 = require("./leads/getLiveLeads");
const matchPropertiesForLead_1 = require("./leads/matchPropertiesForLead");
// ── Catalogs Module ────────────────────────────────────────────────────────────
const sharing_1 = require("./catalogs/sharing");
const getLiveProperties_2 = require("./catalogs/getLiveProperties");
const onPropertyLiked_1 = require("./catalogs/onPropertyLiked");
// ── Alerts Module ──────────────────────────────────────────────────────────────
const triggers_1 = require("./alerts/triggers");
// ── WhatsApp Module ────────────────────────────────────────────────────────────
const whatsapp_1 = require("./whatsapp");
// ── AI Module ──────────────────────────────────────────────────────────────────
const agent_1 = require("./ai/agent");
const extractAiData_1 = require("./ai/extractAiData");
const copilot_1 = require("./ai/copilot");
const textToAction_1 = require("./ai/textToAction");
const homerChatBot_1 = require("./ai/homerChatBot");
const parseContractText_1 = require("./ai/parseContractText");
// ── Calendar Module ────────────────────────────────────────────────────────────
const calendar_1 = require("./calendar");
// ── Deals Module ──────────────────────────────────────────────────────────────
const addDeal_1 = require("./deals/addDeal");
const updateDeal_1 = require("./deals/updateDeal");
// ── Contracts Module ───────────────────────────────────────────────────────────
const signDeal_1 = require("./contracts/signDeal");
const notifyInstanceSigned_1 = require("./contracts/notifyInstanceSigned");
// ── Automation Module ──────────────────────────────────────────────────────────
const globalYad2Webhook_1 = require("./automation/globalYad2Webhook");
// ── Super Admin Module ─────────────────────────────────────────────────────────
const superadmin_1 = require("./superadmin");
const healAdmin_1 = require("./superadmin/healAdmin");
const setAgencyPlan_1 = require("./superadmin/setAgencyPlan");
const globalImport_1 = require("./admin/globalImport");
// ── Scheduled Jobs ─────────────────────────────────────────────────────────────
const checkTrialExpiry_1 = require("./scheduled/checkTrialExpiry");
const checkTrialExpiryAlerts_1 = require("./scheduled/checkTrialExpiryAlerts");
const weeklyFollowUp_1 = require("./scheduled/weeklyFollowUp");
const followUpCampaign_1 = require("./scheduled/followUpCampaign");
const syncCalendar_1 = require("./scheduled/syncCalendar");
// ── Billing / Subscriptions ────────────────────────────────────────────────────
const manual_requests_1 = require("./billing/manual_requests");
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
exports.agencies = { createAgencyAccount: onboarding_1.createAgencyAccount, checkPhoneAvailable: onboarding_1.checkPhoneAvailable, captureLead: onboarding_1.captureLead };
exports.users = { inviteAgent: team_1.inviteAgent, sendAgentInvite: team_1.sendAgentInvite, updateAgentRole: team_1.updateAgentRole, toggleAgentStatus: team_1.toggleAgentStatus, deleteAgent: team_1.deleteAgent, completeAgentSetup: team_1.completeAgentSetup, addAgentManually: team_1.addAgentManually, generateAgencyJoinCode: team_1.generateAgencyJoinCode, saveAgencyJoinCode: team_1.saveAgencyJoinCode, joinWithCode: team_1.joinWithCode, claimInviteToken: team_1.claimInviteToken, updateAgentAvailability: updateAgentAvailability_1.updateAgentAvailability };
exports.distribution = { distributeLead: distributeLead_1.distributeLead, distributeProperty: distributeProperty_1.distributeProperty };
exports.tasks = { cleanupTasksOnLeadDelete: cleanup_1.cleanupTasksOnLeadDelete, cleanupTasksOnPropertyDelete: cleanup_1.cleanupTasksOnPropertyDelete };
exports.properties = { getLiveProperties: getLiveProperties_1.getLiveProperties, addProperty: addProperty_1.addProperty, updateProperty: updateProperty_1.updateProperty, deleteProperty: deleteProperty_1.deleteProperty, getCoordinates: geocode_1.getCoordinates, getAddressSuggestions: geocode_1.getAddressSuggestions, getPlaceDetails: geocode_1.getPlaceDetails, geocodeNewProperty: geocode_1.geocodeNewProperty, onPropertyCreatedMatchmaking: matchmaking_1.onPropertyCreatedMatchmaking, onGlobalPropertyCreatedMatchmaking: matchmaking_1.onGlobalPropertyCreatedMatchmaking, onWhatsappPropertyCreatedMatchmaking: matchmaking_1.onWhatsappPropertyCreatedMatchmaking, processNaturalLanguageSearch: processNaturalLanguageSearch_1.processNaturalLanguageSearch, importPropertyFromUrl: importPropertyFromUrl_1.importPropertyFromUrl };
exports.leads = { webhookReceiveLead: webhookReceiveLead_1.webhookReceiveLead, addLead: addLead_1.addLead, updateLead: updateLead_1.updateLead, getLiveLeads: getLiveLeads_1.getLiveLeads, matchPropertiesForLead: matchPropertiesForLead_1.matchPropertiesForLead };
exports.catalogs = { generateCatalog: sharing_1.generateCatalog, updateCatalog: sharing_1.updateCatalog, getLiveProperties: getLiveProperties_2.getLiveProperties, onPropertyLiked: onPropertyLiked_1.onPropertyLiked };
exports.alerts = { triggerSystemAlert: triggers_1.triggerSystemAlert };
exports.whatsapp = { connectAgencyWhatsApp: whatsapp_1.connectAgencyWhatsApp, disconnectAgencyWhatsApp: whatsapp_1.disconnectAgencyWhatsApp, generateWhatsAppQR: whatsapp_1.generateWhatsAppQR, checkWhatsAppStatus: whatsapp_1.checkWhatsAppStatus, sendWhatsappMessage: whatsapp_1.sendWhatsappMessage, syncLeadChat: whatsapp_1.syncLeadChat, getGroups: whatsapp_1.getGroups, disconnectWhatsApp: whatsapp_1.disconnectWhatsApp };
exports.ai = { askAgencyAgent: agent_1.askAgencyAgent, extractAiData: extractAiData_1.extractAiData, askCopilot: copilot_1.askCopilot, getSmartInsights: copilot_1.getSmartInsights, textToActionAgent: textToAction_1.textToActionAgent, homerChatBot: homerChatBot_1.homerChatBot, parseContractText: parseContractText_1.parseContractText };
exports.calendar = { getAuthUrl: calendar_1.getAuthUrl, handleOAuthCallback: calendar_1.handleOAuthCallback, createEvent: calendar_1.createEvent, deleteEvent: calendar_1.deleteEvent, disconnect: calendar_1.disconnect, listEvents: calendar_1.listEvents };
exports.automation = { webhookProcessGlobalYad2Email: globalYad2Webhook_1.webhookProcessGlobalYad2Email };
exports.superadmin = {
    superAdminUpdateExpenses: superadmin_1.superAdminUpdateExpenses,
    superAdminGetDashboardStats: superadmin_1.superAdminGetDashboardStats,
    setupSuperAdmin: superadmin_1.setupSuperAdmin,
    superAdminImportGlobalPropertiesV2: globalImport_1.superAdminImportGlobalPropertiesV2,
    superAdminGetImportMappingV2: globalImport_1.superAdminGetImportMappingV2,
    superAdminGetAgencyUsage: superadmin_1.superAdminGetAgencyUsage,
    superAdminUpdateAgencyPlan: superadmin_1.superAdminUpdateAgencyPlan,
    superAdminReactivateBilling: superadmin_1.superAdminReactivateBilling,
    superAdminSetPlan: setAgencyPlan_1.superAdminSetPlan,
    superAdminListAuthUsers: superadmin_1.superAdminListAuthUsers,
    superAdminSetAgencyStatus: superadmin_1.superAdminSetAgencyStatus,
    superAdminSetUserStatus: superadmin_1.superAdminSetUserStatus,
    superAdminApproveAgency: superadmin_1.superAdminApproveAgency,
    superAdminHealSelf: healAdmin_1.superAdminHealSelf,
    superAdminConsolidateCityV2: globalImport_1.superAdminConsolidateCityV2,
    superAdminPurgeOldGlobalPropertiesV2: globalImport_1.superAdminPurgeOldGlobalPropertiesV2,
    superAdminCleanExistingDescriptionsV2: globalImport_1.superAdminCleanExistingDescriptionsV2
};
exports.deals = { addDeal: addDeal_1.addDeal, updateDeal: updateDeal_1.updateDeal, deleteDeal: updateDeal_1.deleteDeal };
exports.contracts = { signDeal: signDeal_1.signDeal, onContractInstanceSigned: notifyInstanceSigned_1.onContractInstanceSigned };
exports.billing = { onSubscriptionRequestCreated: manual_requests_1.onSubscriptionRequestCreated, onNewAgencyRegistered: manual_requests_1.onNewAgencyRegistered };
exports.scheduled = { checkTrialExpiry: checkTrialExpiry_1.checkTrialExpiry, checkTrialExpiryAlerts: checkTrialExpiryAlerts_1.checkTrialExpiryAlerts, weeklyFollowUp: weeklyFollowUp_1.weeklyFollowUp, followUpCampaign: followUpCampaign_1.followUpCampaign, syncCalendar: syncCalendar_1.syncCalendar };
var stripeWebhook_1 = require("./stripeWebhook");
Object.defineProperty(exports, "stripeWebhook", { enumerable: true, get: function () { return stripeWebhook_1.stripeWebhookHandler; } });
var maxWebhook_1 = require("./maxWebhook");
Object.defineProperty(exports, "maxPaymentWebhook", { enumerable: true, get: function () { return maxWebhook_1.maxPaymentWebhook; } });
// ── Calls Module ──────────────────────────────────────────────────────────────
const twilioVoiceInbound_1 = require("./calls/twilioVoiceInbound");
const twilioRecordingComplete_1 = require("./calls/twilioRecordingComplete");
const twilioStatusCallback_1 = require("./calls/twilioStatusCallback");
const purchaseVirtualNumber_1 = require("./calls/purchaseVirtualNumber");
exports.calls = { twilioVoiceInbound: twilioVoiceInbound_1.twilioVoiceInbound, twilioRecordingComplete: twilioRecordingComplete_1.twilioRecordingComplete, twilioStatusCallback: twilioStatusCallback_1.twilioStatusCallback, purchaseVirtualNumber: purchaseVirtualNumber_1.purchaseVirtualNumber };
// ── AI WhatsApp Bot ────────────────────────────────────────────────────────────
// Top-level export so the URL is clean (no namespace prefix):
//   https://europe-west1-<project-id>.cloudfunctions.net/webhookWhatsAppAI
var webhookWhatsAppAI_1 = require("./webhookWhatsAppAI");
Object.defineProperty(exports, "webhookWhatsAppAI", { enumerable: true, get: function () { return webhookWhatsAppAI_1.webhookWhatsAppAI; } });
// ── Homer Sales Bot ────────────────────────────────────────────────────────────
// Top-level export for Homer's own sales bot webhook:
//   https://europe-west1-<project-id>.cloudfunctions.net/webhookHomerSalesBot
var webhookHomerSalesBot_1 = require("./sales/webhookHomerSalesBot");
Object.defineProperty(exports, "webhookHomerSalesBot", { enumerable: true, get: function () { return webhookHomerSalesBot_1.webhookHomerSalesBot; } });
// ── Public Invite Info ────────────────────────────────────────────────────────
// Top-level export to avoid hyphenated routing issues in v2
var team_2 = require("./users/team");
Object.defineProperty(exports, "getInviteInfo", { enumerable: true, get: function () { return team_2.getInviteInfo; } });
//# sourceMappingURL=index.js.map