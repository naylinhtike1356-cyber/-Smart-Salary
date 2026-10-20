package com.naylinhtike.salarytracker

import android.graphics.Color
import com.google.firebase.analytics.FirebaseAnalytics
import com.google.firebase.analytics.ktx.analytics
import com.google.firebase.ktx.Firebase

import android.Manifest
import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
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
import java.io.File
import java.io.OutputStream
import androidx.lifecycle.lifecycleScope
import com.google.android.gms.auth.api.signin.GoogleSignIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
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
    private var pendingQuickAddToday = false
    private var pendingCopyYesterday = false
    private var pageLoaded = false
    private var updateDownloadId: Long = -1L
    private var pendingInstallUri: Uri? = null
    private var latestApkUrl: String? = null
    private var latestApkSha256: String? = null
    private var latestVersionName: String? = null
    private lateinit var googleDriveHelper: GoogleDriveHelper
    private lateinit var firebaseAnalytics: FirebaseAnalytics

    companion object {
        private const val RELEASE_METADATA_URL = "https://webdist-puce.vercel.app/release.json"
        private const val RELEASE_HOST = "webdist-puce.vercel.app"
        private const val UPDATE_PREFS = "app_update_prefs"
        private const val UPDATE_APK_FILE = "SmartSalaryTracker-update.apk"
    }

    private val signInLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val task = GoogleSignIn.getSignedInAccountFromIntent(result.data)
        try {
            val account = task.getResult(ApiException::class.java)
            if (account != null) {
                // Firebase: Set Hashed User ID for Privacy (Prevent PII in Analytics)
                firebaseAnalytics.setUserId(hashString(account.id ?: "anonymous"))
                
                logCustomEvent(FirebaseAnalytics.Event.LOGIN, Bundle().apply {
                    putString(FirebaseAnalytics.Param.METHOD, "google")
                })
                
                Toast.makeText(this, "Google Sign-In successful", Toast.LENGTH_SHORT).show()
                webView?.reload() // Reload the page to reflect signed-in state
            }
        } catch (e: ApiException) {
            Toast.makeText(this, "Sign-in failed: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { _ -> }

    private val installPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        val uri = pendingInstallUri
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || packageManager.canRequestPackageInstalls()) {
            if (uri != null) launchPackageInstaller(uri)
        } else {
            Toast.makeText(this, "Install unknown apps permission is required to update.", Toast.LENGTH_LONG).show()
        }
    }

    private val updateDownloadReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != DownloadManager.ACTION_DOWNLOAD_COMPLETE) return
            val completedId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
            if (completedId == updateDownloadId) verifyAndInstallUpdate(completedId)
        }
    }

    private val filePickerLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (uploadMessage == null) return@registerForActivityResult
        val results = WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
        uploadMessage?.onReceiveValue(results)
        uploadMessage = null
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
                        setRequestProperty("Accept", "application/json")
                        setRequestProperty("Cache-Control", "no-cache")
                    }
                    try {
                        if (connection.responseCode != HttpURLConnection.HTTP_OK) {
                            error("Update server returned ${connection.responseCode}")
                        }
                        val release = connection.inputStream.bufferedReader().use { JSONObject(it.readText()) }
                        val versionCode = release.getInt("versionCode")
                        val apkUrl = release.getString("apkUrl")
                        val sha256 = release.getString("sha256").lowercase()
                        val parsedUrl = Uri.parse(apkUrl)
                        require(parsedUrl.scheme == "https" && parsedUrl.host == RELEASE_HOST) {
                            "Untrusted APK download URL"
                        }
                        require(sha256.matches(Regex("[0-9a-f]{64}"))) { "Invalid APK checksum" }
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
                latestApkUrl = release.getString("apkUrl")
                latestApkSha256 = release.getString("sha256").lowercase()
                latestVersionName = release.getString("versionName")
                getSharedPreferences(UPDATE_PREFS, Context.MODE_PRIVATE).edit()
                    .putString("apk_url", latestApkUrl)
                    .putString("sha256", latestApkSha256)
                    .putString("version_name", latestVersionName)
                    .apply()
                webView?.evaluateJavascript(
                    "if(window.onUpdateCheckResult)window.onUpdateCheckResult(true,$release);",
                    null
                )
            }.onFailure { error ->
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
        if (apkUrl == null || latestApkSha256 == null) {
            Toast.makeText(this, "Check for updates first.", Toast.LENGTH_SHORT).show()
            checkForAppUpdate()
            return
        }

        val parsedUrl = Uri.parse(apkUrl)
        if (parsedUrl.scheme != "https" || parsedUrl.host != RELEASE_HOST) {
            Toast.makeText(this, "Blocked an untrusted update URL.", Toast.LENGTH_LONG).show()
            return
        }

        getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)?.let { File(it, UPDATE_APK_FILE).delete() }
        val request = DownloadManager.Request(parsedUrl)
            .setTitle("Smart Salary Tracker ${latestVersionName ?: "Update"}")
            .setDescription("Downloading verified app update")
            .setMimeType("application/vnd.android.package-archive")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, UPDATE_APK_FILE)
            .setAllowedOverMetered(true)
            .setAllowedOverRoaming(false)

        updateDownloadId = (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
        getSharedPreferences(UPDATE_PREFS, Context.MODE_PRIVATE).edit()
            .putLong("download_id", updateDownloadId)
            .apply()
        notifyUpdateStatus("downloading", "Update download started")
        Toast.makeText(this, "Update download started", Toast.LENGTH_SHORT).show()
    }

    private fun verifyAndInstallUpdate(downloadId: Long) {
        lifecycleScope.launch {
            val result = withContext(Dispatchers.IO) {
                runCatching {
                    val manager = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                    manager.query(DownloadManager.Query().setFilterById(downloadId)).use { cursor ->
                        require(cursor.moveToFirst()) { "Downloaded update was not found" }
                        val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
                        require(status == DownloadManager.STATUS_SUCCESSFUL) { "Update download failed" }
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
                    require(actual.equals(latestApkSha256, ignoreCase = true)) {
                        "APK security verification failed"
                    }
                    validateDownloadedPackage(apkFile)
                    uri
                }
            }

            result.onSuccess { uri ->
                getSharedPreferences(UPDATE_PREFS, Context.MODE_PRIVATE).edit()
                    .remove("download_id")
                    .apply()
                notifyUpdateStatus("verified", "Update verified. Opening installer...")
                requestPackageInstall(uri)
            }.onFailure { error ->
                (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).remove(downloadId)
                getSharedPreferences(UPDATE_PREFS, Context.MODE_PRIVATE).edit()
                    .remove("download_id")
                    .apply()
                val message = error.message ?: "Update verification failed"
                notifyUpdateStatus("error", message)
                Toast.makeText(this@MainActivity, message, Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun requestPackageInstall(uri: Uri) {
        pendingInstallUri = uri
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !packageManager.canRequestPackageInstalls()) {
            installPermissionLauncher.launch(
                Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName"))
            )
            return
        }
        launchPackageInstaller(uri)
    }

    @Suppress("DEPRECATION")
    private fun validateDownloadedPackage(apkFile: File) {
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
        startActivity(Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        })
    }

    private fun notifyUpdateStatus(status: String, message: String) {
        webView?.evaluateJavascript(
            "if(window.onUpdateDownloadStatus)window.onUpdateDownloadStatus(${JSONObject.quote(status)},${JSONObject.quote(message)});",
            null
        )
    }

    inner class BackupBridge {
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
                signInLauncher.launch(googleDriveHelper.getGoogleSignInClient().signInIntent)
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
                signInLauncher.launch(googleDriveHelper.getGoogleSignInClient().signInIntent)
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
        fun triggerSignIn() {
            signInLauncher.launch(googleDriveHelper.getGoogleSignInClient().signInIntent)
        }

        @JavascriptInterface
        fun signOut() {
            googleDriveHelper.getGoogleSignInClient().signOut().addOnCompleteListener {
                Toast.makeText(this@MainActivity, "Signed out", Toast.LENGTH_SHORT).show()
                webView?.reload()
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
            val prefs = getSharedPreferences("smart_reminder_prefs", Context.MODE_PRIVATE)
            prefs.edit().putString("entry_mode", mode).apply()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        firebaseAnalytics = Firebase.analytics
        googleDriveHelper = GoogleDriveHelper(this)
        AccountStorage.migrateLegacyBackupToBasic(this)
        getSharedPreferences(UPDATE_PREFS, Context.MODE_PRIVATE).let { prefs ->
            updateDownloadId = prefs.getLong("download_id", -1L)
            latestApkUrl = prefs.getString("apk_url", null)
            latestApkSha256 = prefs.getString("sha256", null)
            latestVersionName = prefs.getString("version_name", null)
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
                    val intent = fileChooserParams?.createIntent()
                    if (intent != null) {
                        filePickerLauncher.launch(intent)
                    } else {
                        uploadMessage = null
                        return false
                    }
                } catch (e: Exception) {
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

        ContextCompat.registerReceiver(
            this,
            updateDownloadReceiver,
            IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
            ContextCompat.RECEIVER_NOT_EXPORTED
        )
        if (updateDownloadId > 0) {
            val manager = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            manager.query(DownloadManager.Query().setFilterById(updateDownloadId)).use { cursor ->
                if (cursor.moveToFirst() &&
                    cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)) == DownloadManager.STATUS_SUCCESSFUL
                ) {
                    verifyAndInstallUpdate(updateDownloadId)
                }
            }
        }
    }

    override fun onDestroy() {
        runCatching { unregisterReceiver(updateDownloadReceiver) }
        webView?.removeJavascriptInterface("AndroidBridge")
        webView?.destroy()
        webView = null
        super.onDestroy()
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
