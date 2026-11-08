package dev.blockport.launcher.game

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.Process
import android.system.Os
import android.text.InputType
import android.util.Log
import android.view.InputDevice
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.view.WindowManager
import android.view.inputmethod.BaseInputConnection
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.view.inputmethod.InputMethodManager
import android.widget.FrameLayout
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import java.io.File
import kotlin.math.roundToInt

/**
 * Roda no processo ":game". A JVM do Minecraft vive aqui; quando o jogo
 * termina o processo é encerrado e o launcher (outro processo) continua intacto.
 */
class GameActivity : Activity(), SurfaceHolder.Callback {

    companion object {
        private const val TAG = "BlockPort"
        private const val EXTRA_ARGS = "args"
        private const val EXTRA_JAVA_HOME = "javaHome"
        private const val EXTRA_LOG = "log"
        private const val EXTRA_ENV = "env"
        private const val EXTRA_SCALE = "scale"
        private const val EXTRA_SUSTAINED = "sustained"

        /** A JVM só pode ser criada uma vez por processo. */
        @Volatile private var jvmStarted = false

        fun intent(
            context: Context,
            javaHome: String,
            args: List<String>,
            env: Map<String, String>,
            logPath: String,
            renderScale: Float,
            sustained: Boolean,
        ): Intent = Intent(context, GameActivity::class.java)
            .putExtra(EXTRA_JAVA_HOME, javaHome)
            .putExtra(EXTRA_ARGS, args.toTypedArray())
            .putExtra(EXTRA_ENV, env.map { "${it.key}=${it.value}" }.toTypedArray())
            .putExtra(EXTRA_LOG, logPath)
            .putExtra(EXTRA_SCALE, renderScale)
            .putExtra(EXTRA_SUSTAINED, sustained)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    private lateinit var surface: GameSurface
    private lateinit var controls: TouchControls
    private var scale = 1f
    private var bufferW = 0
    private var bufferH = 0
    private val handler = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        scale = intent.getFloatExtra(EXTRA_SCALE, 1f).coerceIn(0.25f, 1f)

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (Build.VERSION.SDK_INT >= 28) {
            window.attributes.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }
        configurePerformance(intent.getBooleanExtra(EXTRA_SUSTAINED, false))

        surface = GameSurface(this)
        controls = TouchControls(this).apply { onKeyboardToggle = ::toggleKeyboard }
        val root = FrameLayout(this)
        root.addView(surface, FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
        root.addView(controls, FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
        setContentView(root)
        hideSystemBars()

        surface.holder.addCallback(this)
        // Resolução de render reduzida: o maior ganho de FPS em celular.
        surface.addOnLayoutChangeListener { v, _, _, _, _, _, _, _, _ ->
            val w = (v.width * scale).roundToInt().coerceAtLeast(1)
            val h = (v.height * scale).roundToInt().coerceAtLeast(1)
            if (w != bufferW || h != bufferH) surface.holder.setFixedSize(w, h)
        }
        surface.setOnCapturedPointerListener { _, e -> onCapturedMouse(e) }

        applyEnvironment()
        handler.post(clipboardPump)
    }

    private fun configurePerformance(sustained: Boolean) {
        // Taxa de atualização mais alta disponível na resolução atual.
        @Suppress("DEPRECATION")
        val display = windowManager.defaultDisplay
        val current = display.mode
        val best = display.supportedModes
            .filter { it.physicalWidth == current.physicalWidth && it.physicalHeight == current.physicalHeight }
            .maxByOrNull { it.refreshRate }
        if (best != null) {
            window.attributes = window.attributes.apply { preferredDisplayModeId = best.modeId }
        }
        NativeBridge.setRefreshRate((best?.refreshRate ?: current.refreshRate).roundToInt())

        // Clock estável em vez de picos seguidos de throttling (opcional).
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        if (sustained && pm.isSustainedPerformanceModeSupported) window.setSustainedPerformanceMode(true)
    }

    private fun hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    private fun applyEnvironment() {
        intent.getStringArrayExtra(EXTRA_ENV)?.forEach { kv ->
            val i = kv.indexOf('=')
            if (i > 0) Os.setenv(kv.substring(0, i), kv.substring(i + 1), true)
        }
    }

    // ------------------------------------------------------------ superfície
    override fun surfaceCreated(holder: SurfaceHolder) = Unit

    override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
        bufferW = width
        bufferH = height
        controls.bufferWidth = width
        controls.bufferHeight = height
        if (surface.width > 0) {
            controls.bufferScaleX = width.toFloat() / surface.width
            controls.bufferScaleY = height.toFloat() / surface.height
        }
        NativeBridge.setSurface(holder.surface, width, height)
        startJvmOnce()
    }

    override fun surfaceDestroyed(holder: SurfaceHolder) {
        NativeBridge.surfaceDestroyed()
    }

    private fun startJvmOnce() {
        if (jvmStarted) return
        jvmStarted = true
        val javaHome = intent.getStringExtra(EXTRA_JAVA_HOME) ?: return
        val args = intent.getStringArrayExtra(EXTRA_ARGS) ?: return
        val log = intent.getStringExtra(EXTRA_LOG) ?: File(cacheDir, "latestlog.txt").path
        Thread(null, {
            val rc = NativeBridge.launchJvm(javaHome, args, log)
            Log.i(TAG, "JVM saiu: $rc")
            runOnUiThread { finish() }
            Process.killProcess(Process.myPid())
        }, "BlockPort-JVM", 16L * 1024 * 1024).start()
    }

    // ------------------------------------------------------------ entrada física
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val code = event.keyCode
        if (code == KeyEvent.KEYCODE_VOLUME_UP || code == KeyEvent.KEYCODE_VOLUME_DOWN) return super.dispatchKeyEvent(event)
        val key = Glfw.key(code)
        val mods = Glfw.mods(event)
        when (event.action) {
            KeyEvent.ACTION_DOWN -> {
                if (key >= 0) NativeBridge.sendKey(key, code, if (event.repeatCount > 0) Glfw.REPEAT else Glfw.PRESS, mods)
                val ch = event.unicodeChar
                if (ch > 0 && !Character.isISOControl(ch)) NativeBridge.sendChar(ch, mods)
            }
            KeyEvent.ACTION_UP -> if (key >= 0) NativeBridge.sendKey(key, code, Glfw.RELEASE, mods)
            KeyEvent.ACTION_MULTIPLE -> event.characters?.codePoints()?.forEach { NativeBridge.sendChar(it, 0) }
        }
        return true
    }

