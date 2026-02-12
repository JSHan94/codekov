"use client";

import { useState, useCallback } from "react";
import { STRATEGY_PRESETS, STRATEGY_COLORS } from "./constants";
import {
  ACTIONS,
  CONDITION_SUBJECTS,
  OPERATORS,
  ACTION_LABELS,
  SUBJECT_LABELS,
  OPERATOR_LABELS,
  type Strategy,
  type Rule,
  type Condition,
  type Action,
  type ConditionSubject,
  type Operator,
} from "./strategyTypes";
import { validateStrategy } from "./strategyValidation";

interface StrategyEditorProps {
  initialStrategy: Strategy;
  onApply: (strategy: Strategy) => void;
  onCancel: () => void;
  isGameActive: boolean;
}

export default function StrategyEditor({
  initialStrategy,
  onApply,
  onCancel,
  isGameActive,
}: StrategyEditorProps) {
  const [strategy, setStrategy] = useState<Strategy>(() =>
    structuredClone(initialStrategy)
  );
  const [error, setError] = useState<string | null>(null);

  const activePreset = STRATEGY_PRESETS.find(
    (p) => JSON.stringify(p) === JSON.stringify(strategy)
  );

  const selectPreset = useCallback((preset: (typeof STRATEGY_PRESETS)[number]) => {
    setStrategy(structuredClone(preset) as Strategy);
    setError(null);
  }, []);

  const updateName = useCallback((name: string) => {
    setStrategy((s) => ({ ...s, name }));
  }, []);

  const updateFallback = useCallback((fallbackAction: Action) => {
    setStrategy((s) => ({ ...s, fallbackAction }));
  }, []);

  // ── Rule operations ──

  const addRule = useCallback(() => {
    setStrategy((s) => ({
      ...s,
      rules: [
        ...s.rules,
        {
          priority: s.rules.length,
          conditions: [{ subject: "hp_percent" as ConditionSubject, operator: "lt" as Operator, value: 50 }],
          action: "MOVE_TO_RANDOM" as Action,
        },
      ],
    }));
  }, []);

  const removeRule = useCallback((ruleIdx: number) => {
    setStrategy((s) => ({
      ...s,
      rules: s.rules.filter((_, i) => i !== ruleIdx),
    }));
  }, []);

  const updateRule = useCallback(
    (ruleIdx: number, patch: Partial<Rule>) => {
      setStrategy((s) => ({
        ...s,
        rules: s.rules.map((r, i) => (i === ruleIdx ? { ...r, ...patch } : r)),
      }));
    },
    []
  );

  const moveRule = useCallback((ruleIdx: number, dir: -1 | 1) => {
    setStrategy((s) => {
      const rules = [...s.rules];
      const target = ruleIdx + dir;
      if (target < 0 || target >= rules.length) return s;
      // swap priorities
      const tmpPriority = rules[ruleIdx].priority;
      rules[ruleIdx] = { ...rules[ruleIdx], priority: rules[target].priority };
      rules[target] = { ...rules[target], priority: tmpPriority };
      // swap positions
      [rules[ruleIdx], rules[target]] = [rules[target], rules[ruleIdx]];
      return { ...s, rules };
    });
  }, []);

  // ── Condition operations ──

  const addCondition = useCallback((ruleIdx: number) => {
    setStrategy((s) => ({
      ...s,
      rules: s.rules.map((r, i) =>
        i === ruleIdx
          ? {
              ...r,
              conditions: [
                ...r.conditions,
                { subject: "hp_percent" as ConditionSubject, operator: "gt" as Operator, value: 0 },
              ],
            }
          : r
      ),
    }));
  }, []);

  const removeCondition = useCallback((ruleIdx: number, condIdx: number) => {
    setStrategy((s) => ({
      ...s,
      rules: s.rules.map((r, i) =>
        i === ruleIdx
          ? { ...r, conditions: r.conditions.filter((_, ci) => ci !== condIdx) }
          : r
      ),
    }));
  }, []);

  const updateCondition = useCallback(
    (ruleIdx: number, condIdx: number, patch: Partial<Condition>) => {
      setStrategy((s) => ({
        ...s,
        rules: s.rules.map((r, i) =>
          i === ruleIdx
            ? {
                ...r,
                conditions: r.conditions.map((c, ci) =>
                  ci === condIdx ? { ...c, ...patch } : c
                ),
              }
            : r
        ),
      }));
    },
    []
  );

  // ── Validation & Submit ──

  const handleApply = useCallback(() => {
    const validationError = validateStrategy(strategy);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    onApply(strategy);
  }, [strategy, onApply]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[620px] max-h-[85vh] overflow-y-auto rounded-xl border border-white/10 bg-[#1a1a2e] p-5 font-mono text-sm text-white/90 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Strategy Editor</h2>
          <span className="text-xs text-white/40">
            {isGameActive ? "Changes apply next tick" : "Pre-raid setup"}
          </span>
        </div>

        {/* Preset Selector */}
        <div className="mb-4">
          <label className="mb-1.5 block text-xs text-white/50">Presets</label>
          <div className="flex gap-1.5 flex-wrap">
            {STRATEGY_PRESETS.map((preset) => {
              const color =
                STRATEGY_COLORS[preset.name] ?? "#888";
              const isActive = activePreset?.name === preset.name;
              return (
                <button
                  key={preset.name}
                  className={`rounded px-2.5 py-1 text-xs transition-colors ${
                    isActive
                      ? "ring-1 ring-white/40 bg-white/15 text-white"
                      : "bg-white/5 text-white/60 hover:bg-white/10"
                  }`}
                  style={{ borderBottom: `2px solid ${color}` }}
                  onClick={() => selectPreset(preset)}
                >
                  {preset.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Strategy Name */}
        <div className="mb-4 flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-white/50">
              Strategy Name
            </label>
            <input
              type="text"
              value={strategy.name}
              onChange={(e) => updateName(e.target.value)}
              maxLength={64}
              className="w-full rounded border border-white/10 bg-white/5 px-2.5 py-1.5 text-white outline-none focus:border-white/30"
            />
          </div>
          <div className="w-44">
            <label className="mb-1 block text-xs text-white/50">
              Fallback Action
            </label>
            <select
              value={strategy.fallbackAction}
              onChange={(e) => updateFallback(e.target.value as Action)}
              className="w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 text-white outline-none focus:border-white/30"
            >
              {ACTIONS.map((a) => (
                <option key={a} value={a} className="bg-[#1a1a2e]">
                  {ACTION_LABELS[a]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Rules */}
        <div className="mb-3 flex items-center justify-between">
          <label className="text-xs text-white/50">
            Rules ({strategy.rules.length})
          </label>
          <button
            onClick={addRule}
            className="rounded bg-white/10 px-2 py-0.5 text-xs text-white/70 hover:bg-white/20 transition-colors"
          >
            + Add Rule
          </button>
        </div>

        <div className="space-y-2.5 mb-4">
          {strategy.rules.map((rule, ruleIdx) => (
            <div
              key={ruleIdx}
              className="rounded-lg border border-white/10 bg-white/[0.03] p-3"
            >
              {/* Rule header */}
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[10px] text-white/30 w-5">
                  #{rule.priority}
                </span>

                {/* Move buttons */}
                <button
                  onClick={() => moveRule(ruleIdx, -1)}
                  disabled={ruleIdx === 0}
                  className="rounded px-1 text-xs text-white/40 hover:text-white/80 disabled:opacity-20"
                >
                  ▲
                </button>
                <button
                  onClick={() => moveRule(ruleIdx, 1)}
                  disabled={ruleIdx === strategy.rules.length - 1}
                  className="rounded px-1 text-xs text-white/40 hover:text-white/80 disabled:opacity-20"
                >
                  ▼
                </button>

                <div className="flex-1" />

                {/* Action selector */}
                <label className="text-[10px] text-white/40">Action:</label>
                <select
                  value={rule.action}
                  onChange={(e) =>
                    updateRule(ruleIdx, { action: e.target.value as Action })
                  }
                  className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-xs text-white outline-none focus:border-white/30"
                >
                  {ACTIONS.map((a) => (
                    <option key={a} value={a} className="bg-[#1a1a2e]">
                      {ACTION_LABELS[a]}
                    </option>
                  ))}
                </select>

                {/* Remove rule */}
                <button
                  onClick={() => removeRule(ruleIdx)}
                  className="rounded px-1.5 py-0.5 text-xs text-red-400/60 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                >
                  ×
                </button>
              </div>

              {/* Conditions */}
              <div className="space-y-1.5">
                {rule.conditions.map((cond, condIdx) => (
                  <div
                    key={condIdx}
                    className="flex items-center gap-1.5"
                  >
                    <span className="text-[10px] text-white/20 w-5">
                      {condIdx === 0 ? "IF" : "AND"}
                    </span>

                    <select
                      value={cond.subject}
                      onChange={(e) =>
                        updateCondition(ruleIdx, condIdx, {
                          subject: e.target.value as ConditionSubject,
                        })
                      }
                      className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-xs text-white outline-none focus:border-white/30"
                    >
                      {CONDITION_SUBJECTS.map((s) => (
                        <option key={s} value={s} className="bg-[#1a1a2e]">
                          {SUBJECT_LABELS[s]}
                        </option>
                      ))}
                    </select>

                    <select
                      value={cond.operator}
                      onChange={(e) =>
                        updateCondition(ruleIdx, condIdx, {
                          operator: e.target.value as Operator,
                        })
                      }
                      className="w-12 rounded border border-white/10 bg-white/5 px-1 py-0.5 text-center text-xs text-white outline-none focus:border-white/30"
                    >
                      {OPERATORS.map((op) => (
                        <option key={op} value={op} className="bg-[#1a1a2e]">
                          {OPERATOR_LABELS[op]}
                        </option>
                      ))}
                    </select>

                    <input
                      type="number"
                      value={cond.value}
                      onChange={(e) => {
                        const nextValue = Number(e.target.value);
                        updateCondition(ruleIdx, condIdx, {
                          value: Number.isFinite(nextValue) ? nextValue : cond.value,
                        });
                      }}
                      className="w-16 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-center text-xs text-white outline-none focus:border-white/30"
                    />

                    <button
                      onClick={() => removeCondition(ruleIdx, condIdx)}
                      disabled={rule.conditions.length <= 1}
                      className="rounded px-1 text-xs text-red-400/40 hover:text-red-400 disabled:opacity-20 transition-colors"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={() => addCondition(ruleIdx)}
                className="mt-1.5 text-[10px] text-white/30 hover:text-white/60 transition-colors"
              >
                + condition
              </button>
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <p className="mb-3 text-xs text-red-400">{error}</p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-xs text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="rounded bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
          >
            {isGameActive ? "Apply" : "Set Strategy"}
          </button>
        </div>
      </div>
    </div>
  );
}
