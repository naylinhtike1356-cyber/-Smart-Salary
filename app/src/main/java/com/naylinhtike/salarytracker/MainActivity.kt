package com.naylinhtike.salarytracker

import android.graphics.Color
import com.google.firebase.analytics.FirebaseAnalytics
import com.google.firebase.analytics.ktx.analytics
import com.google.firebase.ktx.Firebase

import android.Manifest
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.File
import java.io.OutputStream
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import com.google.android.gms.auth.api.signin.GoogleSignIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import android.widget.Toast
import com.google.android.gms.common.api.ApiException
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

class MainActivity : AppCompatActivity() {

    private var webView: WebView? = null
    private var uploadMessage: ValueCallback<Array<Uri>>? = null
    private var pendingCameraPhotoUri: Uri? = null
    private var pendingQuickAddToday = false
    private var pendingCopyYesterday = false
    private var pageLoaded = false
    private var updateDownloadId: Long = -1L
    private var pendingInstallUri: Uri? = null
    private var checkedVersionCode = 0
    private var installerOffered = false
    private var latestApkUrl: String? = null
    private var latestApkSha256: String? = null
    private var latestVersionName: String? = null
    private lateinit var googleDriveHelper: GoogleDriveHelper
    private lateinit var firebaseAnalytics: FirebaseAnalytics

    companion object {
        // Android releases are independent of the WebApp / Vercel deployment.
        private const val RELEASE_METADATA_URL = "https://api.github.com/repos/naylinhtike1356-cyber/-Smart-Salary/releases/latest"
        private const val RELEASE_APK_ORIGIN = "https://github.com/naylinhtike1356-cyber/-Smart-Salary/releases/download/"
        private const val UPDATE_PREFS = "app_update_prefs"
        private const val UPDATE_APK_FILE = "SmartSalaryTracker-update.apk"
    }

