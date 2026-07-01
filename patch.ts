// ─── New resolver capabilities ───

import type {
  FinanceBusinessCashflow,
  FinanceCategoryInclusion,
  FinanceComparisonDriver,
  FinanceGoalFeasibility,
} from "./types";

export async function getComparisonDrivers(
  ctx: FinanceContext,
  input: FinancePeriodInput = {},
): Promise<FinanceComparisonDriver[]> {
  const [currentBreakdownCat, previousBreakdownCat, currentBreakdownMerchant, previousBreakdownMerchant] = await Promise.all([
    getFinanceBreakdown(ctx, { period: input.period ?? "current_month", granularity: "category", limit: 10 }),
    getFinanceBreakdown(ctx, { period: input.comparePeriod ?? "previous_month", granularity: "category", limit: 10 }),
    getFinanceBreakdown(ctx, { period: input.period ?? "current_month", granularity: "merchant", limit: 10 }),
    getFinanceBreakdown(ctx, { period: input.comparePeriod ?? "previous_month", granularity: "merchant", limit: 10 }),
  ]);

  const previousByCategory = new Map<string, number>();
  for (const item of previousBreakdownCat.items) {
    previousByCategory.set(item.name, item.amount);
  }
  for (const item of previousBreakdownMerchant.items) {
    previousByCategory.set(item.name, item.amount);
  }

  const drivers: FinanceComparisonDriver[] = [];
  const addDrivers = (items: typeof currentBreakdownCat.items, type: "category" | "merchant") => {
    for (const item of items) {
      const prevAmount = previousByCategory.get(item.name) ?? 0;
      drivers.push({
        category: item.name,
        type,
        currentAmount: item.amount,
        previousAmount: prevAmount,
        difference: item.amount - prevAmount,
        changePercent: prevAmount > 0 ? ((item.amount - prevAmount) / prevAmount) * 100 : null,
        direction: item.amount > prevAmount ? "up" : item.amount < prevAmount ? "down" : "stable",
      });
    }
  };

  addDrivers(currentBreakdownCat.items, "category");
  addDrivers(currentBreakdownMerchant.items, "merchant");

  return drivers
    .filter((driver) => Math.abs(driver.difference) >= 1)
    .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
    .slice(0, 8);
}

function comparisonDriverFacts(need: DataNeed, drivers: FinanceComparisonDriver[]): ResolvedFact[] {
  const facts: ResolvedFact[] = [];
  for (const [index, driver] of drivers.slice(0, 8).entries()) {
    const key = `driver_${index + 1}_${driver.type === "merchant" ? "merchant_" : ""}${driver.category.replace(/\s+/g, "_")}`;
    facts.push(
      makeFact(
        need.id,
        need.kind,
        key,
        driver.currentAmount,
        0.9,
        [
          { id: `prev_${driver.category}`, label: `${driver.category}_previous`, value: driver.previousAmount },
          { id: `diff_${driver.category}`, label: `${driver.category}_difference`, value: driver.difference },
        ],
      ),
      makeFact(need.id, need.kind, `${key}_category`, driver.category),
      makeFact(need.id, need.kind, `${key}_category_display`, displayFinanceCategory(driver.category)),
      makeFact(need.id, need.kind, `${key}_previous_amount`, driver.previousAmount),
      makeFact(need.id, need.kind, `${key}_difference`, driver.difference),
      makeFact(need.id, need.kind, `${key}_direction`, driver.direction),
    );
  }
  return facts;
}

