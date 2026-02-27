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
exports.maxPaymentWebhook = exports.stripeWebhook = exports.ai = exports.whatsapp = exports.alerts = exports.catalogs = exports.leads = exports.properties = exports.tasks = exports.users = exports.agencies = void 0;
// Initialize Admin SDK first (order matters)
const v2_1 = require("firebase-functions/v2");
(0, v2_1.setGlobalOptions)({ region: 'europe-west1' });
require("./config/admin");
// ── Agencies Module ────────────────────────────────────────────────────────────
const onboarding_1 = require("./agencies/onboarding");
// ── Users Module ───────────────────────────────────────────────────────────────
const team_1 = require("./users/team");
// ── Tasks Module ───────────────────────────────────────────────────────────────
const cleanup_1 = require("./tasks/cleanup");
// ── Properties Module ──────────────────────────────────────────────────────────
const getLiveProperties_1 = require("./properties/getLiveProperties");
const addProperty_1 = require("./properties/addProperty");
const updateProperty_1 = require("./properties/updateProperty");
const deleteProperty_1 = require("./properties/deleteProperty");
const importProperty_1 = require("./properties/importProperty");
const geocode_1 = require("./properties/geocode");
const matchmaking_1 = require("./properties/matchmaking");
// ── Leads Module ──────────────────────────────────────────────────────────────
const webhookReceiveLead_1 = require("./leads/webhookReceiveLead");
const addLead_1 = require("./leads/addLead");
const updateLead_1 = require("./leads/updateLead");
const getLiveLeads_1 = require("./leads/getLiveLeads");
const matchPropertiesForLead_1 = require("./leads/matchPropertiesForLead");
// ── Catalogs Module ────────────────────────────────────────────────────────────
const sharing_1 = require("./catalogs/sharing");
// ── Alerts Module ──────────────────────────────────────────────────────────────
const triggers_1 = require("./alerts/triggers");
// ── WhatsApp Module ────────────────────────────────────────────────────────────
const whatsapp_1 = require("./whatsapp");
// ── AI Module ──────────────────────────────────────────────────────────────────
const agent_1 = require("./ai/agent");
const extractAiData_1 = require("./ai/extractAiData");
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
exports.agencies = { createAgencyAccount: onboarding_1.createAgencyAccount };
exports.users = { inviteAgent: team_1.inviteAgent, getInviteInfo: team_1.getInviteInfo, updateAgentRole: team_1.updateAgentRole, toggleAgentStatus: team_1.toggleAgentStatus, deleteAgent: team_1.deleteAgent, completeAgentSetup: team_1.completeAgentSetup };
exports.tasks = { cleanupTasksOnLeadDelete: cleanup_1.cleanupTasksOnLeadDelete, cleanupTasksOnPropertyDelete: cleanup_1.cleanupTasksOnPropertyDelete };
exports.properties = { getLiveProperties: getLiveProperties_1.getLiveProperties, addProperty: addProperty_1.addProperty, updateProperty: updateProperty_1.updateProperty, deleteProperty: deleteProperty_1.deleteProperty, importPropertyFromUrl: importProperty_1.importPropertyFromUrl, getCoordinates: geocode_1.getCoordinates, getAddressSuggestions: geocode_1.getAddressSuggestions, geocodeNewProperty: geocode_1.geocodeNewProperty, onPropertyCreatedMatchmaking: matchmaking_1.onPropertyCreatedMatchmaking };
exports.leads = { webhookReceiveLead: webhookReceiveLead_1.webhookReceiveLead, addLead: addLead_1.addLead, updateLead: updateLead_1.updateLead, getLiveLeads: getLiveLeads_1.getLiveLeads, matchPropertiesForLead: matchPropertiesForLead_1.matchPropertiesForLead };
exports.catalogs = { generateCatalog: sharing_1.generateCatalog };
exports.alerts = { triggerSystemAlert: triggers_1.triggerSystemAlert };
exports.whatsapp = { connectAgencyWhatsApp: whatsapp_1.connectAgencyWhatsApp, disconnectAgencyWhatsApp: whatsapp_1.disconnectAgencyWhatsApp, generateWhatsAppQR: whatsapp_1.generateWhatsAppQR, checkWhatsAppStatus: whatsapp_1.checkWhatsAppStatus, sendWhatsappMessage: whatsapp_1.sendWhatsappMessage, disconnectWhatsApp: whatsapp_1.disconnectWhatsApp, whatsappWebhook: whatsapp_1.whatsappWebhook };
exports.ai = { askAgencyAgent: agent_1.askAgencyAgent, extractAiData: extractAiData_1.extractAiData };
var stripeWebhook_1 = require("./stripeWebhook");
Object.defineProperty(exports, "stripeWebhook", { enumerable: true, get: function () { return stripeWebhook_1.stripeWebhookHandler; } });
var maxWebhook_1 = require("./maxWebhook");
Object.defineProperty(exports, "maxPaymentWebhook", { enumerable: true, get: function () { return maxWebhook_1.maxPaymentWebhook; } });
//# sourceMappingURL=index.js.map