import { db } from "../queries/connection";
import { userProfiles, userWallets, expenses, financialGoals } from "../../db/schema";
import { eq, and, gte } from "drizzle-orm";

export async function getUserFinancialContextSummary(
  userId: number,
  userType: "oauth" | "local"
): Promise<string> {
  try {
    // 1. Profile information
    const profile = await db.query.userProfiles.findFirst({
      where: and(eq(userProfiles.userId, userId), eq(userProfiles.userType, userType)),
    });

    // 2. Wallets & Balances
    const wallets = await db
      .select()
      .from(userWallets)
      .where(and(eq(userWallets.userId, userId), eq(userWallets.userType, userType)));

    // 3. Current Month Transactions (Income & Expenses)
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyTransactions = await db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          eq(expenses.userType, userType),
          gte(expenses.date, monthStart)
        )
      );

    // 4. Financial Goals
    const activeGoals = await db
      .select()
      .from(financialGoals)
      .where(
        and(
          eq(financialGoals.userId, userId),
          eq(financialGoals.userType, userType),
          eq(financialGoals.status, "active")
        )
      );

    // Calculations
    const totalWalletBalance = wallets.reduce(
      (sum, w) => sum + parseFloat(w.balance || "0"),
      0
    );

    let totalIncome = 0;
    let totalExpense = 0;
    const categoryTotals: Record<string, number> = {};

    monthlyTransactions.forEach((t) => {
      const amt = parseFloat(t.amount || "0");
      if (t.type === "income") {
        totalIncome += amt;
      } else {
        totalExpense += amt;
        const cat = t.category || "أخرى";
        categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
      }
    });

    // Formatting Context Summary in Arabic
    let summary = `[بيانات المستخدم المالية الحالية]\n`;
    summary += `- الدخل الشهري المعلن: ${profile?.monthlyIncome || "غير محدد"} جنيه مصري.\n`;
    summary += `- الهدف المالي العام: ${profile?.financialGoal || "غير محدد"}.\n`;
    summary += `- الشخصية المالية: ${profile?.financialPersonality || "متوازنة"}.\n`;
    summary += `- إجمالي رصيد المحافظ: ${totalWalletBalance.toFixed(2)} جنيه مصري.\n`;
    summary += `- إجمالي الدخل هذا الشهر: ${totalIncome.toFixed(2)} جنيه مصري.\n`;
    summary += `- إجمالي المصروفات هذا الشهر: ${totalExpense.toFixed(2)} جنيه مصري.\n`;

    if (Object.keys(categoryTotals).length > 0) {
      summary += `\n[أعلى الفئات هذا الشهر]:\n`;
      const sorted = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).slice(0, 5);
      for (const [cat, amt] of sorted) {
        const pct = totalExpense > 0 ? Math.round((amt / totalExpense) * 100) : 0;
        summary += ` - ${cat}: ${Math.round(amt)} ج.م (${pct}%)\n`;
      }
    }

    if (wallets.length > 0) {
      summary += `\n[المحافظ والحسابات الفعالة]:\n`;
      wallets.forEach((w) => {
        summary += ` - محفظة "${w.name}" (${w.provider}): رصيدها ${parseFloat(w.balance || "0").toFixed(2)} جنيه مصري.\n`;
      });
    }

    if (activeGoals.length > 0) {
      summary += `\n[أهداف الادخار النشطة]:\n`;
      activeGoals.forEach((g) => {
        const target = parseFloat(g.targetAmount || "0");
        summary += ` - هدف "${g.title}": المبلغ المستهدف ${target.toFixed(2)} جنيه مصري.\n`;
      });
    }

    return summary;
  } catch (error) {
    console.error("Error generating financial context summary:", error);
    return "[بيانات المستخدم المالية غير متوفرة حالياً بسبب خطأ فني]";
  }
}
