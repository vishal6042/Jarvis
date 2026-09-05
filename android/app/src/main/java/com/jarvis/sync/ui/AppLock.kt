package com.jarvis.sync.ui

import android.content.Context
import android.os.Build
import android.os.SystemClock
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner

/** How long the app may sit in the background before it locks again. */
private const val GRACE_MS = 30_000L

/**
 * Which ways of proving identity are accepted. The device PIN is offered alongside the fingerprint
 * so a wet thumb or a re-registered face never locks someone out of their own money — but only from
 * Android 11, where the two can be combined in one prompt; below that the prompt is biometric-only
 * and gets a Cancel button, which the newer combination forbids.
 */
private fun authenticators(): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) BIOMETRIC_WEAK or DEVICE_CREDENTIAL
    else BIOMETRIC_WEAK

/** Whether this phone has anything to unlock with — no fingerprint and no PIN means no lock. */
fun canLockApp(context: Context): Boolean =
    BiometricManager.from(context).canAuthenticate(authenticators()) == BiometricManager.BIOMETRIC_SUCCESS

/**
 * Holds the app shut until the person proves who they are. The gate is only over the screen:
 * forwarding SMS keeps running while locked, which is the point of a forwarder.
 *
 * Turning the lock on does not lock the screen you are looking at — it takes effect the next time
 * the app is opened or comes back from the background.
 */
@Composable
fun AppLockGate(enabled: Boolean, content: @Composable () -> Unit) {
    var unlocked by remember { mutableStateOf(!enabled) }
    var leftAt by remember { mutableStateOf(0L) }

    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, enabled) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_STOP -> leftAt = SystemClock.elapsedRealtime()
                // A glance at another app should not mean unlocking again; a real absence should.
                Lifecycle.Event.ON_START ->
                    if (enabled && leftAt > 0L && SystemClock.elapsedRealtime() - leftAt > GRACE_MS) {
                        unlocked = false
                    }
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    if (!enabled || unlocked) {
        content()
    } else {
        LockScreen(onUnlocked = { unlocked = true })
    }
}

@Composable
private fun LockScreen(onUnlocked: () -> Unit) {
    val activity = LocalContext.current as? FragmentActivity
    var refused by remember { mutableStateOf<String?>(null) }

    val ask: () -> Unit = {
        if (activity == null) {
            // Nothing to show a prompt from; refusing to open is safer than opening anyway.
            refused = "Could not start the unlock prompt."
        } else {
            refused = null
            val prompt = BiometricPrompt(
                activity,
                ContextCompat.getMainExecutor(activity),
                object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        onUnlocked()
                    }

                    override fun onAuthenticationError(code: Int, message: CharSequence) {
                        refused = message.toString()
                    }
                },
            )
            val info = BiometricPrompt.PromptInfo.Builder()
                .setTitle("Unlock Jarvis")
                .setSubtitle("Your accounts are behind this")
                .setAllowedAuthenticators(authenticators())
                .apply {
                    // The API forbids a negative button once the device PIN is an option.
                    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) setNegativeButtonText("Cancel")
                }
                .build()
            prompt.authenticate(info)
        }
    }

    // Ask straight away, then leave it to the button — nobody wants a prompt they cannot refuse.
    LaunchedEffect(Unit) { ask() }

    Surface(Modifier.fillMaxSize()) {
        Column(
            Modifier.fillMaxSize().padding(32.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(
                Icons.Filled.Lock,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
            )
            Spacer(Modifier.height(16.dp))
            Text("Jarvis is locked", fontSize = 22.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            Text(
                refused ?: "Unlock with your fingerprint, face or screen lock.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(24.dp))
            Button(onClick = ask) { Text("Unlock") }
        }
    }
}
