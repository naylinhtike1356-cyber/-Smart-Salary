package com.naylinhtike.salarytracker

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.MediaStore
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import java.io.File
import java.io.OutputStream

/**
 * 4.1 - When auto-backup alarm fires, saves the stored backup copy to Downloads.
 */
class BackupReceiver : BroadcastReceiver() {

    companion object {
        const val CHANNEL_ID = "backup_channel"
        const val NOTIFICATION_ID = 1002
        private const val BACKUP_FILE_NAME = "salary_backup_pending.json"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != BackupScheduler.ACTION_BACKUP) return

        val backupFile = File(context.filesDir, BACKUP_FILE_NAME)
        if (!backupFile.exists()) {
            createNotificationChannel(context)
            val openIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val pendingIntent = PendingIntent.getActivity(
                context, 0, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val notification = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_menu_save)
                .setContentTitle("လစာမှတ်တမ်း")
                .setContentText("Auto backup: မှတ်တမ်းများ မရှိသေးပါ။ အက်ပ်ဖွင့်ပြီး မှတ်တမ်းထည့်ပါ။")
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .build()
            try { NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification) } catch (_: SecurityException) {}
            BackupScheduler.rescheduleNextMonth(context)
            return
        }

        val jsonData = backupFile.readText(Charsets.UTF_8)
        val filename = "daily-salary-backup-${java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date())}.json"

        val saved = runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = android.content.ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                    put(MediaStore.MediaColumns.MIME_TYPE, "application/json")
                }
                val uri = context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                uri?.let {
                    context.contentResolver.openOutputStream(uri)?.use { out: OutputStream ->
                        out.write(jsonData.toByteArray(Charsets.UTF_8))
                    }
                    true
                } ?: false
            } else {
                val downloadsDir = android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS)
                File(downloadsDir, filename).writeText(jsonData, Charsets.UTF_8)
                true
            }
        }.getOrDefault(false)

        createNotificationChannel(context)
        val openIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context, 0, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_save)
            .setContentTitle("လစာမှတ်တမ်း")
            .setContentText(if (saved) "Auto backup ပြီးပါပြီ: $filename" else "Auto backup မအောင်မြင်ပါ။")
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()
        try { NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification) } catch (_: SecurityException) {}

        BackupScheduler.rescheduleNextMonth(context)
    }

    private fun createNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Auto Backup",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply { description = "Auto backup သတိပေးချက်" }
            (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .createNotificationChannel(channel)
        }
    }
}
