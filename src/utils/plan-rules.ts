/**
 * Membership plan rules shared by the check-in scanner and the staff User's Guide,
 * so what the guide tells staff always matches what the scanner does.
 */

export interface PlanLimits {
  max_daily_checkins: number | null
  max_dependents: number | null
}

/**
 * How many different people from one household a plan lets in per day.
 * An explicit max_daily_checkins wins; otherwise the account holder plus
 * max_dependents. null means no daily limit.
 */
export function effectiveDailyLimit(plan: PlanLimits | null | undefined): number | null {
  return plan?.max_daily_checkins ?? (plan?.max_dependents != null ? plan.max_dependents + 1 : null)
}