    override fun dispatchGenericMotionEvent(e: MotionEvent): Boolean {
        if (!e.isFromSource(InputDevice.SOURCE_MOUSE)) return super.dispatchGenericMotionEvent(e)
        when (e.actionMasked) {
            MotionEvent.ACTION_HOVER_MOVE -> {
                if (NativeBridge.isCursorGrabbed() && Build.VERSION.SDK_INT >= 26) surface.requestPointerCapture()
                NativeBridge.sendCursor(e.x * controls.bufferScaleX, e.y * controls.bufferScaleY, 0f, 0f)
            }
            MotionEvent.ACTION_SCROLL ->
                NativeBridge.sendScroll(e.getAxisValue(MotionEvent.AXIS_HSCROLL), e.getAxisValue(MotionEvent.AXIS_VSCROLL))
            MotionEvent.ACTION_BUTTON_PRESS -> mouseButton(e.actionButton, Glfw.PRESS)
            MotionEvent.ACTION_BUTTON_RELEASE -> mouseButton(e.actionButton, Glfw.RELEASE)
        }
        return true
    }

    /** Mouse capturado: deltas relativos crus, sem aceleração do sistema. */
    private fun onCapturedMouse(e: MotionEvent): Boolean {
        if (!NativeBridge.isCursorGrabbed()) {
            surface.releasePointerCapture()
            return true
        }
        when (e.actionMasked) {
            MotionEvent.ACTION_MOVE -> NativeBridge.sendCursor(0f, 0f, e.x, e.y)
            MotionEvent.ACTION_SCROLL ->
                NativeBridge.sendScroll(0f, e.getAxisValue(MotionEvent.AXIS_VSCROLL))
            MotionEvent.ACTION_BUTTON_PRESS -> mouseButton(e.actionButton, Glfw.PRESS)
            MotionEvent.ACTION_BUTTON_RELEASE -> mouseButton(e.actionButton, Glfw.RELEASE)
        }
        return true
    }

    private fun mouseButton(androidButton: Int, action: Int) {
        val b = when (androidButton) {
            MotionEvent.BUTTON_PRIMARY -> Glfw.MOUSE_LEFT
            MotionEvent.BUTTON_SECONDARY -> Glfw.MOUSE_RIGHT
            MotionEvent.BUTTON_TERTIARY -> Glfw.MOUSE_MIDDLE
            else -> return
        }
        NativeBridge.sendMouseButton(b, action, 0)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        NativeBridge.setFocused(hasFocus)
        if (hasFocus) {
            hideSystemBars()
            pushClipboard()
        }
    }

    // ------------------------------------------------------------ teclado virtual / clipboard
    private fun toggleKeyboard() {
        val imm = getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
        surface.requestFocus()
        imm.toggleSoftInput(InputMethodManager.SHOW_FORCED, 0)
    }

    private fun pushClipboard() {
        val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val text = cm.primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(this)?.toString()
        NativeBridge.setClipboard(text)
    }

    private val clipboardPump = object : Runnable {
        override fun run() {
            NativeBridge.takeClipboardRequest()?.let {
                val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                cm.setPrimaryClip(ClipData.newPlainText("Minecraft", it))
            }
            handler.postDelayed(this, 500)
        }
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }

    /** SurfaceView que também recebe texto do teclado virtual. */
    @SuppressLint("ViewConstructor")
    private class GameSurface(context: Context) : SurfaceView(context) {
        init {
            isFocusable = true
            isFocusableInTouchMode = true
        }

        override fun onCheckIsTextEditor() = true

        override fun onCreateInputConnection(outAttrs: EditorInfo): InputConnection {
            outAttrs.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            outAttrs.imeOptions = EditorInfo.IME_FLAG_NO_FULLSCREEN or EditorInfo.IME_FLAG_NO_EXTRACT_UI
            return object : BaseInputConnection(this, false) {
                override fun commitText(text: CharSequence, newCursorPosition: Int): Boolean {
                    text.codePoints().forEach {
                        if (it == '\n'.code) NativeBridge.tapKey(Glfw.KEY_ENTER) else NativeBridge.sendChar(it, 0)
                    }
                    return true
                }

                override fun deleteSurroundingText(beforeLength: Int, afterLength: Int): Boolean {
                    repeat(beforeLength.coerceAtLeast(1)) { NativeBridge.tapKey(Glfw.KEY_BACKSPACE) }
                    return true
                }
            }
        }
    }
}
