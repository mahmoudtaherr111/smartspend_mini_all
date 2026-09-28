# Writing the app's messages

Every text a user reads (toasts, errors, empty states, buttons, notifications, questions from the engine) is written
the same way, so the app sounds like one app. The admin console is for the owner and is exempt.
`tests/knowledge/user-copy.test.ts` rejects the phrases in "Never" in user-facing code.

## Voice
- **Polite Egyptian Arabic**, the way a helpful person at a bank counter talks: «جرّب تاني»، «اكتب المبلغ»، «مش قادرين
  نوصل للسيرفر». Not formal Arabic, not slang.
- **Say what happened, then what to do**, in that order and in one or two short sentences: «النت فاصل. هنحفظها ونبعتها
  لما يرجع.»
- **Never blame the user.** Describe the text, not the person: «مش لاقيين مبلغ في الجملة» instead of «أدخلت نصاً غير صحيح».
- **No English and no technical words** where Arabic exists: «الأوفلاين» is understood, «Queue»، «HTTPS»، «Localhost»،
  «FREE» are not. Brand names (Pro, Ultra, Paymob, Gemini) stay as they are.
- **Numbers with their noun agree**: «فاضل 3 تسجيلات», «عملية واحدة», «10 طلبات», not «10 طلب» or «1 عمليات».
- **A question is a question.** Don't put «سؤال سريع:» above a statement.
- **An error from a provider or the server is never shown raw**; map it to a message in this voice and log the original.

## Never (checked)
| Instead of | Write |
| --- | --- |
| يرجى … | imperative: «اكتب…»، «اختار…»، «فعّل…» |
| تعذر … | «ماقدرناش …» / «مش قادرين …» |
| لقد … | drop it: «وصلت للحد» |
| لديك … | «عندك …» |
| عفواً، | drop it, or «معلش،» when an apology is really owed |
| Queue | «قايمة الأوفلاين» |

## Examples
| Situation | Message |
| --- | --- |
| Server unreachable | «مش قادرين نوصل للسيرفر. اتأكد من النت وجرّب تاني.» |
| Session expired | «الجلسة خلصت. سجّل دخولك تاني.» |
| Voice month used up | «دقايق الصوت بتاعة الشهر ده خلصت. تقدر تكتب، أو ترقّي لـ Pro.» |
| Missing amount | «اكتب المبلغ.» |
