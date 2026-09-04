package com.jarvis.sync

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import com.jarvis.sync.ui.AppRoot
import com.jarvis.sync.ui.AppViewModel
import com.jarvis.sync.ui.theme.JarvisSyncTheme

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            JarvisSyncTheme {
                val context = LocalContext.current
                val vm: AppViewModel = viewModel()

                var hasSms by remember { mutableStateOf(hasSmsPermission(context)) }
                val launcher = rememberLauncherForActivityResult(
                    ActivityResultContracts.RequestMultiplePermissions()
                ) { hasSms = hasSmsPermission(context) }

                val requestPerms = {
                    launcher.launch(permissionsToRequest())
                }

                // Ask on first launch if we don't already have SMS access.
                LaunchedEffect(Unit) { if (!hasSms) requestPerms() }

                AppRoot(vm = vm, hasSmsPermission = hasSms, onRequestPermissions = requestPerms)
            }
        }
    }

    private fun hasSmsPermission(context: Context): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.RECEIVE_SMS) ==
            PackageManager.PERMISSION_GRANTED

    private fun permissionsToRequest(): Array<String> {
        val perms = mutableListOf(Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            perms += Manifest.permission.POST_NOTIFICATIONS
        }
        return perms.toTypedArray()
    }
}
