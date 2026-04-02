"use strict";
/**
 * ─── Calendar Module — Barrel Export ─────────────────────────────────────────
 *
 * Single import point for all Cloud Function handlers in the calendar module.
 * Import from this file in src/index.ts:
 *
 *   import { getAuthUrl, handleOAuthCallback, createEvent } from './calendar';
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUserTokens = exports.getUserTokens = exports.saveUserTokens = exports.getOAuthClient = exports.unlinkEventFromEntity = exports.linkEventToEntity = exports.createCalendarEvent = exports.disconnect = exports.listEvents = exports.createEvent = exports.handleOAuthCallback = exports.getAuthUrl = void 0;
var oauthHandlers_1 = require("./oauthHandlers");
Object.defineProperty(exports, "getAuthUrl", { enumerable: true, get: function () { return oauthHandlers_1.getAuthUrl; } });
Object.defineProperty(exports, "handleOAuthCallback", { enumerable: true, get: function () { return oauthHandlers_1.handleOAuthCallback; } });
var eventManager_1 = require("./eventManager");
Object.defineProperty(exports, "createEvent", { enumerable: true, get: function () { return eventManager_1.createEvent; } });
var listEvents_1 = require("./listEvents");
Object.defineProperty(exports, "listEvents", { enumerable: true, get: function () { return listEvents_1.listEvents; } });
var disconnect_1 = require("./disconnect");
Object.defineProperty(exports, "disconnect", { enumerable: true, get: function () { return disconnect_1.disconnect; } });
// ── Also export utility functions for use by other server-side modules ────────
var eventManager_2 = require("./eventManager");
Object.defineProperty(exports, "createCalendarEvent", { enumerable: true, get: function () { return eventManager_2.createCalendarEvent; } });
var entityLinker_1 = require("./entityLinker");
Object.defineProperty(exports, "linkEventToEntity", { enumerable: true, get: function () { return entityLinker_1.linkEventToEntity; } });
Object.defineProperty(exports, "unlinkEventFromEntity", { enumerable: true, get: function () { return entityLinker_1.unlinkEventFromEntity; } });
var oauthClient_1 = require("./oauthClient");
Object.defineProperty(exports, "getOAuthClient", { enumerable: true, get: function () { return oauthClient_1.getOAuthClient; } });
var tokenStore_1 = require("./tokenStore");
Object.defineProperty(exports, "saveUserTokens", { enumerable: true, get: function () { return tokenStore_1.saveUserTokens; } });
Object.defineProperty(exports, "getUserTokens", { enumerable: true, get: function () { return tokenStore_1.getUserTokens; } });
Object.defineProperty(exports, "deleteUserTokens", { enumerable: true, get: function () { return tokenStore_1.deleteUserTokens; } });
//# sourceMappingURL=index.js.map