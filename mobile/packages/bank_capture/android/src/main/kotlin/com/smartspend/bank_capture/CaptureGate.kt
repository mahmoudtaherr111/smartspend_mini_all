package com.smartspend.bank_capture

/**
 * The phone's first filter (decision 0028). It drops only what is clearly not a bank's: a message from a person's
 * number, a one-time code, a text without a digit. Anything else is sent, because what the phone drops is lost; the
 * server reads it and is strict. The word lists come from the server's `/config` (`gate`); the code stays fixed and
 * never runs a pattern the server sends.
 *
 * Pure Kotlin, no Android types: `src/test` runs the cases of `contracts/capture-fixtures/phone-gate.json`, the
 * same file the server's tests read.
 */
class CaptureGate(otpWords: Collection<String>, currencyWords: Collection<String>) {
    private val otpWords = otpWords.map(::fold).filter { it.isNotEmpty() }
    private val currencyWords = currencyWords.map(::fold).filter { it.isNotEmpty() }

    /** Why the message is dropped, or null to keep it. */
    fun dropReason(sender: String?, title: String?, text: String, fromMessagingApp: Boolean): String? {
        if (fromMessagingApp && isPersonalSender(sender)) return "personal_sender"
        val folded = fold("${title.orEmpty()} $text")
        if (folded.none { it in '0'..'9' }) return "no_digits"
        val hasCode = CODE.containsMatchIn(folded)
        if (hasCode && otpWords.any { folded.contains(it) } && currencyWords.none { folded.contains(it) }) return "otp"
        return null
    }

    companion object {
        /** Four to eight digits standing alone: a one-time code's shape. */
        private val CODE = Regex("(?<![0-9])[0-9]{4,8}(?![0-9])")

        /** A sender that is a person's phone number: eight digits or more, once spaces and signs are removed. */
        fun isPersonalSender(sender: String?): Boolean {
            if (sender.isNullOrBlank()) return false
            val digits = sender.filterNot { it == ' ' || it == '-' || it == '(' || it == ')' || it == '+' }
            val ascii = asciiDigits(digits)
            return ascii.length >= 8 && ascii.all { it in '0'..'9' }
        }

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

        /** Lower case, ASCII digits and the Arabic letter variants folded, as the server's reader compares words. */
        fun fold(value: String): String = buildString(value.length) {
            for (char in asciiDigits(value).lowercase()) {
                append(
                    when (char) {
                        'أ', 'إ', 'آ', 'ٱ' -> 'ا'
                        'ى' -> 'ي'
                        'ة' -> 'ه'
                        'ؤ' -> 'و'
                        'ئ' -> 'ي'
                        else -> char
                    },
                )
            }
        }
    }
}
