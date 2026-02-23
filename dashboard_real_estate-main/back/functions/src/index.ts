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
import './config/admin';

// ── Agencies Module ────────────────────────────────────────────────────────────
import { createAgencyAccount } from './agencies/onboarding';

// ── Users Module ───────────────────────────────────────────────────────────────
import { inviteAgent, getInviteInfo, updateAgentRole, toggleAgentStatus, completeAgentSetup } from './users/team';

// ── Tasks Module ───────────────────────────────────────────────────────────────
import { cleanupTasksOnLeadDelete, cleanupTasksOnPropertyDelete } from './tasks/cleanup';

// ── Properties Module ──────────────────────────────────────────────────────────
import { getLiveProperties } from './properties/getLiveProperties';
import { addProperty } from './properties/addProperty';
import { updateProperty } from './properties/updateProperty';
import { deleteProperty } from './properties/deleteProperty';
import { importPropertyFromUrl } from './properties/importProperty';
import { getCoordinates, getAddressSuggestions } from './properties/geocode';

// ── Leads Module ──────────────────────────────────────────────────────────────
import { webhookReceiveLead } from './leads/webhookReceiveLead';
import { addLead } from './leads/addLead';
import { updateLead } from './leads/updateLead';
import { getLiveLeads } from './leads/getLiveLeads';
import { matchPropertiesForLead } from './leads/matchPropertiesForLead';

// ── Catalogs Module ────────────────────────────────────────────────────────────
import { generateCatalog } from './catalogs/sharing';

// ── Alerts Module ──────────────────────────────────────────────────────────────
import { triggerSystemAlert } from './alerts/triggers';

// ── WhatsApp Module ────────────────────────────────────────────────────────────
import { getWhatsAppQrCode, whatsappWebhook } from './whatsapp';

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
export const agencies = { createAgencyAccount };
export const users = { inviteAgent, getInviteInfo, updateAgentRole, toggleAgentStatus, completeAgentSetup };
export const tasks = { cleanupTasksOnLeadDelete, cleanupTasksOnPropertyDelete };
export const properties = { getLiveProperties, addProperty, updateProperty, deleteProperty, importPropertyFromUrl, getCoordinates, getAddressSuggestions };
export const leads = { webhookReceiveLead, addLead, updateLead, getLiveLeads, matchPropertiesForLead };
export const catalogs = { generateCatalog };
export const alerts = { triggerSystemAlert };
export const whatsapp = { getWhatsAppQrCode, whatsappWebhook };
