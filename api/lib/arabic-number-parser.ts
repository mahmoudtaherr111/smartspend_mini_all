export const numMap: Record<string, number> = {
  واحد: 1,
  واحده: 1,
  واحدة: 1,
  اتنين: 2,
  إثنين: 2,
  اثنين: 2,
  تلاتة: 3,
  تلاته: 3,
  ثلاثة: 3,
  ثلاثه: 3,
  تلات: 3,
  ثلاث: 3,
  اربعة: 4,
  اربعه: 4,
  أربعة: 4,
  أربعه: 4,
  اربع: 4,
  أربع: 4,
  خمسة: 5,
  خمسه: 5,
  خمس: 5,
  ستة: 6,
  سته: 6,
  ست: 6,
  سبعة: 7,
  سبعه: 7,
  سبع: 7,
  تمنية: 8,
  تمنيه: 8,
  ثمانية: 8,
  ثمانيه: 8,
  تمن: 8,
  ثمان: 8,
  تمان: 8,
  تسعة: 9,
  تسعه: 9,
  تسع: 9,
  عشرة: 10,
  عشره: 10,
  عشر: 10,
  حداشر: 11,
  "إحدى عشر": 11,
  احداشر: 11,
  إحداشر: 11,
  اتناشر: 12,
  "إثنى عشر": 12,
  اثناشر: 12,
  إثناشر: 12,
  تلاتاشر: 13,
  "ثلاثة عشر": 13,
  اربعتاشر: 14,
  "أربعة عشر": 14,
  خمستاشر: 15,
  "خمسة عشر": 15,
  ستاشر: 16,
  "ستة عشر": 16,
  سبعتاشر: 17,
  "سبعة عشر": 17,
  تمنتاشر: 18,
  "ثمانية عشر": 18,
  تمانتاشر: 18,
  تسعتاشر: 19,
  "تسعة عشر": 19,
  عشرين: 20,
  تلاتين: 30,
  ثلاثين: 30,
  اربعين: 40,
  أربعين: 40,
  خمسين: 50,
  ستين: 60,
  سبعين: 70,
  تمنين: 80,
  ثمانين: 80,
  تمانين: 80,
  تسعين: 90,
  مية: 100,
  ميه: 100,
  مائة: 100,
  مائه: 100,
  ميت: 100,
  ميتين: 200,
  مئتين: 200,
  تلاتمية: 300,
  ثلاثمائة: 300,
  تلاتميه: 300,
  ثلاثمائه: 300,
  ربعمية: 400,
  اربعمائة: 400,
  ربعميه: 400,
  اربعمائه: 400,
  أربعمائة: 400,
  أربعمائه: 400,
  خمسمية: 500,
  خمسمائة: 500,
  خمسميه: 500,
  خمسمائه: 500,
  ستمية: 600,
  ستمائة: 600,
  ستميه: 600,
  ستمائه: 600,
  سبعمية: 700,
  سبعمائة: 700,
  سبعميه: 700,
  سبعمائه: 700,
  تمنمية: 800,
  ثمانمائة: 800,
  تمنميه: 800,
  ثمانمائه: 800,
  تسعمية: 900,
  تسعمائة: 900,
  تسعميه: 900,
  تسعمائه: 900,
};

export const multiplierMap: Record<string, number> = {
  الف: 1000,
  ألف: 1000,
  الفين: 2000,
  ألفين: 2000,
  الاف: 1000,
  آلاف: 1000,
  مليون: 1000000,
  مليونين: 2000000,
  ملايين: 1000000,
  ارنب: 1000000,
  أرنب: 1000000,
  باكو: 1000,
};

export function parseArabicNumbers(text: string): string {
  if (!text) return text;

  let processedText = text
    .replace(/(^|\s)باكو ونص(?=\s|$)/g, "$11500")
    .replace(/(^|\s)أرنب ونص(?=\s|$)/g, "$11500000")
    .replace(/(^|\s)ارنب ونص(?=\s|$)/g, "$11500000")
    .replace(/(^|\s)نص باكو(?=\s|$)/g, "$1500")
    .replace(/(^|\s)نص أرنب(?=\s|$)/g, "$1500000")
    .replace(/(^|\s)نص ارنب(?=\s|$)/g, "$1500000")
    .replace(/(^|\s)ربع باكو(?=\s|$)/g, "$1250")
    .replace(/(^|\s)ربع أرنب(?=\s|$)/g, "$1250000")
    .replace(/(^|\s)ربع ارنب(?=\s|$)/g, "$1250000");

  const words = processedText.split(/\s+/);
  const resultTokens: string[] = [];

  let currentNumber = 0;
  let currentSegment = 0;
  let hasNumber = false;

  for (let i = 0; i < words.length; i++) {
    let word = words[i];
    let checkWord = word;

    if (word.length > 1 && word.startsWith("و")) {
      let withoutWaw = word.substring(1);
      if (numMap[withoutWaw] || multiplierMap[withoutWaw]) {
        checkWord = withoutWaw;
      }
    } else if (word.length > 1 && word.startsWith("ب")) {
      let withoutB = word.substring(1);
      if (numMap[withoutB] || multiplierMap[withoutB]) {
        checkWord = withoutB;
      }
    }

    let val = numMap[checkWord];
    let mult = multiplierMap[checkWord];

    if (val !== undefined || mult !== undefined) {
      hasNumber = true;

      if (mult !== undefined) {
        if (currentSegment === 0) {
          currentSegment = mult;
        } else {
          currentSegment *= mult;
        }
        currentNumber += currentSegment;
        currentSegment = 0;
      } else {
        currentSegment += val;
      }
    } else {
      if (hasNumber) {
        let total = currentNumber + currentSegment;
        resultTokens.push(total.toString());
        currentNumber = 0;
        currentSegment = 0;
        hasNumber = false;
      }

      if (word === "و" || word === "وا") {
        if (i + 1 < words.length) {
          let nextWord = words[i + 1];
          let nextCheck = nextWord;
          if (nextWord.startsWith("و") && nextWord.length > 1) {
            nextCheck = nextWord.substring(1);
          } else if (nextWord.startsWith("ب") && nextWord.length > 1) {
            nextCheck = nextWord.substring(1);
          }
          if (numMap[nextCheck] || multiplierMap[nextCheck]) {
            continue; // Skip pushing 'و', keep accumulating
          }
        }
      }

      resultTokens.push(word);
    }
  }

  if (hasNumber) {
    let total = currentNumber + currentSegment;
    resultTokens.push(total.toString());
  }

  return resultTokens.join(" ");
}
