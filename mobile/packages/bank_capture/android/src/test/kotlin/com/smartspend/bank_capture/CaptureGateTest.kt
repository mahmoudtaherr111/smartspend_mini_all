package com.smartspend.bank_capture

import java.io.File
import kotlin.test.assertEquals
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

    private fun keywords(): List<String> {
        val list = fixture.getJSONArray("keywords")
        return (0 until list.length()).map { list.getString(it) }
    }

    @TestFactory
    fun `keeps what the shared cases keep and nothing else`(): List<DynamicTest> {
        val gate = CaptureGate(keywords())
        val cases = fixture.getJSONArray("cases")
        return (0 until cases.length()).map { index ->
            val case = cases.getJSONObject(index)
            DynamicTest.dynamicTest(case.getString("name")) {
                val kept = gate.keeps(case.optString("title").takeIf { case.has("title") }, case.getString("text"))
                assertEquals(case.getBoolean("keep"), kept)
            }
        }
    }

    @Test
    fun `the build's own list is the shared list`() {
        assertEquals(keywords(), CaptureGate.DEFAULT_KEYWORDS)
    }

    @Test
    fun `an empty list from the server falls back to the build's own`() {
        assertTrue(CaptureGate(emptyList()).keeps(null, "تم خصم 75 جنيه"))
    }

    @Test
    fun `reads Arabic digits and letter variants the way the server does`() {
        assertEquals("0123456789", CaptureGate.asciiDigits("٠١٢٣٤٥٦٧٨٩"))
        assertEquals("اضافه", CaptureGate.fold("إضافة"))
        assertEquals("تحويل", CaptureGate.fold("تَحْوِيل"))
    }
}
