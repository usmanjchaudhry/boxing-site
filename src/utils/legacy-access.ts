/**
 * Legacy transfer access (the hidden $100/mo "Legacy Unlimited" plan for members
 * coming from the old gym).
 *
 * SERVER-ONLY: import this from server code only (server actions, server pages).
 * The staff User's Guide receives the code as a prop from the admin page, which
 * is gated to admin/staff, so it is never shipped inside a public JS bundle.
 */
export const LEGACY_ACCESS_CODE = 'deathbeforedishonor'

/** Name of the hidden plan the code unlocks. */
export const LEGACY_PLAN_NAME = 'Legacy Unlimited'

/** How long the unlock lasts after the code is entered. */
export const LEGACY_ACCESS_MAX_AGE_SECONDS = 60 * 60
