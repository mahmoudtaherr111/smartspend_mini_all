/** The outcome of one knowledge rule. `violations` is empty when the rule holds. */
export interface RuleResult {
  /** Stable identifier used in test names, hook output and agent reports. */
  id: string;
  /** What the rule protects, in one sentence. */
  title: string;
  /** How to fix a violation. */
  fix: string;
  violations: string[];
}
