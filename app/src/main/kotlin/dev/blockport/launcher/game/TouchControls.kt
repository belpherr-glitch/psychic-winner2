package dev.blockport.launcher.game

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.view.MotionEvent
import android.view.View
import kotlin.math.abs

/**
 * Controles de toque desenhados direto no Canvas (sem hierarquia de Views,
 * custo mínimo por frame).
 *
 * No jogo (cursor capturado): arrastar = olhar; tocar = usar/colocar;
 * segurar = quebrar; tocar na hotbar = trocar de slot.
 * Em menus: o dedo é o mouse (toque = clique); segundo dedo = clique direito.
 */
@SuppressLint("ViewConstructor")
class TouchControls(context: Context) : View(context) {
    /** Conversão de coordenadas da View para o buffer de render (escala de resolução). */
    var bufferScaleX = 1f
    var bufferScaleY = 1f
    var bufferWidth = 0
    var bufferHeight = 0
    var sensitivity = 1f
    var onKeyboardToggle: () -> Unit = {}

    private val dp = resources.displayMetrics.density
    private val slop = 10 * dp
    private val holdMs = 300L

    private class Btn(val label: String, val key: Int = -1, val mouse: Int = -1, val inGameOnly: Boolean = true) {
        val rect = RectF()
        var pointer = -1
    }

