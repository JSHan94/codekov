import {
  ACTIONS,
  CONDITION_SUBJECTS,
  OPERATORS,
  type Action,
  type ConditionSubject,
  type Operator,
  type Strategy,
} from "./strategyTypes";

const ACTION_SET = new Set<Action>(ACTIONS);
const SUBJECT_SET = new Set<ConditionSubject>(CONDITION_SUBJECTS);
const OPERATOR_SET = new Set<Operator>(OPERATORS);

export function validateStrategy(strategy: Strategy): string | null {
  if (!strategy.name.trim() || strategy.name.length > 64) {
    return "Strategy name must be 1-64 characters";
  }

  if (!ACTION_SET.has(strategy.fallbackAction)) {
    return "Fallback action is invalid";
  }

  if (strategy.rules.length === 0) {
    return "At least 1 rule is required";
  }

  for (let i = 0; i < strategy.rules.length; i++) {
    const rule = strategy.rules[i];
    if (!Number.isInteger(rule.priority) || rule.priority < 0) {
      return `Rule ${i + 1} priority must be an integer >= 0`;
    }
    if (!ACTION_SET.has(rule.action)) {
      return `Rule ${i + 1} action is invalid`;
    }
    if (rule.conditions.length === 0) {
      return `Rule ${i + 1} must have at least 1 condition`;
    }

    for (let j = 0; j < rule.conditions.length; j++) {
      const condition = rule.conditions[j];
      if (!SUBJECT_SET.has(condition.subject)) {
        return `Rule ${i + 1}, condition ${j + 1} subject is invalid`;
      }
      if (!OPERATOR_SET.has(condition.operator)) {
        return `Rule ${i + 1}, condition ${j + 1} operator is invalid`;
      }
      if (!Number.isFinite(condition.value)) {
        return `Rule ${i + 1}, condition ${j + 1} value must be a number`;
      }
    }
  }

  return null;
}
