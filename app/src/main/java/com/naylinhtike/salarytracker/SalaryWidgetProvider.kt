package com.naylinhtike.salarytracker

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import org.json.JSONObject

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
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val jsonStr = prefs.getString(KEY_WIDGET_DATA, null)

        var headerTitle = "လစာမှတ်တမ်း"
        var monthStr = ""
        var daysText = "0 ရက်"
        var hoursText = "0.0 နာရီ"
        var salaryLabel = "ခန့်မှန်းလစာ"
        var salaryAmount = "---"
        var btnTodayText = "⚡ ယနေ့မှတ်တမ်း"
        var btnCopyText = "📋 မနေ့ကလို"

        if (!jsonStr.isNullOrBlank()) {
            runCatching {
                val json = JSONObject(jsonStr)
                headerTitle = json.optString("headerTitle", "လစာမှတ်တမ်း")
                monthStr = json.optString("month", "")
                val workDays = json.optString("workDays", "0")
                val workHours = json.optString("workHours", "0.0")
                val daysUnit = json.optString("daysUnit", "ရက်")
                val hoursUnit = json.optString("hoursUnit", "နာရီ")
                daysText = "$workDays $daysUnit"
                hoursText = "$workHours $hoursUnit"
                salaryLabel = json.optString("salaryLabel", "ခန့်မှန်းလစာ")
                val estSalary = json.optString("estSalary", "")
                salaryAmount = if (estSalary.isNotBlank() && estSalary != "0" && estSalary != "---") "₩ $estSalary" else "---"
                btnTodayText = json.optString("btnToday", "⚡ ယနေ့မှတ်တမ်း")
                btnCopyText = json.optString("btnCopy", "📋 မနေ့ကလို")
            }
        } else {
            val oldSummary = prefs.getString(KEY_SUMMARY, "") ?: ""
            if (oldSummary.isNotBlank()) {
                daysText = oldSummary
            }
        }

        views.setTextViewText(R.id.widget_header_title, headerTitle)
        views.setTextViewText(R.id.widget_month_badge, monthStr.ifBlank { "Smart" })
        views.setTextViewText(R.id.widget_days_text, daysText)
        views.setTextViewText(R.id.widget_hours_text, hoursText)
        views.setTextViewText(R.id.widget_salary_label, salaryLabel)
        views.setTextViewText(R.id.widget_salary_amount, salaryAmount)
        views.setTextViewText(R.id.widget_btn_today_text, btnTodayText)
        views.setTextViewText(R.id.widget_btn_copy_text, btnCopyText)

        // Header click -> open app
        val openAppIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        views.setOnClickPendingIntent(
            R.id.widget_header,
            PendingIntent.getActivity(context, 0, openAppIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        )
        views.setOnClickPendingIntent(
            R.id.widget_stats_container,
            PendingIntent.getActivity(context, 3, openAppIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        )

        // Button 1: Quick Add Today
        val todayIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_QUICK_ADD_TODAY, true)
        }
        views.setOnClickPendingIntent(
            R.id.widget_btn_today,
            PendingIntent.getActivity(context, 1, todayIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        )

        // Button 2: Copy Yesterday
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
        private const val KEY_WIDGET_DATA = "widget_data_json"

        /** Called from app to update full widget data (multilingual) and refresh */
        fun updateDataAndRefresh(context: Context, jsonData: String) {
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_WIDGET_DATA, jsonData)
                .apply()
            refreshAllWidgets(context)
        }

        /** Backward compatibility summary updater */
        fun updateSummaryAndRefresh(context: Context, summaryText: String) {
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_SUMMARY, summaryText)
                .apply()
            refreshAllWidgets(context)
        }

        private fun refreshAllWidgets(context: Context) {
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
