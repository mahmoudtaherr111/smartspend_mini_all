/** The outcome of one knowledge rule. `violations` is empty when the rule holds. */
export interface RuleResult {
  /** Stable identifier used in test names, hook output and agent reports. */
  id: string;
  /** What the rule protects, in one sentence. */
  title: string;
  /** How to fix a violation. */
  fix: string;
  violations: string[];
  /**
   * Problems the current change did not cause, such as a page another branch left unchecked on main. They are
   * reported without breaking the rule, so nobody is stopped by work that is not theirs.
   */
  notices?: string[];
}