export async function getBusinessCashflow(
  ctx: FinanceContext,
  input: FinancePeriodInput = {},
): Promise<FinanceBusinessCashflow> {
  const summary = await getFinanceSummary(ctx, { period: input.period ?? "current_month" });

  const incomeCategories: Array<{ category: string; amount: number }> = [];
  const expenseCategories: Array<{ category: string; amount: number }> = [];

  const allRows = await loadRowsForPeriod(ctx, summary.period);
  const incomeByCategory = new Map<string, number>();
  const expenseByCategory = new Map<string, number>();
  for (const row of allRows) {
    const amount = amountOf(row);
    const cat = canonicalCategoryForRow(row.category, row.subCategory, row.description, row.rawText, row.placeHint);
    if (row.type === "income") {
      incomeByCategory.set(cat, (incomeByCategory.get(cat) ?? 0) + amount);
    } else {
      expenseByCategory.set(cat, (expenseByCategory.get(cat) ?? 0) + amount);
    }
  }

  for (const [category, amount] of [...incomeByCategory].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
    incomeCategories.push({ category, amount });
  }
  for (const [category, amount] of [...expenseByCategory].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    expenseCategories.push({ category, amount });
  }

  const projectedMonthEnd = summary.dailyAverageExpense * summary.period.daysTotal;
  const remainingDays = summary.period.daysTotal - summary.period.daysElapsed;
  const suggestedWeeklyPlan: string[] = [
    remainingDays > 0
      ? `معاك ${Math.max(0, summary.netFlow - (projectedMonthEnd - summary.totalExpense)).toLocaleString("ar-EG")} جنيه متبقي تقديري لتغطية ${remainingDays} يوم.`
      : "الشهر في آخره. راجع المصاريف والتزم بالصافي الحالي.",
    expenseCategories.length > 0
      ? `أكبر بند: ${expenseCategories[0].category} (${expenseCategories[0].amount.toLocaleString("ar-EG")} جنيه).`
      : "",
    `الدخل: ${summary.totalIncome.toLocaleString("ar-EG")} جنيه.`,
    summary.netFlow > 0
      ? `الصافي إيجابي (+${summary.netFlow.toLocaleString("ar-EG")} جنيه).`
      : `الصافي سلبي (${summary.netFlow.toLocaleString("ar-EG")} جنيه). راجع وقلل.`,
  ].filter(Boolean);

  return {
    period: summary.period.label,
    totalIncome: summary.totalIncome,
    totalExpense: summary.totalExpense,
    netFlow: summary.netFlow,
    topExpenseCategories: expenseCategories,
    topIncomeCategories: incomeCategories,
    dailyAverageExpense: summary.dailyAverageExpense,
    projectedMonthEnd,
    suggestedWeeklyPlan,
  };
}

function businessCashflowFacts(need: DataNeed, cashflow: FinanceBusinessCashflow): ResolvedFact[] {
  return [
    makeFact(need.id, need.kind, "period", cashflow.period),
    makeFact(need.id, need.kind, "total_income", cashflow.totalIncome),
    makeFact(need.id, need.kind, "total_expense", cashflow.totalExpense),
    makeFact(need.id, need.kind, "net_flow", cashflow.netFlow),
    makeFact(need.id, need.kind, "daily_average_expense", cashflow.dailyAverageExpense),
    makeFact(need.id, need.kind, "projected_month_end", cashflow.projectedMonthEnd),
    ...cashflow.suggestedWeeklyPlan.slice(0, 4).map((plan, index) =>
      makeFact(need.id, need.kind, `weekly_plan_${index + 1}`, plan),
    ),
    ...cashflow.topExpenseCategories.slice(0, 5).map((item, index) =>
      makeFact(need.id, need.kind, `top_expense_${index + 1}_${item.category}`, item.amount),
    ),
    ...cashflow.topIncomeCategories.slice(0, 3).map((item, index) =>
      makeFact(need.id, need.kind, `top_income_${index + 1}_${item.category}`, item.amount),
    ),
  ];
}

export async function getCategoryInclusion(
  ctx: FinanceContext,
  category: string,
  input: FinancePeriodInput = {},
): Promise<FinanceCategoryInclusion> {
  const period = resolveFinancePeriod(input, ctx);
  const rows = await loadRowsForPeriod(ctx, period);
  const matched = rows.filter((row) => rowMatchesCategory(row, category));
  const aliases = getCategoryAliases(category);
  const merchants = new Set<string>();

  for (const row of matched) {
    const desc = String(row.description ?? row.rawText ?? "");
    if (desc) merchants.add(desc.slice(0, 40));
  }

  return {
    category,
    merchants: [...merchants].slice(0, 10),
    sampleTransactions: matched.slice(0, 5).map((row) => ({
      description: String(row.description ?? row.rawText ?? row.category ?? ""),
      amount: amountOf(row),
      date: dateString(row.date),
    })),
    ruleExplanation: `كل العمليات اللي فيها: ${aliases.slice(0, 8).join("، ")} بتتصنف تحت ${displayFinanceCategory(category)}.`,
    totalMatched: matched.length,
  };
}

function categoryInclusionFacts(need: DataNeed, inclusion: FinanceCategoryInclusion): ResolvedFact[] {
  return [
    makeFact(need.id, need.kind, "category", inclusion.category),
    makeFact(need.id, need.kind, "category_display", displayFinanceCategory(inclusion.category)),
    makeFact(need.id, need.kind, "total_matched", inclusion.totalMatched),
    makeFact(need.id, need.kind, "rule_explanation", inclusion.ruleExplanation),
    makeFact(need.id, need.kind, "merchants", inclusion.merchants.join("، ")),
    ...inclusion.sampleTransactions.slice(0, 4).map((row, index) =>
      makeFact(
        need.id,
        need.kind,
        `transaction_${index + 1}`,
        `${row.date} ${row.description} ${row.amount}`,
        1,
        [{ id: index + 1, label: row.description, value: row.amount }],
      ),
    ),
  ];
}

