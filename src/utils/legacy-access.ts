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

/** Hidden one-person plans: account holder only, unlimited visits (check in any day). */
export const INDIVIDUAL_UNLIMITED_70_PLAN_NAME = 'Individual Unlimited $70'
export const INDIVIDUAL_UNLIMITED_80_PLAN_NAME = 'Individual Unlimited $80'
export const INDIVIDUAL_UNLIMITED_90_PLAN_NAME = 'Individual Unlimited $90'

/** Hidden $80/mo plan: account holder only, 2 visit days per Mon-Sun week. */
export const TWICE_A_WEEK_PLAN_NAME = 'Twice a Week Membership'

/** Hidden $400/mo plan: account holder + 4 household members. */
export const FAMILY_OF_5_PLAN_NAME = 'Family of 5 Membership'

/**
 * Every hidden plan the code unlocks, in the order they're shown (3 per row on
 * desktop: the one-person unlimited plans first, then the rest).
 * To add another hidden plan: create the plan row (is_active = false) and add its name here.
 */
export const CODE_UNLOCKED_PLAN_NAMES = [
  INDIVIDUAL_UNLIMITED_70_PLAN_NAME,
  INDIVIDUAL_UNLIMITED_80_PLAN_NAME,
  INDIVIDUAL_UNLIMITED_90_PLAN_NAME,
  TWICE_A_WEEK_PLAN_NAME,
  LEGACY_PLAN_NAME,
  FAMILY_OF_5_PLAN_NAME,
] as const

/** How long the unlock lasts after the code is entered. */
export const LEGACY_ACCESS_MAX_AGE_SECONDS = 60 * 60
