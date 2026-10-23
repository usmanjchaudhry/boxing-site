/**
 * Membership plan rules shared by the check-in scanner and the staff User's Guide,
 * so what the guide tells staff always matches what the scanner does.
 */

export interface PlanLimits {
  max_daily_checkins: number | null
  max_dependents: number | null
  /** Optional: only present once database/weekly_checkin_limit.sql has been run. */
  max_weekly_checkins?: number | null
}

/**
 * How many different people from one household a plan lets in per day.
 * An explicit max_daily_checkins wins; otherwise the account holder plus
 * max_dependents. null means no daily limit.
 */
export function effectiveDailyLimit(plan: PlanLimits | null | undefined): number | null {
  return plan?.max_daily_checkins ?? (plan?.max_dependents != null ? plan.max_dependents + 1 : null)
}

/**
 * How many different days per week (Monday to Sunday, gym time) EACH person on
 * the plan may check in. null = no weekly limit. Anything that isn't a whole
 * number from 1 to 7 is treated as no limit, so a bad value can't lock people out.
 */
export function weeklyVisitLimit(plan: Pick<PlanLimits, 'max_weekly_checkins'> | null | undefined): number | null {
  const n = plan?.max_weekly_checkins
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 7 ? n : null
}
