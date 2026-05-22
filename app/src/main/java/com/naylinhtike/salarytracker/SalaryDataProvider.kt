package com.naylinhtike.salarytracker

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Intent
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri

/**
 * ContentProvider for VoiceBrainLive to query SalaryTracker data and trigger actions via voice.
 *
 * Query URI: content://com.naylinhtike.salarytracker.voiceprovider/salary
 *   Returns: 1 row, column "data" = full JSON string
 *
 * Insert URI: content://com.naylinhtike.salarytracker.voiceprovider/actions
 *   ContentValues: "action" = "quick_add_today" | "copy_yesterday"
 *   Starts MainActivity to run the action (same as widget buttons).
 */
class SalaryDataProvider : ContentProvider() {

    override fun onCreate(): Boolean = true

    override fun query(
        uri: Uri,
        projection: Array<out String>?,
        selection: String?,
        selectionArgs: Array<out String>?,
        sortOrder: String?
    ): Cursor? {
        if (uri.path != "/salary") return null
        val file = context?.filesDir?.let { java.io.File(it, "salary_backup_pending.json") } ?: return null
        val json = runCatching { file.readText(Charsets.UTF_8) }.getOrNull() ?: return null
        if (json.isBlank()) return null
        val cursor = MatrixCursor(arrayOf("data"))
        cursor.addRow(arrayOf(json))
        return cursor
    }

    override fun getType(uri: Uri): String? = when (uri.path) {
        "/salary" -> "application/json"
        "/actions" -> "vnd.android.cursor.item/salary-action"
        else -> null
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? {
        if (uri.path != "/actions" || values == null) return null
        val action = values.getAsString("action") ?: return null
        val ctx = context ?: return null
        val intent = Intent(ctx, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            when (action) {
                "quick_add_today" -> putExtra(SalaryWidgetProvider.EXTRA_QUICK_ADD_TODAY, true)
                "copy_yesterday" -> putExtra(SalaryWidgetProvider.EXTRA_COPY_YESTERDAY, true)
                else -> return null
            }
        }
        ctx.startActivity(intent)
        return Uri.withAppendedPath(Uri.parse("content://$AUTHORITY/actions"), action)
    }
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0
    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int = 0

    companion object {
        const val AUTHORITY = "com.naylinhtike.salarytracker.voiceprovider"
        val CONTENT_URI: Uri = Uri.parse("content://$AUTHORITY/salary")
    }
}
