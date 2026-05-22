package com.naylinhtike.salarytracker

import android.content.Context
import android.content.Intent
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInAccount
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.Scope
import com.google.api.client.googleapis.extensions.android.gms.auth.GoogleAccountCredential
import com.google.api.client.http.ByteArrayContent
import com.google.api.client.json.gson.GsonFactory
import com.google.api.client.http.javanet.NetHttpTransport
import com.google.api.services.drive.Drive
import com.google.api.services.drive.DriveScopes
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.*

class GoogleDriveHelper(private val context: Context) {

    private val jsonFactory = GsonFactory.getDefaultInstance()
    private val httpTransport = NetHttpTransport()

    fun getGoogleSignInClient(): GoogleSignInClient {
        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestEmail()
            .requestScopes(Scope(DriveScopes.DRIVE_APPDATA))
            .build()
        return GoogleSignIn.getClient(context, gso)
    }

    private fun getDriveService(account: GoogleSignInAccount): Drive {
        val credential = GoogleAccountCredential.usingOAuth2(
            context, Collections.singleton(DriveScopes.DRIVE_APPDATA)
        )
        credential.selectedAccount = account.account

        return Drive.Builder(httpTransport, jsonFactory, credential)
            .setApplicationName("Salary Tracker")
            .build()
    }

    suspend fun uploadBackup(account: GoogleSignInAccount, jsonData: String): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            val service = getDriveService(account)
            
            // Look for existing backup file in appDataFolder
            val result = service.files().list()
                .setSpaces("appDataFolder")
                .setQ("name = 'salary_tracker_backup.json'")
                .execute()
            
            val files = result.files
            val metadata = com.google.api.services.drive.model.File().apply {
                name = "salary_tracker_backup.json"
                parents = Collections.singletonList("appDataFolder")
            }
            
            val contentStream = ByteArrayContent.fromString("application/json", jsonData)
            
            if (files.isEmpty()) {
                service.files().create(metadata, contentStream).execute()
            } else {
                service.files().update(files[0].id, null, contentStream).execute()
            }
            "Backup successful"
        }
    }

    suspend fun downloadBackup(account: GoogleSignInAccount): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            val service = getDriveService(account)
            
            val result = service.files().list()
                .setSpaces("appDataFolder")
                .setQ("name = 'salary_tracker_backup.json'")
                .execute()
            
            val files = result.files
            if (files.isEmpty()) {
                throw Exception("No backup found on Google Drive")
            }
            
            val fileId = files[0].id
            val inputStream = service.files().get(fileId).executeMediaAsInputStream()
            inputStream.bufferedReader().use { it.readText() }
        }
    }
}