export async function getGoalFeasibility(
  ctx: FinanceContext,
  input: FinancePeriodInput & { targetAmount?: number } = {},
): Promise<FinanceGoalFeasibility> {
  const [summary, breakdown, goals] = await Promise.all([
    getFinanceSummary(ctx, { period: input.period ?? "current_month" }),
    getFinanceBreakdown(ctx, { period: input.period ?? "current_month", granularity: "category", limit: 8 }),
    getGoalProgress(ctx),
  ]);

  const capacity = Math.max(0, summary.netFlow);
  const activeGoal = goals.goals[0];
  const targetAmount = input.targetAmount ?? activeGoal?.targetAmount ?? 0;
  const estimatedMonths = capacity > 0 && targetAmount > 0 ? Math.ceil(targetAmount / capacity) : null;

  const levers = breakdown.items.slice(0, 4).map((item) => ({
    category: item.name,
    amount: item.amount,
    potentialSavings: Math.round(item.amount * 0.15),
  }));

  let feasibilityRating: FinanceGoalFeasibility["feasibilityRating"] = "moderate";
  if (estimatedMonths && estimatedMonths <= 6) feasibilityRating = "easy";
  if (estimatedMonths && estimatedMonths >= 18) feasibilityRating = "challenging";

  return {
    monthlyCapacity: capacity,
    targetAmount,
    estimatedMonths,
    topExpenseLevers: levers,
    feasibilityRating,
  };
}

function goalFeasibilityFacts(need: DataNeed, feasibility: FinanceGoalFeasibility): ResolvedFact[] {
  return [
    makeFact(need.id, need.kind, "monthly_capacity", feasibility.monthlyCapacity),
    makeFact(need.id, need.kind, "target_amount", feasibility.targetAmount),
    makeFact(need.id, need.kind, "estimated_months", feasibility.estimatedMonths ?? null),
    makeFact(need.id, need.kind, "feasibility_rating", feasibility.feasibilityRating),
    ...feasibility.topExpenseLevers.slice(0, 4).map((lever, index) =>
      makeFact(need.id, need.kind, `lever_${index + 1}_${lever.category}`, lever.potentialSavings, 0.8, [
        { id: lever.category, label: `${lever.category}_current`, value: lever.amount },
      ]),
    ),
  ];
}

