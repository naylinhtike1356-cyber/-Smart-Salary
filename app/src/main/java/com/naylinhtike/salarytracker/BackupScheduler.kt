package com.naylinhtike.salarytracker

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import java.util.Calendar

/**
 * 4.1 - Schedules auto backup at a specific day of month and time (e.g. 31st at 22:00).
 */
object BackupScheduler {
    private const val PREFS_NAME = "backup_scheduler_prefs"
    private const val KEY_ENABLED = "backup_scheduler_enabled"
    private const val KEY_DAY = "backup_day"  // 1-31
    private const val KEY_TIME = "backup_time"  // HH:mm
    const val ACTION_BACKUP = "com.naylinhtike.salarytracker.AUTO_BACKUP_ALARM"
    private const val REQUEST_CODE = 1002

    fun schedule(context: Context, enabled: Boolean, dayOfMonth: Int, timeHHmm: String) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().apply {
            putBoolean(KEY_ENABLED, enabled)
            putInt(KEY_DAY, dayOfMonth.coerceIn(1, 31))
            putString(KEY_TIME, timeHHmm.takeIf { it.isNotBlank() } ?: "22:00")
            apply()
        }

        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
        val intent = Intent(context, BackupReceiver::class.java).apply { action = ACTION_BACKUP }
        val pendingIntent = PendingIntent.getBroadcast(
            context, REQUEST_CODE, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        if (!enabled) {
            alarmManager?.cancel(pendingIntent)
            return
        }

        val parts = (timeHHmm.ifBlank { "22:00" }).split(":")
        val hour = parts.getOrNull(0)?.toIntOrNull() ?: 22
        val minute = parts.getOrNull(1)?.toIntOrNull() ?: 0
        val day = dayOfMonth.coerceIn(1, 31)

        val cal = Calendar.getInstance().apply {
            set(Calendar.DAY_OF_MONTH, day)
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
            if (timeInMillis <= System.currentTimeMillis()) add(Calendar.MONTH, 1)
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                alarmManager?.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.timeInMillis, pendingIntent)
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager?.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.timeInMillis, pendingIntent)
            } else {
                alarmManager?.setExact(AlarmManager.RTC_WAKEUP, cal.timeInMillis, pendingIntent)
            }
        } catch (e: Exception) {
            alarmManager?.set(AlarmManager.RTC_WAKEUP, cal.timeInMillis, pendingIntent)
        }
    }

    fun rescheduleNextMonth(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (!prefs.getBoolean(KEY_ENABLED, false)) return
        val day = prefs.getInt(KEY_DAY, 31)
        val time = prefs.getString(KEY_TIME, "22:00") ?: "22:00"
        schedule(context, true, day, time)
    }

    fun scheduleFromPrefs(context: Context) = rescheduleNextMonth(context)
}
