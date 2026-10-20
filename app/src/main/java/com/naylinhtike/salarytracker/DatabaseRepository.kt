package com.naylinhtike.salarytracker

import android.content.Context
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object DatabaseRepository {

    /**
     * Checks if a record exists for today in the active account's backup JSON file.
     */
    fun hasRecordForToday(context: Context): Boolean {
        return try {
            val file = AccountStorage.currentBackupFile(context)
            if (!file.exists()) return false

            val jsonString = file.readText(Charsets.UTF_8)
            if (jsonString.isBlank()) return false

            val jsonObject = JSONObject(jsonString)
            val timeData = jsonObject.optJSONArray("timeData") ?: return false

            val todayFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US)
            val todayStr = todayFormat.format(Date())

            for (i in 0 until timeData.length()) {
                val entry = timeData.optJSONObject(i) ?: continue
                val date = entry.optString("date", "")
                val type = entry.optString("type", "")
                
                // Only consider "work" records. If it's a paid leave or something else, 
                // the user might still need to add work record? Usually the app counts any record 
                // (base, ot, paid_leave) as a logged day.
                // The web app checks "has work" as: includes 'base' or includes 'ot'
                if (date == todayStr && (type.contains("base") || type.contains("ot") || type.contains("night"))) {
                    return true
                }
            }
            false
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }
}