export async function getTransactionLookup(
  ctx: FinanceContext,
  query: string,
  category?: string,
  transactionTypes?: string[],
  input: FinancePeriodInput = {},
): Promise<FinanceTransactionFact | null> {
  const rows = await loadRowsForPeriod(ctx, resolveFinancePeriod(input, ctx));
  const allowedTypes = new Set((transactionTypes ?? []).filter(Boolean));
  const tokens = transactionLookupTokens(query);
  const normalizedQuery = normalizeLookupText(String(query ?? ""));
  const candidates = rows.filter((row) => {
    if (allowedTypes.size > 0 && !allowedTypes.has(String(row.type))) return false;
    if (category && !rowMatchesCategory(row, category)) return false;
    return true;
  });

  const scored = candidates
    .map((row, index) => {
      const haystack = normalizeLookupText(
        [
          row.description,
          row.rawText,
          row.category,
          row.subCategory,
          row.placeHint,
        ]
          .filter(Boolean)
          .join(" "),
      );
      const tokenScore = tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
      const phraseScore = normalizedQuery && haystack.includes(normalizedQuery) ? 3 : 0;
      return { row, index, score: tokenScore + phraseScore };
    })
    .filter((item) => tokens.length === 0 || item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const latest = scored[0]?.row ?? (tokens.length === 0 ? candidates[0] : undefined);
  if (latest) {
    return {
      id: latest.id,
      type: latest.type,
      amount: amountOf(latest),
      category: latest.category ?? "uncategorized",
      subCategory: latest.subCategory,
      description: latest.description,
      placeHint: latest.placeHint,
      date: dateString(latest.date),
    };
  }

  return null;
}

function transactionLookupFacts(need: DataNeed, transaction: FinanceTransactionFact): ResolvedFact[] {
  const facts: ResolvedFact[] = [
    makeFact(need.id, need.kind, "expense_id", transaction.id),
    makeFact(need.id, need.kind, "amount", transaction.amount),
    makeFact(need.id, need.kind, "category", transaction.category),
    makeFact(need.id, need.kind, "sub_category", transaction.subCategory ?? "عام"),
    makeFact(need.id, need.kind, "description", transaction.description ?? ""),
    makeFact(need.id, need.kind, "date", transaction.date),
  ];
  if (need.scope?.targetCategory) {
    facts.push(makeFact(need.id, need.kind, "target_category", need.scope.targetCategory));
  }
  if (need.scope?.sourceCategory) {
    facts.push(makeFact(need.id, need.kind, "source_category", need.scope.sourceCategory));
  }
  if (need.scope?.query) {
    facts.push(makeFact(need.id, need.kind, "lookup_query", need.scope.query));
  }
  return facts;
}

export async function resolveKernelDataNeeds(
  ctx: FinanceContext,
  dataNeeds: DataNeed[],
): Promise<FinanceResolverResult> {
  const facts: ResolvedFact[] = [];
  const artifacts: Artifact[] = [];
  const errors: string[] = [];
  let profileSnapshot: FinanceProfileSnapshot | undefined;

  const needsFinancialPeriod = dataNeeds.some((need) =>
    need.kind.startsWith("finance.") || need.kind === "chart.data" || need.kind === "goals.active",
  );
  if (needsFinancialPeriod && !ctx.salaryDay) {
    try {
      profileSnapshot = await getProfileSnapshot(ctx);
      ctx.salaryDay = profileSnapshot.salaryDay;
    } catch (error) {
      errors.push(`profile_snapshot_prefetch:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const financeCacheTrace = await collectFinanceCacheTrace(async () => {
    for (const need of dataNeeds) {
      try {
        if (need.kind === "none") continue;

        if (need.kind === "finance.summary") {
          facts.push(...summaryFacts(need, await getFinanceSummary(ctx, resolveInputFromNeed(need))));
        } else if (need.kind === "finance.period_comparison") {
          facts.push(...comparisonFacts(need, await getFinancePeriodComparison(ctx, resolveInputFromNeed(need))));
        } else if (need.kind === "finance.category_total") {
          facts.push(
            ...categoryFacts(
              need,
              await getCategoryTotal(ctx, need.scope?.category ?? "uncategorized", resolveInputFromNeed(need)),
            ),
          );
        } else if (need.kind === "finance.breakdown") {
          facts.push(
            ...breakdownFacts(
              need,
              await getFinanceBreakdown(ctx, {
                ...resolveInputFromNeed(need),
                category: need.scope?.category,
                granularity: need.scope?.granularity as FinanceGranularity | undefined,
                limit: need.scope?.limit,
              }),
            ),
          );
        } else if (need.kind === "finance.transactions") {
          facts.push(
            ...transactionFacts(
              need,
              await getFinanceTransactions(ctx, {
                ...resolveInputFromNeed(need),
                category: need.scope?.category,
                categories: need.scope?.categories,
                transactionTypes: need.scope?.transactionTypes,
                limit: need.scope?.limit ?? need.maxRows,
              }),
            ),
          );
        } else if (need.kind === "finance.comparison_drivers") {
          facts.push(
            ...comparisonDriverFacts(need, await getComparisonDrivers(ctx, resolveInputFromNeed(need))),
          );
        } else if (need.kind === "finance.business_cashflow") {
          facts.push(
            ...businessCashflowFacts(need, await getBusinessCashflow(ctx, resolveInputFromNeed(need))),
          );
        } else if (need.kind === "finance.category_inclusion") {
          facts.push(
            ...categoryInclusionFacts(
              need,
              await getCategoryInclusion(ctx, need.scope?.category ?? "food", resolveInputFromNeed(need)),
            ),
          );
        } else if (need.kind === "goal.feasibility") {
          facts.push(...goalFeasibilityFacts(need, await getGoalFeasibility(ctx, {
            ...resolveInputFromNeed(need),
            targetAmount: typeof need.scope?.targetAmount === "number" ? need.scope.targetAmount : undefined
          })));
        } else if (need.kind === "finance.transaction_lookup") {
          const transaction = await getTransactionLookup(
            ctx,
            need.scope?.query ?? "",
            need.scope?.category,
            need.scope?.transactionTypes,
            resolveInputFromNeed(need),
          );
          if (transaction) {
            facts.push(...transactionLookupFacts(need, transaction));
          } else {
            facts.push(makeFact(need.id, need.kind, "not_found", true));
          }
        } else if (need.kind === "finance.goal_progress" || need.kind === "goals.active") {
          facts.push(...goalFacts(need, await getGoalProgress(ctx)));
        } else if (need.kind === "profile.snapshot") {
          const profile = profileSnapshot ?? (await getProfileSnapshot(ctx));
          ctx.salaryDay = profile.salaryDay;
          facts.push(...profileFacts(need, profile));
        } else if (need.kind === "wallet.summary") {
          facts.push(...walletFacts(need, await getWalletSummary(ctx)));
        } else if (need.kind === "chart.data") {
          const chart = await getChartData(ctx, {
            ...resolveInputFromNeed(need),
            category: need.scope?.category,
            categories: need.scope?.categories,
            granularity: need.scope?.granularity as FinanceGranularity | undefined,
            limit: need.scope?.limit,
          });
          artifacts.push(createFinanceChartArtifact(need, chart));
        }
      } catch (error) {
        errors.push(`${need.id}:${error instanceof Error ? error.message : String(error)}`);
      }
    }
  });

  return { facts, artifacts, errors, cacheHits: financeCacheTrace.cacheHits };
}
