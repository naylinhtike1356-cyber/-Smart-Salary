package com.naylinhtike.salarytracker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class NotificationActionReceiver : BroadcastReceiver() {

    companion object {
        const val ACTION_NOTIFICATION_CLICKED = "com.naylinhtike.salarytracker.NOTIFICATION_CLICKED"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == ACTION_NOTIFICATION_CLICKED) {
            Log.d("NotificationAction", "Reminder dismissed by user click")
            // 1. Acknowledge and Suppress: set the flag to true for today
            ReminderPrefs.setReminderDismissedForToday(context)

            // 2. Launch Add Record screen (MainActivity)
            val openIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                // Passing false for now, could pass an extra if we want MainActivity to act on it
            }
            context.startActivity(openIntent)
        }
    }
}
