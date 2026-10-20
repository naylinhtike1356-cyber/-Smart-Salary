package com.naylinhtike.salarytracker

import android.content.Context
import com.google.android.gms.auth.api.signin.GoogleSignIn
import java.io.File
import java.security.MessageDigest

object AccountStorage {
    private const val LEGACY_BACKUP_FILE = "salary_backup_pending.json"
    private const val BASIC_BACKUP_FILE = "salary_backup_pending_basic.json"

    fun currentUserId(context: Context): String? =
        GoogleSignIn.getLastSignedInAccount(context)?.id?.takeIf { it.isNotBlank() }

    fun currentScope(context: Context): String {
        val entryMode = context.getSharedPreferences("smart_reminder_prefs", Context.MODE_PRIVATE)
            .getString("entry_mode", "NONE")
        if (entryMode != "FULL") return "basic"
        return currentUserId(context)?.let { "user_${hash(it).take(24)}" } ?: "basic"
    }

    fun currentBackupFile(context: Context): File =
        File(context.filesDir, "salary_backup_pending_${currentScope(context)}.json")

    fun migrateLegacyBackupToBasic(context: Context) {
        val legacy = File(context.filesDir, LEGACY_BACKUP_FILE)
        if (!legacy.exists()) return

        val basic = File(context.filesDir, BASIC_BACKUP_FILE)
        if (!basic.exists()) legacy.copyTo(basic)
        legacy.delete()
    }

    private fun hash(value: String): String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it) }
}