    private val signInLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val task = GoogleSignIn.getSignedInAccountFromIntent(result.data)
        try {
            val account = task.getResult(ApiException::class.java)
            if (account != null) {
                getSharedPreferences("smart_reminder_prefs", Context.MODE_PRIVATE)
                    .edit().putString("entry_mode", "FULL").apply()
                // Firebase: Set Hashed User ID for Privacy (Prevent PII in Analytics)
                firebaseAnalytics.setUserId(hashString(account.id ?: "anonymous"))
                
                logCustomEvent(FirebaseAnalytics.Event.LOGIN, Bundle().apply {
                    putString(FirebaseAnalytics.Param.METHOD, "google")
                })
                
                Toast.makeText(this, "Google Sign-In successful", Toast.LENGTH_SHORT).show()
                webView?.reload() // Reload the page to reflect signed-in state
            }
        } catch (e: ApiException) {
            logCustomEvent("google_sign_in_failed", Bundle().apply {
                putLong("status_code", e.statusCode.toLong())
            })
            val message = when (e.statusCode) {
                12501 -> "Google sign-in cancelled. Tap Sign in to choose an account again."
                7 -> "Google sign-in needs an internet connection. Please try again."
                10 -> "Google sign-in configuration error (10). Check this APK's package name and signing SHA-1 in Firebase / Google Cloud."
                else -> "Google sign-in failed (${e.statusCode}). Please try again."
            }
            Toast.makeText(this, message, Toast.LENGTH_LONG).show()
        }
    }

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { _ -> }

    private val installPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        val uri = pendingInstallUri
        pendingInstallUri = null
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || packageManager.canRequestPackageInstalls()) {
            if (uri != null) launchPackageInstaller(uri)
            else installerOffered = false
        } else {
            notifyUpdateStatus("error", "Smart Salary ကို APK တပ်ဆင်ခွင့်ပေးပြီး ပြန်စမ်းပါ။")
            installerOffered = true
        }
    }

    private val filePickerLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (uploadMessage == null) return@registerForActivityResult
        val picked = WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
        val results = if (result.resultCode == RESULT_OK) {
            picked ?: pendingCameraPhotoUri?.let { arrayOf(it) }
        } else null
        uploadMessage?.onReceiveValue(results)
        uploadMessage = null
        pendingCameraPhotoUri = null
    }

    private fun logCustomEvent(eventName: String, params: Bundle? = null) {
        firebaseAnalytics.logEvent(eventName, params)
    }

    private fun hashString(input: String): String {
        return MessageDigest.getInstance("SHA-256")
            .digest(input.toByteArray())
            .joinToString("") { "%02x".format(it) }
    }

    private fun checkForAppUpdate() {
        lifecycleScope.launch {
            val result = withContext(Dispatchers.IO) {
                runCatching {
                    val connection = (URL(RELEASE_METADATA_URL).openConnection() as HttpURLConnection).apply {
                        requestMethod = "GET"
                        connectTimeout = 15_000
                        readTimeout = 15_000
                        useCaches = false
                        instanceFollowRedirects = false
                        setRequestProperty("Accept", "application/json")
                        setRequestProperty("Cache-Control", "no-cache")
                    }
                    try {
                        if (connection.responseCode != HttpURLConnection.HTTP_OK) {
                            error("Update server returned ${connection.responseCode}")
                        }
                        val github = connection.inputStream.bufferedReader().use { JSONObject(it.readText()) }
                        val tag = github.getString("tag_name")
                        require(Regex("^v[0-9]+\\.[0-9]+\\.[0-9]+$").matches(tag)) { "Invalid mobile version tag" }
                        val version = tag.removePrefix("v")
                        val releaseBody = github.optString("body", "")
                        val versionCode = Regex("Version code:\\s*([0-9]+)", RegexOption.IGNORE_CASE)
                            .find(releaseBody)?.groupValues?.get(1)?.toIntOrNull()
                            ?: error("Missing Android version code in GitHub release")
                        val filename = "SmartSalaryTracker-$version.apk"
                        val assets = github.getJSONArray("assets")
                        val asset = (0 until assets.length()).asSequence().map { assets.getJSONObject(it) }
                            .firstOrNull { it.optString("name") == filename }
                            ?: error("Android APK not published for $tag")
                        val apkUrl = asset.getString("browser_download_url")
                        require(apkUrl == RELEASE_APK_ORIGIN + "$tag/$filename") { "Untrusted Android release URL" }
                        val assetDigest = asset.optString("digest", "").removePrefix("sha256:").lowercase()
                        val sha256 = if (assetDigest.matches(Regex("[0-9a-f]{64}"))) assetDigest else
                            Regex("APK SHA-256:\\s*([0-9a-fA-F]{64})", RegexOption.IGNORE_CASE)
                                .find(releaseBody)?.groupValues?.get(1)?.lowercase()
                                ?: error("Missing verified APK SHA-256")
                        require(sha256.matches(Regex("[0-9a-f]{64}"))) { "Invalid APK checksum" }
                        val release = JSONObject()
                            .put("versionCode", versionCode)
                            .put("versionName", version)
                            .put("apkUrl", apkUrl)
                            .put("sha256", sha256)
                        release.put("updateAvailable", versionCode > BuildConfig.VERSION_CODE)
                        release.put("currentVersionCode", BuildConfig.VERSION_CODE)
                        release.put("currentVersionName", BuildConfig.VERSION_NAME)
                        release
                    } finally {
                        connection.disconnect()
                    }
                }
            }

            result.onSuccess { release ->
                checkedVersionCode = release.getInt("versionCode")
                latestApkUrl = release.getString("apkUrl")
                latestApkSha256 = release.getString("sha256").lowercase()
                latestVersionName = release.getString("versionName")
                webView?.evaluateJavascript(
                    "if(window.onUpdateCheckResult)window.onUpdateCheckResult(true,$release);",
                    null
                )
            }.onFailure { error ->
                checkedVersionCode = 0
                latestApkUrl = null
                latestApkSha256 = null
                val message = error.message ?: "Update check failed"
                webView?.evaluateJavascript(
                    "if(window.onUpdateCheckResult)window.onUpdateCheckResult(false,${JSONObject.quote(message)});",
                    null
                )
            }
        }
    }

    private fun downloadLatestUpdate() {
        val apkUrl = latestApkUrl
        val sha256 = latestApkSha256
        if (apkUrl == null || sha256 == null || checkedVersionCode <= BuildConfig.VERSION_CODE) {
            Toast.makeText(this, "Check for updates first.", Toast.LENGTH_SHORT).show()
            checkForAppUpdate()
            return
        }

        val prefs = getSharedPreferences(UPDATE_PREFS, Context.MODE_PRIVATE)
        val manager = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        if (updateDownloadId > 0 && prefs.getString("sha256", null) == sha256) {
            installerOffered = false
            notifyUpdateStatus("downloading", "Resuming update")
            return
        }
        runCatching {
            if (updateDownloadId > 0) manager.remove(updateDownloadId)
            updateDownloadId = -1L
            prefs.edit().remove("download_id").apply()
            installerOffered = false
            getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)?.let { File(it, UPDATE_APK_FILE).delete() }
            val request = DownloadManager.Request(Uri.parse(apkUrl))
                .setTitle("Smart Salary Tracker ${latestVersionName ?: "Update"}")
                .setDescription("Downloading verified app update")
                .setMimeType("application/vnd.android.package-archive")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                .addRequestHeader("Cache-Control", "no-cache")
                .setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, UPDATE_APK_FILE)
                .setAllowedOverMetered(true)
                .setAllowedOverRoaming(false)

            updateDownloadId = manager.enqueue(request)
            prefs.edit().putLong("download_id", updateDownloadId)
                .putString("sha256", sha256)
                .putInt("download_version", checkedVersionCode)
                .apply()
            notifyUpdateStatus("downloading", "Update download started")
        }.onFailure { notifyUpdateStatus("error", it.message ?: "Update download failed") }
    }

    private suspend fun verifyAndInstallUpdate(downloadId: Long) {
        val prefs = getSharedPreferences(UPDATE_PREFS, Context.MODE_PRIVATE)
        val expectedHash = prefs.getString("sha256", null)
        val expectedVersion = prefs.getInt("download_version", 0)
        val result = withContext(Dispatchers.IO) {
            runCatching {
                val manager = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                manager.query(DownloadManager.Query().setFilterById(downloadId)).use { cursor ->
                    require(cursor.moveToFirst()) { "Downloaded update was not found" }
                    val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
                    if (status == DownloadManager.STATUS_FAILED) {
                        val reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON))
                        error("Update download failed ($reason)")
                    }
                    if (status != DownloadManager.STATUS_SUCCESSFUL) return@runCatching null
                }
                val uri = manager.getUriForDownloadedFile(downloadId)
                    ?: error("Downloaded APK cannot be opened")
                val apkFile = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
                    ?.let { File(it, UPDATE_APK_FILE) }
                    ?: error("Update storage is unavailable")
                require(apkFile.isFile) { "Downloaded APK file was not found" }
                val digest = MessageDigest.getInstance("SHA-256")
                apkFile.inputStream().use { input ->
                    val buffer = ByteArray(8192)
                    while (true) {
                        val count = input.read(buffer)
                        if (count <= 0) break
                        digest.update(buffer, 0, count)
                    }
                }
                val actual = digest.digest().joinToString("") { "%02x".format(it) }
                require(actual.equals(expectedHash, ignoreCase = true)) {
                    "APK security verification failed"
                }
                validateDownloadedPackage(apkFile, expectedVersion)
                uri
            }
        }

        if (downloadId != updateDownloadId) return
        result.onSuccess { uri ->
            if (uri != null) {
                installerOffered = true
                requestPackageInstall(uri)
            }
        }.onFailure { error ->
            runCatching { (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).remove(downloadId) }
            updateDownloadId = -1L
            prefs.edit().remove("download_id").apply()
            val message = error.message ?: "Update verification failed"
            notifyUpdateStatus("error", message)
            Toast.makeText(this@MainActivity, message, Toast.LENGTH_LONG).show()
        }
    }

    private fun requestPackageInstall(uri: Uri) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !packageManager.canRequestPackageInstalls()) {
            pendingInstallUri = uri
            notifyUpdateStatus("permission", "Smart Salary ကို APK တပ်ဆင်ခွင့်ပေးပါ။")
            runCatching {
                installPermissionLauncher.launch(
                    Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName"))
                )
            }.onFailure { notifyUpdateStatus("error", it.message ?: "Cannot open installation settings") }
            return
        }
        launchPackageInstaller(uri)
    }

    @Suppress("DEPRECATION")
    private fun validateDownloadedPackage(apkFile: File, expectedVersion: Int) {
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            PackageManager.GET_SIGNING_CERTIFICATES
        } else {
            PackageManager.GET_SIGNATURES
        }
        val archiveInfo = packageManager.getPackageArchiveInfo(apkFile.absolutePath, flags)
            ?: error("Downloaded file is not a valid Android app")
        require(archiveInfo.packageName == packageName) { "Update package does not match this app" }

        val archiveVersion = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            archiveInfo.longVersionCode
        } else {
            archiveInfo.versionCode.toLong()
        }
        require(archiveVersion > BuildConfig.VERSION_CODE.toLong()) { "Update version is not newer" }
        require(expectedVersion == 0 || archiveVersion == expectedVersion.toLong()) { "APK version differs from the release" }

        val installedInfo = packageManager.getPackageInfo(packageName, flags)
        val installedSignatures = signatureDigests(installedInfo)
        val archiveSignatures = signatureDigests(archiveInfo)
        require(installedSignatures.isNotEmpty() && installedSignatures == archiveSignatures) {
            "Update signature does not match this app"
        }
    }

    @Suppress("DEPRECATION")
    private fun signatureDigests(packageInfo: android.content.pm.PackageInfo): Set<String> {
        val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            packageInfo.signingInfo?.apkContentsSigners.orEmpty()
        } else {
            packageInfo.signatures.orEmpty()
        }
        return signatures.mapTo(mutableSetOf()) { signature ->
            MessageDigest.getInstance("SHA-256")
                .digest(signature.toByteArray())
                .joinToString("") { "%02x".format(it) }
        }
    }

    private fun launchPackageInstaller(uri: Uri) {
        runCatching {
            startActivity(Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            })
        }.onSuccess {
            notifyUpdateStatus("verified", "Update verified. Android installer opened.")
        }.onFailure { notifyUpdateStatus("error", it.message ?: "Cannot open Android installer") }
    }

    private fun notifyUpdateStatus(status: String, message: String) {
        webView?.evaluateJavascript(
            "if(window.onUpdateDownloadStatus)window.onUpdateDownloadStatus(${JSONObject.quote(status)},${JSONObject.quote(message)});",
            null
        )
    }

    inner class BackupBridge {
        /** Android-only local OCR; passes text boxes to the open payslip comparison. */
        @JavascriptInterface
        fun recognizePayslip(dataUrl: String, month: String) {
            if (!Regex("^\\d{4}-(0[1-9]|1[0-2])$").matches(month)) return
            runOnUiThread {
                if (isFinishing || isDestroyed) return@runOnUiThread
                PayslipTextRecognition.recognize(dataUrl) { result ->
                    val envelope = result.fold(
                        onSuccess = { json -> JSONObject().put("ok", true).put("result", json) },
                        onFailure = { e -> JSONObject().put("ok", false).put("error", e.message ?: "OCR unavailable") }
                    )
                    webView?.evaluateJavascript(
                        "window.onPayslipOcrResult?.(${JSONObject.quote(month)},${envelope});",
                        null
                    )
                }
            }
        }

        @JavascriptInterface
        fun setDailyReminder(enabled: Boolean, timeHHmm: String) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                }
            }
            ReminderScheduler.schedule(this@MainActivity, enabled, timeHHmm.ifBlank { "18:00" })
        }

        @JavascriptInterface
        fun saveBackup(content: String, filename: String): Boolean {
            return saveBackup(content, filename, null)
        }

        @JavascriptInterface
        fun saveBackup(content: String, filename: String, mimeType: String?): Boolean {
            val mime = mimeType ?: when {
                filename.endsWith(".csv") -> "text/csv"
                else -> "application/json"
            }
            return runCatching {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val values = android.content.ContentValues().apply {
                        put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                        put(MediaStore.MediaColumns.MIME_TYPE, mime)
                        put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                        put(MediaStore.MediaColumns.IS_PENDING, 1)
                    }
                    val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                    if (uri != null) {
                        contentResolver.openOutputStream(uri)?.use { out: OutputStream ->
                            out.write(content.toByteArray(Charsets.UTF_8))
                        }
                        values.clear()
                        values.put(MediaStore.MediaColumns.IS_PENDING, 0)
                        contentResolver.update(uri, values, null, null)
                        true
                    } else {
                        android.util.Log.e("BackupBridge", "Failed to insert MediaStore entry for $filename")
                        false
                    }
                } else {
                    val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                    File(downloadsDir, filename).writeText(content, Charsets.UTF_8)
                    true
                }
            }.onFailure { e ->
                android.util.Log.e("BackupBridge", "saveBackup failed for $filename", e)
            }.getOrDefault(false)
        }

        /** 4.1 - Store backup copy for scheduled auto-backup (saved to app internal storage) */
        @JavascriptInterface
        fun storeBackupCopy(jsonData: String) {
            runCatching {
                AccountStorage.currentBackupFile(this@MainActivity).writeText(jsonData, Charsets.UTF_8)
            }
        }

        /** 4.1 - Schedule auto backup at day of month (1-31) and time (HH:mm) */
        @JavascriptInterface
        fun scheduleAutoBackup(enabled: Boolean, dayOfMonth: Int, timeHHmm: String) {
            BackupScheduler.schedule(this@MainActivity, enabled, dayOfMonth, timeHHmm.ifBlank { "22:00" })
        }

        /** Widget - Update summary text (ယခုလက်ရှိ တလရဲ့ မှတ်တမ်း အကျဉ်းချုပ်) */
        @JavascriptInterface
        fun updateWidgetSummary(summaryText: String) {
            runCatching {
                SalaryWidgetProvider.updateSummaryAndRefresh(this@MainActivity, summaryText)
            }
        }

        /** Widget - Update full multilingual widget data */
        @JavascriptInterface
        fun updateWidgetData(jsonData: String) {
            runCatching {
                SalaryWidgetProvider.updateDataAndRefresh(this@MainActivity, jsonData)
            }
        }

        /** Check if running inside Android native app WebView */
        @JavascriptInterface
        fun isNativeApp(): Boolean = true

        /** 4.3 - Save binary backup (base64) for Excel export */
        @JavascriptInterface
        fun saveBackupBase64(base64Data: String, filename: String): Boolean {
            return runCatching {
                val bytes = android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val values = android.content.ContentValues().apply {
                        put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                        put(MediaStore.MediaColumns.MIME_TYPE, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                        put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                        put(MediaStore.MediaColumns.IS_PENDING, 1)
                    }
                    val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                    if (uri != null) {
                        contentResolver.openOutputStream(uri)?.use { out -> out.write(bytes) }
                        values.clear()
                        values.put(MediaStore.MediaColumns.IS_PENDING, 0)
                        contentResolver.update(uri, values, null, null)
                        true
                    } else false
                } else {
                    val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                    File(downloadsDir, filename).writeBytes(bytes)
                    true
                }
            }.getOrDefault(false)
        }

        @JavascriptInterface
        fun backupToCloud(jsonData: String) {
            logCustomEvent("cloud_backup_initiated")
            val account = GoogleSignIn.getLastSignedInAccount(this@MainActivity)
            if (account == null) {
                triggerSignIn()
                return
            }

            lifecycleScope.launch {
                val result = googleDriveHelper.uploadBackup(account, jsonData)
                result.onSuccess {
                    Toast.makeText(this@MainActivity, "Cloud Backup Successful", Toast.LENGTH_SHORT).show()
                    webView?.evaluateJavascript("if(typeof window.onCloudResult==='function')window.onCloudResult(true, 'Backup Success', null);", null)
                }.onFailure { e ->
                    Toast.makeText(this@MainActivity, "Backup Failed: ${e.message}", Toast.LENGTH_LONG).show()
                    webView?.evaluateJavascript("if(typeof window.onCloudResult==='function')window.onCloudResult(false, ${JSONObject.quote(e.message ?: "Backup failed")}, null);", null)
                }
            }
        }

        @JavascriptInterface
        fun restoreFromCloud() {
            logCustomEvent("cloud_restore_initiated")
            val account = GoogleSignIn.getLastSignedInAccount(this@MainActivity)
            if (account == null) {
                triggerSignIn()
                return
            }

            lifecycleScope.launch {
                val result = googleDriveHelper.downloadBackup(account)
                result.onSuccess { data ->
                    Toast.makeText(this@MainActivity, "Restore Success", Toast.LENGTH_SHORT).show()
                    webView?.evaluateJavascript("if(typeof window.onCloudResult==='function')window.onCloudResult(true, 'Restore Success', ${JSONObject.quote(data)});", null)
                }.onFailure { e ->
                    Toast.makeText(this@MainActivity, "Restore Failed: ${e.message}", Toast.LENGTH_LONG).show()
                    webView?.evaluateJavascript("if(typeof window.onCloudResult==='function')window.onCloudResult(false, ${JSONObject.quote(e.message ?: "Restore failed")}, null);", null)
                }
            }
        }

        @JavascriptInterface
        fun isLoggedIn(): Boolean {
            return GoogleSignIn.getLastSignedInAccount(this@MainActivity) != null
        }

        @JavascriptInterface
        fun getUserEmail(): String {
            return GoogleSignIn.getLastSignedInAccount(this@MainActivity)?.email ?: ""
        }

        @JavascriptInterface
        fun getUserDisplayName(): String {
            return GoogleSignIn.getLastSignedInAccount(this@MainActivity)?.displayName ?: ""
        }

        @JavascriptInterface
        fun getStorageScope(): String = AccountStorage.currentScope(this@MainActivity)

        @JavascriptInterface
        fun getAppVersionName(): String = BuildConfig.VERSION_NAME

        @JavascriptInterface
        fun getAppVersionCode(): Int = BuildConfig.VERSION_CODE

        @JavascriptInterface
        fun checkForUpdate() {
            runOnUiThread { checkForAppUpdate() }
        }

        @JavascriptInterface
        fun downloadLatestUpdate() {
            runOnUiThread { this@MainActivity.downloadLatestUpdate() }
        }

        @JavascriptInterface
        fun logUsageEvent(eventName: String) {
            // Only fixed feature names; never accept salary, notes, or account data.
            if (eventName in setOf("view_calendar", "view_records", "view_settings", "work_entry_saved")) {
                logCustomEvent(eventName)
            }
        }

        @JavascriptInterface
        fun triggerSignIn() {
            // WebView bridge calls run on a background thread; launch UI on main.
            runOnUiThread {
                if (!isFinishing && !isDestroyed) {
                    logCustomEvent("google_sign_in_started")
                    signInLauncher.launch(googleDriveHelper.getGoogleSignInClient().signInIntent)
                }
            }
        }

        @JavascriptInterface
        fun signOut() {
            runOnUiThread {
                googleDriveHelper.getGoogleSignInClient().signOut().addOnCompleteListener {
                    firebaseAnalytics.setUserId(null)
                    Toast.makeText(this@MainActivity, "Signed out", Toast.LENGTH_SHORT).show()
                    webView?.reload()
                }
            }
        }

        @JavascriptInterface
        fun refreshSession() {
            googleDriveHelper.getGoogleSignInClient().silentSignIn().addOnCompleteListener { task ->
                if (task.isSuccessful) {
                    webView?.evaluateJavascript("if(typeof checkAuthStatus==='function') checkAuthStatus();", null)
                }
            }
        }

        @JavascriptInterface
        fun getEntryMode(): String {
            val prefs = getSharedPreferences("smart_reminder_prefs", Context.MODE_PRIVATE)
            return prefs.getString("entry_mode", "NONE") ?: "NONE"
        }

        @JavascriptInterface
        fun setEntryMode(mode: String) {
            if (mode !in setOf("NONE", "BASIC", "FULL")) return
            firebaseAnalytics.setUserProperty("entry_mode", mode.lowercase(java.util.Locale.ROOT))
            val prefs = getSharedPreferences("smart_reminder_prefs", Context.MODE_PRIVATE)
            prefs.edit().putString("entry_mode", mode).apply()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        pendingInstallUri = savedInstanceState?.getString("pending_update_uri")?.let(Uri::parse)
        installerOffered = pendingInstallUri != null
        
        firebaseAnalytics = Firebase.analytics
        googleDriveHelper = GoogleDriveHelper(this)
        AccountStorage.migrateLegacyBackupToBasic(this)
        getSharedPreferences(UPDATE_PREFS, Context.MODE_PRIVATE).let { prefs ->
            updateDownloadId = prefs.getLong("download_id", -1L)
            val downloadVersion = prefs.getInt("download_version", 0)
            if (updateDownloadId > 0 && downloadVersion in 1..BuildConfig.VERSION_CODE) {
                runCatching { (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).remove(updateDownloadId) }
                updateDownloadId = -1L
                prefs.edit().remove("download_id").apply()
            }
        }

        // Alert Firebase about silent sign-in if already logged in
        googleDriveHelper.getGoogleSignInClient().silentSignIn().addOnCompleteListener { task ->
            if (task.isSuccessful) {
                val account = task.result
                if (account != null) {
                    firebaseAnalytics.setUserId(hashString(account.id ?: "anonymous"))
                }
                // Notify WebView that auth is ready
                webView?.post {
                    webView?.evaluateJavascript("if(typeof window.checkAuthStatus==='function') window.checkAuthStatus();", null)
                }
            }
        }
        
        // Suppress/cancel any pending daily notifications right when the app opens
        try {
            androidx.core.app.NotificationManagerCompat.from(this).cancel(ReminderWorker.NOTIFICATION_ID)
        } catch (_: Exception) {}

        webView = WebView(this).also {
            setContentView(it)
            it.setBackgroundColor(Color.parseColor("#f1f5f9"))
        }

        val webSettings: WebSettings = webView!!.settings
        webSettings.javaScriptEnabled = true
        webSettings.domStorageEnabled = true
        webSettings.allowFileAccess = true
        webSettings.allowContentAccess = false
        webSettings.databaseEnabled = true
        webSettings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            webSettings.safeBrowsingEnabled = true
        }

        webView!!.addJavascriptInterface(BackupBridge(), "AndroidBridge")
        webView!!.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: android.webkit.WebResourceRequest?): Boolean {
                val uri = request?.url ?: return true
                if (uri.scheme == "file" && uri.path?.startsWith("/android_asset/") == true) return false
                if (uri.scheme == "https") {
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                }
                return true
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                pageLoaded = true
                if (pendingQuickAddToday) {
                    pendingQuickAddToday = false
                    view?.evaluateJavascript("if(typeof window.quickAddToday==='function')window.quickAddToday();", null)
                }
                if (pendingCopyYesterday) {
                    pendingCopyYesterday = false
                    view?.evaluateJavascript("if(typeof window.copyYesterday==='function')window.copyYesterday();", null)
                }
            }
        }

        webView!!.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                uploadMessage?.onReceiveValue(null)
                uploadMessage = filePathCallback

                try {
                    val pickIntent = fileChooserParams?.createIntent() ?: run {
                        uploadMessage = null
                        return false
                    }
                    val acceptsImages = fileChooserParams.acceptTypes.any {
                        it == "image/*" || it.startsWith("image/")
                    }
                    if (acceptsImages) {
                        val tempPhoto = File.createTempFile(
                            "smart-salary-payslip-", ".jpg", externalCacheDir ?: cacheDir
                        )
                        val cameraUri = FileProvider.getUriForFile(
                            this@MainActivity, "${packageName}.fileprovider", tempPhoto
                        )
                        val camera = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
                            putExtra(MediaStore.EXTRA_OUTPUT, cameraUri)
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                        }
                        if (camera.resolveActivity(packageManager) != null) {
                            pendingCameraPhotoUri = cameraUri
                            filePickerLauncher.launch(Intent.createChooser(pickIntent, "စက်ရုံရှင်းတမ်း ဓာတ်ပုံ").apply {
                                putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(camera))
                            })
                        } else {
                            pendingCameraPhotoUri = null
                            filePickerLauncher.launch(pickIntent)
                        }
                    } else {
                        pendingCameraPhotoUri = null
                        filePickerLauncher.launch(pickIntent)
                    }
                } catch (e: Exception) {
                    pendingCameraPhotoUri = null
                    uploadMessage?.onReceiveValue(null)
                    uploadMessage = null
                    return false
                }
                return true
            }
        }

        pendingQuickAddToday = intent?.getBooleanExtra(SalaryWidgetProvider.EXTRA_QUICK_ADD_TODAY, false) == true
        pendingCopyYesterday = intent?.getBooleanExtra(SalaryWidgetProvider.EXTRA_COPY_YESTERDAY, false) == true
        webView!!.loadUrl("file:///android_asset/index.html")
        ReminderScheduler.scheduleFromPrefs(this)
        BackupScheduler.scheduleFromPrefs(this)

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.RESUMED) {
                while (true) {
                    if (updateDownloadId > 0 && !installerOffered) {
                        verifyAndInstallUpdate(updateDownloadId)
                    }
                    delay(1000)
                }
            }
        }
    }

    override fun onDestroy() {
        webView?.removeJavascriptInterface("AndroidBridge")
        webView?.destroy()
        webView = null
        super.onDestroy()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        pendingInstallUri?.let { outState.putString("pending_update_uri", it.toString()) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent.getBooleanExtra(SalaryWidgetProvider.EXTRA_QUICK_ADD_TODAY, false)) {
            if (pageLoaded) {
                webView?.evaluateJavascript("if(typeof window.quickAddToday==='function')window.quickAddToday();", null)
            } else {
                pendingQuickAddToday = true
            }
        }
        if (intent.getBooleanExtra(SalaryWidgetProvider.EXTRA_COPY_YESTERDAY, false)) {
            if (pageLoaded) {
                webView?.evaluateJavascript("if(typeof window.copyYesterday==='function')window.copyYesterday();", null)
            } else {
                pendingCopyYesterday = true
            }
        }
    }

    override fun onBackPressed() {
        val webView = findViewById<android.view.View>(android.R.id.content) as? WebView
        if (webView != null && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
