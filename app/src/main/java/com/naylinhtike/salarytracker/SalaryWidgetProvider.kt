package com.naylinhtike.salarytracker

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

class SalaryWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId)
        }
    }

    internal fun updateWidget(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetId: Int
    ) {
        val views = RemoteViews(context.packageName, R.layout.widget_salary)

        // Summary from prefs (updated by app)
        val summary = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(KEY_SUMMARY, "---") ?: "---"
        views.setTextViewText(R.id.widget_summary, summary)

        // Header click -> open app
        val openAppIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        views.setOnClickPendingIntent(
            R.id.widget_header,
            PendingIntent.getActivity(context, 0, openAppIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        )

        // Button 1: ယနေ့မှတ်တမ်း
        val todayIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_QUICK_ADD_TODAY, true)
        }
        views.setOnClickPendingIntent(
            R.id.widget_btn_today,
            PendingIntent.getActivity(context, 1, todayIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        )

        // Button 2: မနေ့ကလို ထည့်မယ်
        val copyIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_COPY_YESTERDAY, true)
        }
        views.setOnClickPendingIntent(
            R.id.widget_btn_copy,
            PendingIntent.getActivity(context, 2, copyIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        )

        appWidgetManager.updateAppWidget(appWidgetId, views)
    }

    companion object {
        const val EXTRA_QUICK_ADD_TODAY = "com.naylinhtike.salarytracker.QUICK_ADD_TODAY"
        const val EXTRA_COPY_YESTERDAY = "com.naylinhtike.salarytracker.COPY_YESTERDAY"
        private const val PREFS_NAME = "widget_prefs"
        private const val KEY_SUMMARY = "monthly_summary"

        /** Called from app to save summary and refresh all widget instances */
        fun updateSummaryAndRefresh(context: Context, summaryText: String) {
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_SUMMARY, summaryText)
                .apply()
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val ids = appWidgetManager.getAppWidgetIds(ComponentName(context, SalaryWidgetProvider::class.java))
            if (ids.isNotEmpty()) {
                val provider = SalaryWidgetProvider()
                for (id in ids) {
                    provider.updateWidget(context, appWidgetManager, id)
                }
            }
        }
    }
}
