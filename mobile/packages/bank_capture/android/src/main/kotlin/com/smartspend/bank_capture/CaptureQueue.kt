package com.smartspend.bank_capture

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.util.UUID

/** One captured notification waiting to be sent. The text exists only here, encrypted, until the server answers. */
internal data class QueuedSignal(
    val id: String,
    val owner: String,
    val channel: String,
    val app: String?,
    val sender: String?,
    val title: String?,
    val text: String,
    val postedAt: Long,
    /** Read from the inbox by an import, not as it arrived: sent after live messages, and the server posts no notice. */
    val imported: Boolean = false,
)

/**
 * The waiting signals and the notifications already seen, in the framework's SQLite (no code generation). A signal
 * leaves when the server gives it a result; one older than 30 days is dropped, as the server would refuse it.
 */
internal class CaptureQueue(context: Context) : SQLiteOpenHelper(context, "smartspend_capture.db", null, 3) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            "CREATE TABLE signals (id TEXT PRIMARY KEY, owner TEXT NOT NULL, channel TEXT NOT NULL, app TEXT, " +
                "sender TEXT, title BLOB, text BLOB NOT NULL, posted_at INTEGER NOT NULL, imported INTEGER NOT NULL DEFAULT 0)",
        )
        db.execSQL("CREATE TABLE seen (identity TEXT PRIMARY KEY, at INTEGER NOT NULL)")
        createNotices(db)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) createNotices(db)
        if (oldVersion < 3) db.execSQL("ALTER TABLE signals ADD COLUMN imported INTEGER NOT NULL DEFAULT 0")
    }

    private fun createNotices(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE IF NOT EXISTS shown_notices (owner TEXT NOT NULL, notice_id INTEGER NOT NULL, acked INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL, PRIMARY KEY(owner, notice_id))")
    }

    fun wasShown(owner: String, id: Long): Boolean = readableDatabase.query("shown_notices", arrayOf("notice_id"), "owner = ? AND notice_id = ?", arrayOf(owner, id.toString()), null, null, null).use { it.moveToFirst() }
    fun noteShown(owner: String, id: Long) {
        writableDatabase.insertWithOnConflict("shown_notices", null, ContentValues().apply { put("owner", owner); put("notice_id", id); put("at", System.currentTimeMillis()); put("acked", 0) }, SQLiteDatabase.CONFLICT_IGNORE)
    }
    fun pendingAcknowledgements(owner: String): List<Long> {
        val ids = mutableListOf<Long>()
        readableDatabase.query("shown_notices", arrayOf("notice_id"), "owner = ? AND acked = 0", arrayOf(owner), null, null, "at ASC", "20").use { while (it.moveToNext()) ids.add(it.getLong(0)) }
        return ids
    }
    fun acknowledge(owner: String, ids: List<Long>) {
        for (id in ids) writableDatabase.update("shown_notices", ContentValues().apply { put("acked", 1) }, "owner = ? AND notice_id = ?", arrayOf(owner, id.toString()))
    }

    /**
     * Notes a notification's identity. False when it was seen before: the system posts the same notification again
     * when it is updated, and that is not a second payment.
     */
    fun firstSight(identity: String, now: Long = System.currentTimeMillis()): Boolean {
        val row = ContentValues().apply {
            put("identity", identity)
            put("at", now)
        }
        return writableDatabase.insertWithOnConflict("seen", null, row, SQLiteDatabase.CONFLICT_IGNORE) != -1L
    }

    fun add(owner: String, channel: String, app: String?, sender: String?, title: String?, text: String, postedAt: Long, imported: Boolean = false) {
        val row = ContentValues().apply {
            put("id", UUID.randomUUID().toString().replace("-", ""))
            put("owner", owner)
            put("channel", channel)
            put("app", app)
            put("sender", sender)
            put("title", title?.let { CaptureCipher.encrypt(it) })
            put("text", CaptureCipher.encrypt(text))
            put("posted_at", postedAt)
            put("imported", if (imported) 1 else 0)
        }
        writableDatabase.insert("signals", null, row)
    }

    /** The oldest waiting signals of [owner]; a row that cannot be decrypted is removed. */
    fun oldest(owner: String, limit: Int): List<QueuedSignal> {
        val unreadable = mutableListOf<String>()
        val signals = mutableListOf<QueuedSignal>()
        readableDatabase.query(
            "signals", arrayOf("id", "channel", "app", "sender", "title", "text", "posted_at", "imported"),
            // Live messages first: an import of past months never delays a payment made now.
            "owner = ?", arrayOf(owner), null, null, "imported ASC, posted_at ASC", limit.toString(),
        ).use { cursor ->
            while (cursor.moveToNext()) {
                val id = cursor.getString(0)
                val text = CaptureCipher.decrypt(cursor.getBlob(5))
                if (text == null) {
                    unreadable.add(id)
                    continue
                }
                signals.add(
                    QueuedSignal(
                        id = id,
                        owner = owner,
                        channel = cursor.getString(1),
                        app = cursor.getString(2),
                        sender = cursor.getString(3),
                        title = if (cursor.isNull(4)) null else CaptureCipher.decrypt(cursor.getBlob(4)),
                        text = text,
                        postedAt = cursor.getLong(6),
                        imported = cursor.getInt(7) == 1,
                    ),
                )
            }
        }
        remove(unreadable)
        return signals
    }

    fun remove(ids: Collection<String>) {
        if (ids.isEmpty()) return
        val db = writableDatabase
        db.beginTransaction()
        try {
            for (id in ids) db.delete("signals", "id = ?", arrayOf(id))
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    fun count(): Long = readableDatabase.compileStatement("SELECT COUNT(*) FROM signals").simpleQueryForLong()

    /** Forgets signals of other accounts and anything too old to be accepted, and identities seen two days ago. */
    fun prune(owner: String?, now: Long = System.currentTimeMillis()) {
        val db = writableDatabase
        db.delete("signals", "posted_at < ?", arrayOf((now - MAX_AGE_MS).toString()))
        if (owner != null) db.delete("signals", "owner <> ?", arrayOf(owner))
        db.delete("seen", "at < ?", arrayOf((now - SEEN_MS).toString()))
        db.delete("shown_notices", "at < ?", arrayOf((now - MAX_AGE_MS).toString()))
    }

    fun clear() {
        val db = writableDatabase
        db.delete("signals", null, null)
        db.delete("seen", null, null)
        db.delete("shown_notices", null, null)
    }

    private companion object {
        const val MAX_AGE_MS = 30L * 24 * 3600 * 1000
        const val SEEN_MS = 48L * 3600 * 1000
    }
}
