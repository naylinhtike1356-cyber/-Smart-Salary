package com.naylinhtike.salarytracker

import android.content.Context
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object ReminderPrefs {
    private const val PREFS_NAME = "smart_reminder_prefs"
    private const val KEY_LAST_DISMISSED_DATE = "last_dismissed_date"

    private fun getTodayDateStr(): String {
        return SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
    }

    /**
     * Set the flag indicating the reminder was dismissed for today.
     * Overwrites any older date with today's real date.
     */
    fun setReminderDismissedForToday(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(KEY_LAST_DISMISSED_DATE, getTodayDateStr()).apply()
    }

    /**
     * Checks if the reminder was already dismissed today.
     * Because we compare against the current real date string,
     * this naturally resets to 'false' at exactly midnight (00:00).
     */
    fun isReminderDismissedToday(context: Context): Boolean {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val lastDismissedDate = prefs.getString(KEY_LAST_DISMISSED_DATE, "")
        return lastDismissedDate == getTodayDateStr()
    }
}
