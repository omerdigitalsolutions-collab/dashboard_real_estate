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
exports.whatsapp = exports.alerts = exports.catalogs = exports.leads = exports.properties = exports.tasks = exports.users = exports.agencies = void 0;
// Initialize Admin SDK first (order matters)
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
// ── Exports ───────────────────────────────────────────────────────────────────────────────────
// Clean function names produced:
//   agencies-createAgencyAccount
//   users-inviteAgent  |  users-getInviteInfo  |  users-updateAgentRole
//   users-toggleAgentStatus  |  users-completeAgentSetup
//   properties-getLiveProperties  |  properties-addProperty
//   properties-updateProperty  |  properties-deleteProperty
//   leads-webhookReceiveLead  |  leads-addLead
//   leads-updateLead  |  leads-getLiveLeads  |  leads-matchPropertiesForLead
//   catalogs-generateCatalog
exports.agencies = { createAgencyAccount: onboarding_1.createAgencyAccount };
exports.users = { inviteAgent: team_1.inviteAgent, getInviteInfo: team_1.getInviteInfo, updateAgentRole: team_1.updateAgentRole, toggleAgentStatus: team_1.toggleAgentStatus, completeAgentSetup: team_1.completeAgentSetup };
exports.tasks = { cleanupTasksOnLeadDelete: cleanup_1.cleanupTasksOnLeadDelete, cleanupTasksOnPropertyDelete: cleanup_1.cleanupTasksOnPropertyDelete };
exports.properties = { getLiveProperties: getLiveProperties_1.getLiveProperties, addProperty: addProperty_1.addProperty, updateProperty: updateProperty_1.updateProperty, deleteProperty: deleteProperty_1.deleteProperty, importPropertyFromUrl: importProperty_1.importPropertyFromUrl, getCoordinates: geocode_1.getCoordinates, getAddressSuggestions: geocode_1.getAddressSuggestions };
exports.leads = { webhookReceiveLead: webhookReceiveLead_1.webhookReceiveLead, addLead: addLead_1.addLead, updateLead: updateLead_1.updateLead, getLiveLeads: getLiveLeads_1.getLiveLeads, matchPropertiesForLead: matchPropertiesForLead_1.matchPropertiesForLead };
exports.catalogs = { generateCatalog: sharing_1.generateCatalog };
exports.alerts = { triggerSystemAlert: triggers_1.triggerSystemAlert };
exports.whatsapp = { getWhatsAppQrCode: whatsapp_1.getWhatsAppQrCode, whatsappWebhook: whatsapp_1.whatsappWebhook };
//# sourceMappingURL=index.js.map