    private val up = Btn("▲", Glfw.KEY_W)
    private val left = Btn("◀", Glfw.KEY_A)
    private val down = Btn("▼", Glfw.KEY_S)
    private val right = Btn("▶", Glfw.KEY_D)
    private val jump = Btn("Pular", Glfw.KEY_SPACE)
    private val sneak = Btn("Agachar", Glfw.KEY_LEFT_SHIFT)
    private val attack = Btn("Atacar", mouse = Glfw.MOUSE_LEFT)
    private val inventory = Btn("Inv", Glfw.KEY_E)
    private val drop = Btn("Soltar", Glfw.KEY_Q)
    private val chat = Btn("Chat", Glfw.KEY_T)
    private val esc = Btn("Esc", Glfw.KEY_ESCAPE, inGameOnly = false)
    private val keyboard = Btn("⌨", inGameOnly = false)
    private val buttons = listOf(up, left, down, right, jump, sneak, attack, inventory, drop, chat, esc, keyboard)

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x55000000 }
    private val fillPressed = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x99FFFFFF.toInt() }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xEEFFFFFF.toInt()
        textAlign = Paint.Align.CENTER
        textSize = 14 * dp
    }

    private var grabbed = false

    // ponteiro da câmera (no jogo)
    private var camPointer = -1
    private var camLastX = 0f
    private var camLastY = 0f
    private var camDownX = 0f
    private var camDownY = 0f
    private var camDownTime = 0L
    private var camMoved = false
    private var camHolding = false
    private val holdRunnable = Runnable {
        if (camPointer != -1 && !camMoved) {
            camHolding = true
            NativeBridge.sendMouseButton(Glfw.MOUSE_LEFT, Glfw.PRESS, 0)
        }
    }

    // ponteiro do mouse (em menus)
    private var menuPointer = -1

    private val poll = object : Runnable {
        override fun run() {
            val g = NativeBridge.isCursorGrabbed()
            if (g != grabbed) {
                releaseAll()
                grabbed = g
                invalidate()
            }
            postDelayed(this, 150)
        }
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        post(poll)
    }

    override fun onDetachedFromWindow() {
        removeCallbacks(poll)
        super.onDetachedFromWindow()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        val u = 58 * dp
        val m = 16 * dp
        // D-pad
        val cx = m + 1.5f * u
        val cy = h - m - 1.5f * u
        up.rect.set(cx - u / 2, cy - 1.5f * u, cx + u / 2, cy - 0.5f * u)
        down.rect.set(cx - u / 2, cy + 0.5f * u, cx + u / 2, cy + 1.5f * u)
        left.rect.set(cx - 1.5f * u, cy - u / 2, cx - 0.5f * u, cy + u / 2)
        right.rect.set(cx + 0.5f * u, cy - u / 2, cx + 1.5f * u, cy + u / 2)
        // ações à direita
        val big = 1.3f * u
        jump.rect.set(w - m - big, h - m - big, w - m, h - m)
        sneak.rect.set(jump.rect.left - 8 * dp - big, h - m - big, jump.rect.left - 8 * dp, h - m)
        attack.rect.set(w - m - big, jump.rect.top - 8 * dp - big, w - m, jump.rect.top - 8 * dp)
        // linha superior
        val sw = 0.95f * u
        val sh = 0.7f * u
        var x = w - m
        for (b in listOf(esc, keyboard, chat, inventory, drop)) {
            b.rect.set(x - sw, m, x, m + sh)
            x -= sw + 6 * dp
        }
    }

    private fun visible(b: Btn) = grabbed || !b.inGameOnly

    override fun onDraw(canvas: Canvas) {
        val r = 10 * dp
        for (b in buttons) {
            if (!visible(b)) continue
            canvas.drawRoundRect(b.rect, r, r, if (b.pointer != -1) fillPressed else fill)
            canvas.drawText(b.label, b.rect.centerX(), b.rect.centerY() - (text.ascent() + text.descent()) / 2, text)
        }
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(e: MotionEvent): Boolean {
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> {
                val i = e.actionIndex
                onDown(e.getPointerId(i), e.getX(i), e.getY(i), e.eventTime)
            }
            MotionEvent.ACTION_MOVE -> for (i in 0 until e.pointerCount) onMove(e.getPointerId(i), e.getX(i), e.getY(i))
            MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP -> {
                val i = e.actionIndex
                onUp(e.getPointerId(i), e.getX(i), e.getY(i), e.eventTime)
            }
            MotionEvent.ACTION_CANCEL -> releaseAll()
        }
        return true
    }

    private fun onDown(id: Int, x: Float, y: Float, time: Long) {
        buttons.firstOrNull { visible(it) && it.pointer == -1 && it.rect.contains(x, y) }?.let { b ->
            b.pointer = id
            press(b, true)
            invalidate()
            return
        }
        if (grabbed) {
            hotbarSlot(x, y)?.let { NativeBridge.tapKey(Glfw.KEY_1 + it); return }
            if (camPointer == -1) {
                camPointer = id
                camLastX = x; camLastY = y; camDownX = x; camDownY = y
                camDownTime = time
                camMoved = false
                camHolding = false
                postDelayed(holdRunnable, holdMs)
            }
        } else if (menuPointer == -1) {
            menuPointer = id
            cursorTo(x, y)
            NativeBridge.sendMouseButton(Glfw.MOUSE_LEFT, Glfw.PRESS, 0)
        } else {
            NativeBridge.sendMouseButton(Glfw.MOUSE_RIGHT, Glfw.PRESS, 0)
            NativeBridge.sendMouseButton(Glfw.MOUSE_RIGHT, Glfw.RELEASE, 0)
        }
    }

    private fun onMove(id: Int, x: Float, y: Float) {
        if (id == camPointer) {
            if (!camMoved && abs(x - camDownX) + abs(y - camDownY) > slop) {
                camMoved = true
                if (!camHolding) removeCallbacks(holdRunnable)
            }
            val dx = (x - camLastX) * bufferScaleX * sensitivity
            val dy = (y - camLastY) * bufferScaleY * sensitivity
            camLastX = x; camLastY = y
            if (dx != 0f || dy != 0f) NativeBridge.sendCursor(0f, 0f, dx, dy)
        } else if (id == menuPointer) {
            cursorTo(x, y)
        }
    }

    private fun onUp(id: Int, x: Float, y: Float, time: Long) {
        buttons.firstOrNull { it.pointer == id }?.let { b ->
            b.pointer = -1
            press(b, false)
            invalidate()
            return
        }
        if (id == camPointer) {
            removeCallbacks(holdRunnable)
            if (camHolding) {
                NativeBridge.sendMouseButton(Glfw.MOUSE_LEFT, Glfw.RELEASE, 0)
            } else if (!camMoved && time - camDownTime < holdMs) {
                NativeBridge.sendMouseButton(Glfw.MOUSE_RIGHT, Glfw.PRESS, 0)
                NativeBridge.sendMouseButton(Glfw.MOUSE_RIGHT, Glfw.RELEASE, 0)
            }
            camPointer = -1
            camHolding = false
        } else if (id == menuPointer) {
            cursorTo(x, y)
            NativeBridge.sendMouseButton(Glfw.MOUSE_LEFT, Glfw.RELEASE, 0)
            menuPointer = -1
        }
    }

    private fun press(b: Btn, down: Boolean) {
        val action = if (down) Glfw.PRESS else Glfw.RELEASE
        when {
            b === keyboard -> if (down) onKeyboardToggle()
            b.mouse >= 0 -> NativeBridge.sendMouseButton(b.mouse, action, 0)
            b.key >= 0 -> NativeBridge.sendKey(b.key, b.key, action, 0)
        }
    }

    private fun releaseAll() {
        for (b in buttons) if (b.pointer != -1) {
            press(b, false)
            b.pointer = -1
        }
        removeCallbacks(holdRunnable)
        if (camHolding) NativeBridge.sendMouseButton(Glfw.MOUSE_LEFT, Glfw.RELEASE, 0)
        if (menuPointer != -1) NativeBridge.sendMouseButton(Glfw.MOUSE_LEFT, Glfw.RELEASE, 0)
        camPointer = -1
        camHolding = false
        menuPointer = -1
    }

    private fun cursorTo(x: Float, y: Float) = NativeBridge.sendCursor(x * bufferScaleX, y * bufferScaleY, 0f, 0f)

    /** Slot da hotbar sob o toque, usando a escala de GUI automática do Minecraft. */
    private fun hotbarSlot(x: Float, y: Float): Int? {
        if (bufferWidth <= 0 || bufferHeight <= 0) return null
        var s = 1
        while (bufferWidth / (s + 1) >= 320 && bufferHeight / (s + 1) >= 240) s++
        val bx = x * bufferScaleX
        val by = y * bufferScaleY
        val x0 = (bufferWidth - 182 * s) / 2f
        if (by < bufferHeight - 22 * s || bx < x0 || bx > x0 + 182 * s) return null
        return ((bx - x0 - s) / (20 * s)).toInt().coerceIn(0, 8)
    }
}
