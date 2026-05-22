package com.naylinhtike.salarytracker

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.Worker
import androidx.work.WorkerParameters

class ReminderWorker(context: Context, workerParams: WorkerParameters) : Worker(context, workerParams) {

    companion object {
        const val NOTIFICATION_ID = 1001
        const val CHANNEL_ID = "salary_reminder_channel"
    }

    override fun doWork(): Result {
        // --- SMART CONDITIONAL LOGIC ---
        if (ReminderPrefs.isReminderDismissedToday(applicationContext)) {
            return Result.success()
        }

        if (DatabaseRepository.hasRecordForToday(applicationContext)) {
            return Result.success()
        }

        createNotificationChannel()

        val actionIntent = Intent(applicationContext, NotificationActionReceiver::class.java).apply {
            action = NotificationActionReceiver.ACTION_NOTIFICATION_CLICKED
        }
        val pendingIntent = PendingIntent.getBroadcast(
            applicationContext, 0, actionIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(applicationContext, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("လစာမှတ်တမ်း")
            .setContentText("ယနေ့ အလုပ်မှတ်တမ်း ထည့်ပြီးပြီလား?")
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()

        try {
            NotificationManagerCompat.from(applicationContext).notify(NOTIFICATION_ID, notification)
        } catch (_: SecurityException) {}

        return Result.success()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "နေ့စဉ် သတိပေးချက်",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply { description = "ယနေ့မှတ်တမ်း ထည့်ပြီးပြီလား သတိပေးချက်" }
            (applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .createNotificationChannel(channel)
        }
    }
}
