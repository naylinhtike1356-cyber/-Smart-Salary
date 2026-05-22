package com.naylinhtike.salarytracker

import android.content.Context
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.Calendar
import java.util.concurrent.TimeUnit

object ReminderScheduler {
    private const val PREFS_NAME = "reminder_prefs"
    private const val KEY_ENABLED = "reminder_enabled"
    private const val KEY_TIME = "reminder_time"  // HH:mm
    const val WORK_NAME = "DailyReminderWork"
    const val ACTION_REMINDER = "com.naylinhtike.salarytracker.REMINDER_ALARM"

    fun schedule(context: Context, enabled: Boolean, timeHHmm: String) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().apply {
            putBoolean(KEY_ENABLED, enabled)
            putString(KEY_TIME, timeHHmm.takeIf { it.isNotBlank() } ?: "18:00")
            apply()
        }

        val workManager = WorkManager.getInstance(context)

        if (!enabled) {
            workManager.cancelUniqueWork(WORK_NAME)
            return
        }

        val parts = (timeHHmm.ifBlank { "18:00" }).split(":")
        val hour = parts.getOrNull(0)?.toIntOrNull() ?: 18
        val minute = parts.getOrNull(1)?.toIntOrNull() ?: 0

        val now = Calendar.getInstance()
        val target = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }

        if (target.timeInMillis <= now.timeInMillis) {
            target.add(Calendar.DAY_OF_MONTH, 1)
        }

        val initialDelay = target.timeInMillis - now.timeInMillis

        val workRequest = PeriodicWorkRequestBuilder<ReminderWorker>(24, TimeUnit.HOURS)
            .setInitialDelay(initialDelay, TimeUnit.MILLISECONDS)
            .build()

        workManager.enqueueUniquePeriodicWork(
            WORK_NAME,
            ExistingPeriodicWorkPolicy.CANCEL_AND_REENQUEUE,
            workRequest
        )
    }

    fun scheduleFromPrefs(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(KEY_ENABLED, false)) return
        schedule(context, true, prefs.getString(KEY_TIME, "18:00") ?: "18:00")
    }
}
