package com.smartspend.bank_capture

/**
 * The phone's only filter (decision 0049): a message is sent when its text holds one of the keywords. Everything
 * else (codes, offers, personal senders, what the message means) is the server's to judge, so nothing a bank writes
 * differently is lost on the phone. The keywords come from the server's `/config` (`gate.keywords`); this build's
 * own list is used until a config arrives. The code never runs a pattern the server sends.
 *
 * Pure Kotlin, no Android types: `src/test` runs the cases of `contracts/capture-fixtures/phone-gate.json`, the
 * same file the server's tests read.
 */
class CaptureGate(keywords: Collection<String>) {
    private val keywords = keywords.map(::fold).filter { it.isNotEmpty() }.ifEmpty { DEFAULT_KEYWORDS.map(::fold) }

    /** True when the title or the text holds a keyword. */
    fun keeps(title: String?, text: String): Boolean {
        val folded = fold("${title.orEmpty()} $text")
        return keywords.any { folded.contains(it) }
    }

    companion object {
        /** The owner's list (2026-11-04), also the server's default (`CAPTURE_KEYWORDS` in api/lib/capture/intake.ts). */
        val DEFAULT_KEYWORDS = listOf(
            "transaction", "purchase", "payment", "debit", "credit", "spent",
            "balance", "withdraw", "deposit", "transfer", "paid", "charge",
            "received", "pos", "atm", "wallet", "egp", "جم", "عملية",
            "شراء", "دفع", "خصم", "إضافة", "رصيد", "سحب", "إيداع",
            "تحويل", "مبلغ", "بطاقة", "حساب", "حوال",
        )

        /** Arabic-Indic and Persian digits as ASCII. */
        fun asciiDigits(value: String): String = buildString(value.length) {
            for (char in value) {
                append(
                    when (char) {
                        in '٠'..'٩' -> '0' + (char - '٠')
                        in '۰'..'۹' -> '0' + (char - '۰')
                        else -> char
                    },
                )
            }
        }

        /** Lower case, ASCII digits, Arabic letter variants folded and diacritics and tatweel removed, as the server does. */
        fun fold(value: String): String = buildString(value.length) {
            for (char in asciiDigits(value).lowercase()) {
                when (char) {
                    'أ', 'إ', 'آ', 'ٱ' -> append('ا')
                    'ى' -> append('ي')
                    'ة' -> append('ه')
                    'ؤ' -> append('و')
                    'ئ' -> append('ي')
                    in 'ً'..'ْ', 'ـ' -> Unit
                    else -> append(char)
                }
            }
        }
    }
}
