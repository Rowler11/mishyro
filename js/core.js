// Core entry point: every section imports from here (router, data layer,
// encryption, backup, seeding, theme, shared UI, security and helpers).
export * as util from './core/util.js';
export * as db from './core/db.js';
export * as cryptoBox from './core/crypto.js';
export * as backup from './core/backup.js';
export * as seed from './core/seed.js';
export * as router from './core/router.js';
export * as theme from './core/theme.js';
export * as ui from './core/ui.js';
export * as security from './core/security.js';
export * as profile from './core/profile.js';
export * as sync from './core/sync.js';
export { CONFIG } from './config.js';
