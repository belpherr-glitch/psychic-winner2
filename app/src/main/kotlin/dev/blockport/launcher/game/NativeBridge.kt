package dev.blockport.launcher.game

import android.view.Surface

/** Funções de app/src/main/cpp/jni_bridge.c (libglfw.so). */
object NativeBridge {
    init {
        System.loadLibrary("glfw")
    }

    @JvmStatic external fun launchJvm(javaHome: String, args: Array<String>, logPath: String): Int
    @JvmStatic external fun setSurface(surface: Surface?, width: Int, height: Int)
    @JvmStatic external fun surfaceDestroyed()
    @JvmStatic external fun setRefreshRate(hz: Int)
    @JvmStatic external fun sendKey(key: Int, scancode: Int, action: Int, mods: Int)
    @JvmStatic external fun sendChar(codepoint: Int, mods: Int)
    @JvmStatic external fun sendMouseButton(button: Int, action: Int, mods: Int)
    @JvmStatic external fun sendCursor(x: Float, y: Float, dx: Float, dy: Float)
    @JvmStatic external fun sendScroll(x: Float, y: Float)
    @JvmStatic external fun setFocused(focused: Boolean)
    @JvmStatic external fun isCursorGrabbed(): Boolean
    @JvmStatic external fun setClipboard(text: String?)
    @JvmStatic external fun takeClipboardRequest(): String?

    fun tapKey(key: Int) {
        sendKey(key, key, Glfw.PRESS, 0)
        sendKey(key, key, Glfw.RELEASE, 0)
    }
}
