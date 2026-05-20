import { parseSmsByRules } from "./api/lib/sms-rule-parser";

interface MockSms {
  message: string;
  sender?: string;
  expectedDir: "incoming" | "outgoing" | null;
  expectedAmount: number | null;
  expectedProvider: string;
}

const mockSmsList: MockSms[] = [
  // ── Vodafone Cash (Arabic) ──
  {
    message: "تم تحويل مبلغ 150.00 جنيه لـ 01012345678. مصاريف الخدمة 1.00 جنيه. رصيدك الحالي هو 500.00 جنيه. رقم العملية: 123456789.",
    sender: "Vodafone",
    expectedDir: "outgoing",
    expectedAmount: 150,
    expectedProvider: "VodafoneCash"
  },
  {
    message: "تم استقبال مبلغ 350.50 جنيه من 01098765432. رصيدك الحالي هو 850.50 جنيه. رقم العملية: 987654321.",
    sender: "VF Cash",
    expectedDir: "incoming",
    expectedAmount: 350.5,
    expectedProvider: "VodafoneCash"
  },
  {
    message: "تم سحب مبلغ 500.00 جنيه من محفظتك. مصاريف الخدمة 5.00 جنيه. رصيدك الحالي هو 145.00 جنيه. رقم العملية: 382910392.",
    sender: "vodafone",
    expectedDir: "outgoing",
    expectedAmount: 500,
    expectedProvider: "VodafoneCash"
  },
  {
    message: "تم خصم مبلغ 50.00 جنيه من محفظتك مقابل شحن رصيد لـ 01012345678. رصيدك الحالي هو 95.00 جنيه. رقم العملية: 29831923.",
    sender: "VF-Cash",
    expectedDir: "outgoing",
    expectedAmount: 50,
    expectedProvider: "VodafoneCash"
  },

  // ── Vodafone Cash (English) ──
  {
    message: "You have successfully transferred EGP 100.00 to 01012345678. Service fee EGP 1.00. Your current balance is EGP 500.00. Transaction ID: 123456789.",
    sender: "Vodafone",
    expectedDir: "outgoing",
    expectedAmount: 100,
    expectedProvider: "VodafoneCash"
  },
  {
    message: "You have received EGP 200.00 from 01098765432. Your current balance is EGP 700.00. Transaction ID: 987654321.",
    sender: "Vodafone",
    expectedDir: "incoming",
    expectedAmount: 200,
    expectedProvider: "VodafoneCash"
  },

  // ── InstaPay (Arabic) ──
  {
    message: "تم تحويل مبلغ 1,000.00 جم بنجاح من حسابك رقم ****1234 إلى حساب Mohamed Ahmed عبر انستاباي. رقم العملية: 109283749281.",
    sender: "InstaPay",
    expectedDir: "outgoing",
    expectedAmount: 1000,
    expectedProvider: "InstaPay"
  },
  {
    message: "تم استقبال مبلغ 500.00 جم بنجاح في حسابك رقم ****1234 من Ahmed Ali عبر انستاباي.",
    sender: "InstaPay",
    expectedDir: "incoming",
    expectedAmount: 500,
    expectedProvider: "InstaPay"
  },

  // ── InstaPay (English) ──
  {
    message: "Your account ending with 1234 has been credited with EGP 500.00 from Ahmed Ali via InstaPay.",
    sender: "InstaPay",
    expectedDir: "incoming",
    expectedAmount: 500,
    expectedProvider: "InstaPay"
  },
  {
    message: "EGP 1,000.00 has been successfully transferred from your account ending with 1234 to Mohamed Ahmed via InstaPay. Ref: 109283749281.",
    sender: "InstaPay",
    expectedDir: "outgoing",
    expectedAmount: 1000,
    expectedProvider: "InstaPay"
  },

  // ── Banks (CIB) ──
  {
    message: "CIB: Your account ****1234 has been debited with EGP 1,500.00 for POS purchase at XYZ. Available balance is EGP 10,250.00.",
    sender: "CIB",
    expectedDir: "outgoing",
    expectedAmount: 1500,
    expectedProvider: "CIB"
  },
  {
    message: "CIB: Your account ****1234 has been credited with EGP 25,000.00 for salary. Available balance is EGP 35,250.00.",
    sender: "CIB",
    expectedDir: "incoming",
    expectedAmount: 25000,
    expectedProvider: "CIB"
  },

  // ── Banks (NBE - Arabic) ──
  {
    message: "البنك الاهلي المصري: تم خصم مبلغ 2,000.00 جنيه من حسابكم رقم ****5678 لعملية سحب نقدي من ماكينة ATM. الرصيد المتاح: 5,400.00 جنيه.",
    sender: "NBE",
    expectedDir: "outgoing",
    expectedAmount: 2000,
    expectedProvider: "NBE"
  },
  {
    message: "البنك الاهلي المصري: تم إضافة مبلغ 10,000.00 جنيه لحسابكم رقم ****5678. الرصيد المتاح: 15,400.00 جنيه.",
    sender: "NBE",
    expectedDir: "incoming",
    expectedAmount: 10000,
    expectedProvider: "NBE"
  },

  // ── Non-Financial OTP (Should be ignored) ──
  {
    message: "رمز التحقق الخاص بك هو 5892. برجاء عدم مشاركته مع أي شخص.",
    sender: "CIB",
    expectedDir: null,
    expectedAmount: null,
    expectedProvider: "CIB"
  }
];

let passed = 0;
console.log("🚀 Starting Egyptian SMS/Notification Rule-Based Parser Verification...\n");

for (let i = 0; i < mockSmsList.length; i++) {
  const mock = mockSmsList[i];
  const res = parseSmsByRules(mock.message, mock.sender);

  const amountMatch = res.amount === mock.expectedAmount;
  const dirMatch = res.direction === mock.expectedDir;
  const provMatch = res.provider === mock.expectedProvider;

  const success = amountMatch && dirMatch && provMatch;

  if (success) {
    console.log(`✅ Test #${i + 1} PASSED (${mock.expectedProvider} - ${mock.expectedDir})`);
    passed++;
  } else {
    console.log(`❌ Test #${i + 1} FAILED (${mock.expectedProvider} - ${mock.expectedDir})`);
    console.log(`   Input message: "${mock.message}"`);
    console.log(`   Expected: amount=${mock.expectedAmount}, dir=${mock.expectedDir}, provider=${mock.expectedProvider}`);
    console.log(`   Parsed  : amount=${res.amount}, dir=${res.direction}, provider=${res.provider}, rule=${res.matched_rule}, detected=${res.transaction_detected}`);
  }
}

console.log(`\n📊 Verification Result: ${passed}/${mockSmsList.length} tests passed.`);
if (passed === mockSmsList.length) {
  console.log("🎉 ALL TESTS PASSED SUCCESSFULLY! The rule-based parsing engine is fully robust.");
} else {
  console.log("⚠️ Some tests failed. Please review the patterns.");
}
