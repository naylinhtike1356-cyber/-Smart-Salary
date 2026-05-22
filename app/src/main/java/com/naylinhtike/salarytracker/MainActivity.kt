package com.naylinhtike.salarytracker

import android.graphics.Color
import com.google.firebase.analytics.FirebaseAnalytics
import com.google.firebase.analytics.ktx.analytics
import com.google.firebase.ktx.Firebase

import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
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
import com.google.android.gms.auth.api.signin.GoogleSignInAccount
import kotlinx.coroutines.launch
import android.widget.Toast
import com.google.android.gms.common.api.ApiException
import java.security.MessageDigest

class MainActivity : AppCompatActivity() {

    private var webView: WebView? = null
    private var uploadMessage: ValueCallback<Array<Uri>>? = null
    private var pendingQuickAddToday = false
    private var pendingCopyYesterday = false
    private var pageLoaded = false
    private lateinit var googleDriveHelper: GoogleDriveHelper
    private lateinit var firebaseAnalytics: FirebaseAnalytics

    private val signInLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val task = GoogleSignIn.getSignedInAccountFromIntent(result.data)
        try {
            val account = task.getResult(ApiException::class.java)
            if (account != null) {
                // Firebase: Set Hashed User ID for Privacy (Prevent PII in Analytics)
                val hashedEmail = hashString(account.email ?: "")
                firebaseAnalytics.setUserId(hashedEmail)
                
                logCustomEvent(FirebaseAnalytics.Event.LOGIN, Bundle().apply {
                    putString(FirebaseAnalytics.Param.METHOD, "google")
                })
                
                Toast.makeText(this, "Signed in as ${account.email}", Toast.LENGTH_SHORT).show()
                webView?.reload() // Reload the page to reflect signed-in state
            }
        } catch (e: ApiException) {
            Toast.makeText(this, "Sign-in failed: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { _ -> }

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
        fun saveBackup(content: String, filename: String, mimeType: String? = null): Boolean {
            val mime = mimeType ?: when {
                filename.endsWith(".csv") -> "text/csv"
                else -> "application/json"
            }
            return runCatching {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val values = android.content.ContentValues().apply {
                        put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                        put(MediaStore.MediaColumns.MIME_TYPE, mime)
                    }
                    val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                    if (uri != null) {
                        contentResolver.openOutputStream(uri)?.use { out: OutputStream ->
                            out.write(content.toByteArray(Charsets.UTF_8))
                        }
                        true
                    } else false
                } else {
                    val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                    File(downloadsDir, filename).writeText(content, Charsets.UTF_8)
                    true
                }
            }.getOrDefault(false)
        }

        /** 4.1 - Store backup copy for scheduled auto-backup (saved to app internal storage) */
        @JavascriptInterface
        fun storeBackupCopy(jsonData: String) {
            runCatching {
                File(filesDir, "salary_backup_pending.json").writeText(jsonData, Charsets.UTF_8)
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

        /** 4.3 - Save binary backup (base64) for Excel export */
        @JavascriptInterface
        fun saveBackupBase64(base64Data: String, filename: String): Boolean {
            return runCatching {
                val bytes = android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val values = android.content.ContentValues().apply {
                        put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                        put(MediaStore.MediaColumns.MIME_TYPE, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                    }
                    val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                    uri?.let {
                        contentResolver.openOutputStream(uri)?.use { out -> out.write(bytes) }
                        true
                    } ?: false
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
                    webView?.evaluateJavascript("if(typeof window.onCloudResult==='function')window.onCloudResult(false, '${e.message}', null);", null)
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
                    val escapedData = data.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n")
                    webView?.evaluateJavascript("if(typeof window.onCloudResult==='function')window.onCloudResult(true, 'Restore Success', '$escapedData');", null)
                }.onFailure { e ->
                    Toast.makeText(this@MainActivity, "Restore Failed: ${e.message}", Toast.LENGTH_LONG).show()
                    webView?.evaluateJavascript("if(typeof window.onCloudResult==='function')window.onCloudResult(false, '${e.message}', null);", null)
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

        // Alert Firebase about silent sign-in if already logged in
        googleDriveHelper.getGoogleSignInClient().silentSignIn().addOnCompleteListener { task ->
            if (task.isSuccessful) {
                val account = task.result
                if (account != null) {
                    firebaseAnalytics.setUserId(hashString(account.email ?: ""))
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
        webSettings.databaseEnabled = true

        webView!!.addJavascriptInterface(BackupBridge(), "AndroidBridge")
        webView!!.webViewClient = object : WebViewClient() {
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
