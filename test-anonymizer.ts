import { redactSensitiveData } from "./api/lib/anonymizer";

interface AnonymizerTestCase {
  description: string;
  input: string;
  expectedContains: string[];
  expectedNotContains: string[];
}

const testCases: AnonymizerTestCase[] = [
  {
    description: "Egyptian mobile phone number redaction (local format)",
    input: "تم تحويل مبلغ 100 جنيه لـ 01012345678 بنجاح.",
    expectedContains: ["[REDACTED_PHONE]"],
    expectedNotContains: ["01012345678"]
  },
  {
    description: "Egyptian mobile phone number redaction (international format)",
    input: "You received EGP 200.00 from +201198765432.",
    expectedContains: ["[REDACTED_PHONE]"],
    expectedNotContains: ["+201198765432", "201198765432"]
  },
  {
    description: "Credit card / Account masked formats",
    input: "تم خصم مبلغ من حساب رقم ****5678 لعملية شراء.",
    expectedContains: ["حساب رقم [REDACTED_CARD]"],
    expectedNotContains: ["****5678"]
  },
  {
    description: "Credit card ending text (English)",
    input: "Your account ending with 1234 has been credited.",
    expectedContains: ["account ending with [REDACTED_CARD]"],
    expectedNotContains: ["1234"]
  },
  {
    description: "Full bank account number (16 digits)",
    input: "CIB Account transfer details: 5082736481029384 transaction complete.",
    expectedContains: ["[REDACTED_ACCOUNT_FULL]"],
    expectedNotContains: ["5082736481029384"]
  },
  {
    description: "OTP verification code redaction (Arabic)",
    input: "رمز التحقق الخاص بك هو 9482. برجاء عدم مشاركته.",
    expectedContains: ["[REDACTED_OTP]"],
    expectedNotContains: ["9482"]
  },
  {
    description: "OTP code redaction (English)",
    input: "SmartSpend: Your verification code is 192803.",
    expectedContains: ["[REDACTED_OTP]"],
    expectedNotContains: ["192803"]
  },
  {
    description: "P2P name redaction (Arabic)",
    input: "تم تحويل 500 جم إلى Mohamed Ahmed عبر انستاباي بنجاح.",
    expectedContains: ["[REDACTED_NAME]", "انستاباي"],
    expectedNotContains: ["Mohamed Ahmed"]
  },
  {
    description: "P2P name redaction (English)",
    input: "EGP 1,000.00 has been transferred to Ahmed Ali via InstaPay.",
    expectedContains: ["[REDACTED_NAME]", "InstaPay"],
    expectedNotContains: ["Ahmed Ali"]
  }
];

let passed = 0;
console.log("🚀 Starting Anonymizer & Privacy Engine Verification...\n");

for (let i = 0; i < testCases.length; i++) {
  const tc = testCases[i];
  const redacted = redactSensitiveData(tc.input);

  let success = true;
  const missingContains: string[] = [];
  const leakedContains: string[] = [];

  for (const c of tc.expectedContains) {
    if (!redacted.includes(c)) {
      success = false;
      missingContains.push(c);
    }
  }

  for (const nc of tc.expectedNotContains) {
    if (redacted.includes(nc)) {
      success = false;
      leakedContains.push(nc);
    }
  }

  if (success) {
    console.log(`✅ Test #${i + 1} PASSED: ${tc.description}`);
    passed++;
  } else {
    console.log(`❌ Test #${i + 1} FAILED: ${tc.description}`);
    console.log(`   Original: "${tc.input}"`);
    console.log(`   Redacted: "${redacted}"`);
    if (missingContains.length > 0) {
      console.log(`   Missing expected tags: ${JSON.stringify(missingContains)}`);
    }
    if (leakedContains.length > 0) {
      console.log(`   Leaked sensitive data: ${JSON.stringify(leakedContains)}`);
    }
  }
}

console.log(`\n📊 Verification Result: ${passed}/${testCases.length} tests passed.`);
if (passed === testCases.length) {
  console.log("🎉 ALL ANONYMIZER TESTS PASSED SUCCESSFULLY! The privacy engine is fully secure.");
} else {
  console.log("⚠️ Some anonymizer tests failed. Please review the patterns.");
  process.exit(1);
}
