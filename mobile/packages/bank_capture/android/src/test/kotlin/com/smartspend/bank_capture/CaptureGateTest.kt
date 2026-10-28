package com.smartspend.bank_capture

import java.io.File
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.json.JSONObject
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory

/** The phone's filter against the cases the server's tests read too (contracts/capture-fixtures/phone-gate.json). */
class CaptureGateTest {
    private val fixture: JSONObject by lazy {
        // Gradle runs the tests from this module's folder: android/ of the bank_capture package.
        val file = generateSequence(File("").absoluteFile) { it.parentFile }
            .map { File(it, "contracts/capture-fixtures/phone-gate.json") }
            .first { it.exists() }
        JSONObject(file.readText())
    }

    private fun words(name: String): List<String> {
        val list = fixture.getJSONArray(name)
        return (0 until list.length()).map { list.getString(it) }
    }

    @TestFactory
    fun `drops what the shared cases drop and keeps the rest`(): List<DynamicTest> {
        val gate = CaptureGate(words("otpWords"), words("currencyWords"))
        val cases = fixture.getJSONArray("cases")
        return (0 until cases.length()).map { index ->
            val case = cases.getJSONObject(index)
            DynamicTest.dynamicTest(case.getString("name")) {
                val reason = gate.dropReason(
                    sender = case.optString("sender").takeIf { case.has("sender") },
                    title = case.optString("title").takeIf { case.has("title") },
                    text = case.getString("text"),
                    fromMessagingApp = case.getBoolean("messaging"),
                )
                val expected = if (case.isNull("drop")) null else case.getString("drop")
                assertEquals(expected, reason)
            }
        }
    }

    @Test
    fun `reads Arabic digits and letter variants the way the server does`() {
        assertEquals("0123456789", CaptureGate.asciiDigits("٠١٢٣٤٥٦٧٨٩"))
        assertEquals("كلمه السر", CaptureGate.fold("كلمة السر"))
    }

    @Test
    fun `takes only a long number for a person`() {
        assertTrue(CaptureGate.isPersonalSender("01001234567"))
        assertTrue(CaptureGate.isPersonalSender("٠١٠٠١٢٣٤٥٦٧"))
        assertFalse(CaptureGate.isPersonalSender("19019"))
        assertFalse(CaptureGate.isPersonalSender("CIB"))
        assertFalse(CaptureGate.isPersonalSender(null))
    }
}
