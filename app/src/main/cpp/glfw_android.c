// Implementação própria da API GLFW 3.4 para Android, sobre EGL + ANativeWindow.
//
// O LWJGL oficial carrega esta biblioteca (-Dorg.lwjgl.glfw.libname) e resolve as
// funções por dlsym; o LWJGL 3.3.3 exige as 117 funções listadas em
// tools/glfw_required_lwjgl333.txt (verificado no CI).
//
// Modelo de threads:
//  - Thread de UI do Android: entrega superfície e eventos de entrada (fila com mutex).
//  - Thread de render do jogo: chama glfwPollEvents/glfwSwapBuffers; é a única que
//    toca o EGL e dispara callbacks, como no GLFW de desktop.
#include <android/native_window.h>
#include <android/native_window_jni.h>
#include <dlfcn.h>
#include <errno.h>
#include <pthread.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

#include "bp.h"

#define GLFWAPI BP_EXPORT

#define GLFW_TRUE 1
#define GLFW_FALSE 0
#define GLFW_RELEASE 0
#define GLFW_PRESS 1

#define GLFW_KEY_LAST 348
#define GLFW_MOUSE_BUTTON_LAST 7

#define GLFW_FOCUSED 0x00020001
#define GLFW_ICONIFIED 0x00020002
#define GLFW_RESIZABLE 0x00020003
#define GLFW_VISIBLE 0x00020004
#define GLFW_DECORATED 0x00020005
#define GLFW_MAXIMIZED 0x00020008
#define GLFW_HOVERED 0x0002000B
#define GLFW_CLIENT_API 0x00022001
#define GLFW_CONTEXT_VERSION_MAJOR 0x00022002
#define GLFW_CONTEXT_VERSION_MINOR 0x00022003
#define GLFW_OPENGL_API 0x00030001

#define GLFW_CURSOR 0x00033001
#define GLFW_STICKY_KEYS 0x00033002
#define GLFW_STICKY_MOUSE_BUTTONS 0x00033003
#define GLFW_LOCK_KEY_MODS 0x00033004
#define GLFW_RAW_MOUSE_MOTION 0x00033005
#define GLFW_CURSOR_NORMAL 0x00034001
#define GLFW_CURSOR_DISABLED 0x00034003

#define GLFW_PLATFORM_NULL 0x00060005

#ifndef EGL_OPENGL_ES3_BIT
#define EGL_OPENGL_ES3_BIT 0x00000040
#endif

typedef struct { int width, height, redBits, greenBits, blueBits, refreshRate; } GLFWvidmode;
typedef struct { unsigned short *red, *green, *blue; unsigned int size; } GLFWgammaramp;
typedef struct { unsigned char buttons[15]; float axes[6]; } GLFWgamepadstate;
typedef struct { int width, height; unsigned char *pixels; } GLFWimage;
typedef void GLFWmonitor;
typedef void GLFWcursor;
typedef void (*GLFWerrorfun)(int, const char *);

typedef void (*cb_win)(void *);
typedef void (*cb_win_i)(void *, int);
typedef void (*cb_win_ii)(void *, int, int);
typedef void (*cb_win_ff)(void *, float, float);
typedef void (*cb_win_dd)(void *, double, double);
typedef void (*cb_win_iii)(void *, int, int, int);
typedef void (*cb_win_iiii)(void *, int, int, int, int);
typedef void (*cb_win_u)(void *, unsigned int);
typedef void (*cb_win_ui)(void *, unsigned int, int);

typedef struct BPWindow {
    int width, height;
    int should_close;
    int focused;
    void *user;
    EGLContext context;
    EGLSurface surface;
    unsigned int surface_gen;
    int cursor_mode, sticky_keys, sticky_mouse, lock_mods, raw_motion;
    double cursor_x, cursor_y;
    unsigned char keys[GLFW_KEY_LAST + 1];
    unsigned char mouse[GLFW_MOUSE_BUTTON_LAST + 1];
    int64_t last_swap_end;
    // callbacks
    cb_win_ii pos_cb, size_cb, fb_size_cb;
    cb_win close_cb, refresh_cb;
    cb_win_i focus_cb, iconify_cb, maximize_cb, cursor_enter_cb;
    cb_win_ff content_scale_cb;
    cb_win_iiii key_cb;
    cb_win_u char_cb;
    cb_win_ui char_mods_cb;
    cb_win_iii mouse_button_cb;
    cb_win_dd cursor_pos_cb, scroll_cb;
    void *drop_cb;
} BPWindow;

// ---------------------------------------------------------------- estado global
static pthread_mutex_t g_lock = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t g_cond = PTHREAD_COND_INITIALIZER;

static ANativeWindow *g_native;     // superfície atual entregue pela UI (ref própria)
static unsigned int g_native_gen;   // muda a cada troca/destruição da superfície
static int g_surface_w = 1280, g_surface_h = 720, g_refresh = 60;

#define QUEUE_CAP 2048
static bp_event_t g_queue[QUEUE_CAP];
static int g_q_head, g_q_len;

static EGLDisplay g_dpy = EGL_NO_DISPLAY;
static EGLConfig g_cfg;
static EGLSurface g_pbuffer = EGL_NO_SURFACE;
static int g_gles = 2;

static BPWindow *g_window;          // o Minecraft cria uma janela
static __thread BPWindow *t_current;
static GLFWerrorfun g_error_cb;
static int64_t g_time_base;
static char *g_clipboard;           // texto do Android
static char *g_clip_request;        // texto que o jogo quer copiar
static int g_inited;

static GLFWvidmode g_mode;
static int g_monitor_tag;
static GLFWmonitor *g_monitors[1] = {&g_monitor_tag};
static void *g_monitor_user;

static void report_error(int code, const char *msg) {
    LOGE("GLFW erro 0x%x: %s", code, msg);
    if (g_error_cb) g_error_cb(code, msg);
}

// ---------------------------------------------------------------- API interna (UI)
void bp_set_refresh_rate(int hz) { if (hz > 0) g_refresh = hz; }

void bp_push_event(const bp_event_t *ev) {
    pthread_mutex_lock(&g_lock);
    if (g_q_len < QUEUE_CAP) {
        g_queue[(g_q_head + g_q_len) % QUEUE_CAP] = *ev;
        g_q_len++;
    } else if (ev->type == BP_EV_CURSOR && g_q_len > 0) {
        // fila cheia: funde movimento do cursor no último evento de cursor
        bp_event_t *last = &g_queue[(g_q_head + g_q_len - 1) % QUEUE_CAP];
        if (last->type == BP_EV_CURSOR) {
            last->x = ev->x; last->y = ev->y; last->dx += ev->dx; last->dy += ev->dy;
        }
    }
    pthread_cond_broadcast(&g_cond);
    pthread_mutex_unlock(&g_lock);
}

void bp_surface_set(JNIEnv *env, jobject surface, int width, int height) {
    ANativeWindow *win = surface ? ANativeWindow_fromSurface(env, surface) : NULL;
    pthread_mutex_lock(&g_lock);
    if (win != g_native) {
        if (g_native) ANativeWindow_release(g_native);
        g_native = win;  // fromSurface já devolve uma referência
        g_native_gen++;
    } else if (win) {
        ANativeWindow_release(win);
    }
    if (width > 0 && height > 0) {
        g_surface_w = width;
        g_surface_h = height;
    }
    pthread_cond_broadcast(&g_cond);
    pthread_mutex_unlock(&g_lock);

    bp_event_t ev = {.type = BP_EV_RESIZE, .a = width, .b = height};
    if (width > 0 && height > 0) bp_push_event(&ev);
    LOGI("superfície %dx%d", width, height);
}

void bp_surface_destroyed(void) {
    struct timespec deadline;
    pthread_mutex_lock(&g_lock);
    if (g_native) ANativeWindow_release(g_native);
    g_native = NULL;
    g_native_gen++;
    unsigned int gen = g_native_gen;
    pthread_cond_broadcast(&g_cond);
    // Espera a thread de render soltar a superfície EGL (máx. 2 s).
    clock_gettime(CLOCK_REALTIME, &deadline);
    deadline.tv_sec += 2;
    while (g_window && g_window->surface != EGL_NO_SURFACE && g_window->surface_gen != gen) {
        if (pthread_cond_timedwait(&g_cond, &g_lock, &deadline) == ETIMEDOUT) {
            LOGW("render não liberou a superfície a tempo");
            break;
        }
    }
    pthread_mutex_unlock(&g_lock);
}

int bp_cursor_grabbed(void) {
    BPWindow *w = g_window;
    return w && w->cursor_mode == GLFW_CURSOR_DISABLED;
}

void bp_clipboard_set_from_android(const char *text) {
    pthread_mutex_lock(&g_lock);
    free(g_clipboard);
    g_clipboard = text ? strdup(text) : NULL;
    pthread_mutex_unlock(&g_lock);
}

char *bp_clipboard_take_request(void) {
    pthread_mutex_lock(&g_lock);
    char *r = g_clip_request;
    g_clip_request = NULL;
    pthread_mutex_unlock(&g_lock);
    return r;
}

// ---------------------------------------------------------------- EGL
static int egl_setup(void) {
    if (g_dpy != EGL_NO_DISPLAY) return 1;
    if (!bp_egl_load()) return 0;
    const char *ver = getenv("BP_GLES_VERSION");
    g_gles = (ver && atoi(ver) >= 3) ? 3 : 2;

    EGLDisplay dpy = bp_egl.GetDisplay(EGL_DEFAULT_DISPLAY);
    if (dpy == EGL_NO_DISPLAY || !bp_egl.Initialize(dpy, NULL, NULL)) {
        LOGE("eglInitialize falhou: 0x%x", bp_egl.GetError());
        return 0;
    }
    EGLint renderable = g_gles == 3 ? EGL_OPENGL_ES3_BIT : EGL_OPENGL_ES2_BIT;
    const EGLint depths[] = {24, 16};
    EGLint n = 0;
    for (int i = 0; i < 2 && n == 0; i++) {
        EGLint attrs[] = {
            EGL_SURFACE_TYPE, EGL_WINDOW_BIT | EGL_PBUFFER_BIT,
            EGL_RENDERABLE_TYPE, renderable,
            EGL_RED_SIZE, 8, EGL_GREEN_SIZE, 8, EGL_BLUE_SIZE, 8, EGL_ALPHA_SIZE, 8,
            EGL_DEPTH_SIZE, depths[i], EGL_STENCIL_SIZE, 8,
            EGL_NONE,
        };
        bp_egl.ChooseConfig(dpy, attrs, &g_cfg, 1, &n);
    }
    if (n == 0) {
        LOGE("nenhuma config EGL para GLES %d", g_gles);
        return 0;
    }
    bp_egl.BindAPI(EGL_OPENGL_ES_API);
    const EGLint pb[] = {EGL_WIDTH, 1, EGL_HEIGHT, 1, EGL_NONE};
    g_pbuffer = bp_egl.CreatePbufferSurface(dpy, g_cfg, pb);
    g_dpy = dpy;
    LOGI("EGL pronto (GLES %d)", g_gles);
    return 1;
}

// Concilia a superfície EGL da janela com a ANativeWindow atual. Só na thread de render.
static void sync_surface(BPWindow *w) {
    pthread_mutex_lock(&g_lock);
    if (w->surface_gen == g_native_gen) {
        pthread_mutex_unlock(&g_lock);
        return;
    }
    if (t_current == w) bp_egl.MakeCurrent(g_dpy, g_pbuffer, g_pbuffer, w->context);
    if (w->surface != EGL_NO_SURFACE) {
        bp_egl.DestroySurface(g_dpy, w->surface);
        w->surface = EGL_NO_SURFACE;
    }
    if (g_native) {
        EGLint format = 0;
        bp_egl.GetConfigAttrib(g_dpy, g_cfg, EGL_NATIVE_VISUAL_ID, &format);
        ANativeWindow_setBuffersGeometry(g_native, 0, 0, format);
        w->surface = bp_egl.CreateWindowSurface(g_dpy, g_cfg, (EGLNativeWindowType) g_native, NULL);
        if (w->surface == EGL_NO_SURFACE) LOGE("eglCreateWindowSurface: 0x%x", bp_egl.GetError());
    }
    w->surface_gen = g_native_gen;
    pthread_cond_broadcast(&g_cond);  // libera bp_surface_destroyed
    pthread_mutex_unlock(&g_lock);

    if (t_current == w) {
        EGLSurface s = w->surface != EGL_NO_SURFACE ? w->surface : g_pbuffer;
        bp_egl.MakeCurrent(g_dpy, s, s, w->context);
    }
}

// ---------------------------------------------------------------- init / versão
GLFWAPI int glfwInit(void) {
    if (g_inited) return GLFW_TRUE;
    g_time_base = bp_now_ns();
    if (!egl_setup()) {
        report_error(0x00010008, "EGL indisponível");
        return GLFW_FALSE;
    }
    g_inited = 1;
    return GLFW_TRUE;
}

GLFWAPI void glfwTerminate(void) { g_inited = 0; }
GLFWAPI void glfwInitHint(int hint, int value) { (void) hint; (void) value; }
GLFWAPI void glfwInitAllocator(const void *allocator) { (void) allocator; }

GLFWAPI void glfwGetVersion(int *major, int *minor, int *rev) {
    if (major) *major = 3;
    if (minor) *minor = 4;
    if (rev) *rev = 0;
}

GLFWAPI const char *glfwGetVersionString(void) { return "3.4.0 BlockPort Android EGL"; }

GLFWAPI int glfwGetError(const char **description) {
    if (description) *description = NULL;
    return 0;
}

GLFWAPI GLFWerrorfun glfwSetErrorCallback(GLFWerrorfun cb) {
    GLFWerrorfun prev = g_error_cb;
    g_error_cb = cb;
    return prev;
}

GLFWAPI int glfwGetPlatform(void) { return GLFW_PLATFORM_NULL; }
GLFWAPI int glfwPlatformSupported(int p) { return p == GLFW_PLATFORM_NULL; }

// ---------------------------------------------------------------- monitores
static void refresh_mode(void) {
    g_mode.width = g_surface_w;
    g_mode.height = g_surface_h;
    g_mode.redBits = g_mode.greenBits = g_mode.blueBits = 8;
    g_mode.refreshRate = g_refresh;
}

GLFWAPI GLFWmonitor **glfwGetMonitors(int *count) {
    if (count) *count = 1;
    return g_monitors;
}
GLFWAPI GLFWmonitor *glfwGetPrimaryMonitor(void) { return g_monitors[0]; }
GLFWAPI void glfwGetMonitorPos(GLFWmonitor *m, int *x, int *y) {
    (void) m;
    if (x) *x = 0;
    if (y) *y = 0;
}
GLFWAPI void glfwGetMonitorWorkarea(GLFWmonitor *m, int *x, int *y, int *w, int *h) {
    (void) m;
    if (x) *x = 0;
    if (y) *y = 0;
    if (w) *w = g_surface_w;
    if (h) *h = g_surface_h;
}
GLFWAPI void glfwGetMonitorPhysicalSize(GLFWmonitor *m, int *w, int *h) {
    (void) m;
    if (w) *w = 150;
    if (h) *h = 70;
}
GLFWAPI void glfwGetMonitorContentScale(GLFWmonitor *m, float *x, float *y) {
    (void) m;
    if (x) *x = 1.f;
    if (y) *y = 1.f;
}
GLFWAPI const char *glfwGetMonitorName(GLFWmonitor *m) { (void) m; return "Android"; }
GLFWAPI void glfwSetMonitorUserPointer(GLFWmonitor *m, void *p) { (void) m; g_monitor_user = p; }
GLFWAPI void *glfwGetMonitorUserPointer(GLFWmonitor *m) { (void) m; return g_monitor_user; }
GLFWAPI void *glfwSetMonitorCallback(void *cb) { (void) cb; return NULL; }
GLFWAPI const GLFWvidmode *glfwGetVideoModes(GLFWmonitor *m, int *count) {
    (void) m;
    refresh_mode();
    if (count) *count = 1;
    return &g_mode;
}
GLFWAPI const GLFWvidmode *glfwGetVideoMode(GLFWmonitor *m) {
    (void) m;
    refresh_mode();
    return &g_mode;
}
GLFWAPI void glfwSetGamma(GLFWmonitor *m, float g) { (void) m; (void) g; }
GLFWAPI const GLFWgammaramp *glfwGetGammaRamp(GLFWmonitor *m) { (void) m; return NULL; }
GLFWAPI void glfwSetGammaRamp(GLFWmonitor *m, const GLFWgammaramp *r) { (void) m; (void) r; }

// ---------------------------------------------------------------- janela
GLFWAPI void glfwDefaultWindowHints(void) {}
GLFWAPI void glfwWindowHint(int hint, int value) { (void) hint; (void) value; }
GLFWAPI void glfwWindowHintString(int hint, const char *value) { (void) hint; (void) value; }

GLFWAPI void *glfwCreateWindow(int width, int height, const char *title, GLFWmonitor *monitor, void *share) {
    (void) width; (void) height; (void) monitor;
    if (!g_inited && !glfwInit()) return NULL;
    if (g_window) {
        report_error(0x00010008, "só uma janela é suportada");
        return NULL;
    }

    // Espera a UI entregar a superfície (até 30 s).
    struct timespec deadline;
    pthread_mutex_lock(&g_lock);
    clock_gettime(CLOCK_REALTIME, &deadline);
    deadline.tv_sec += 30;
    while (!g_native) {
        if (pthread_cond_timedwait(&g_cond, &g_lock, &deadline) == ETIMEDOUT) break;
    }
    int has_surface = g_native != NULL;
    pthread_mutex_unlock(&g_lock);
    if (!has_surface) LOGW("criando janela sem superfície; render vai para pbuffer");

    BPWindow *w = calloc(1, sizeof(BPWindow));
    if (!w) return NULL;
    const EGLint ctx_attrs[] = {EGL_CONTEXT_CLIENT_VERSION, g_gles, EGL_NONE};
    EGLContext shared = share ? ((BPWindow *) share)->context : EGL_NO_CONTEXT;
    w->context = bp_egl.CreateContext(g_dpy, g_cfg, shared, ctx_attrs);
    if (w->context == EGL_NO_CONTEXT) {
        report_error(0x00010007, "eglCreateContext falhou");
        free(w);
        return NULL;
    }
    w->surface = EGL_NO_SURFACE;
    w->surface_gen = (unsigned int) -1;  // força sincronização
    w->width = g_surface_w;
    w->height = g_surface_h;
    w->focused = 1;
    w->cursor_mode = GLFW_CURSOR_NORMAL;
    w->cursor_x = g_surface_w / 2.0;
    w->cursor_y = g_surface_h / 2.0;
    g_window = w;
    LOGI("janela criada: \"%s\" %dx%d", title ? title : "", w->width, w->height);
    return w;
}

GLFWAPI void glfwDestroyWindow(void *handle) {
    BPWindow *w = handle;
    if (!w) return;
    if (t_current == w) {
        bp_egl.MakeCurrent(g_dpy, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
        t_current = NULL;
    }
    if (w->surface != EGL_NO_SURFACE) bp_egl.DestroySurface(g_dpy, w->surface);
    if (w->context != EGL_NO_CONTEXT) bp_egl.DestroyContext(g_dpy, w->context);
    pthread_mutex_lock(&g_lock);
    if (g_window == w) g_window = NULL;
    pthread_cond_broadcast(&g_cond);
    pthread_mutex_unlock(&g_lock);
    free(w);
}

GLFWAPI int glfwWindowShouldClose(void *h) { return h ? ((BPWindow *) h)->should_close : GLFW_TRUE; }
GLFWAPI void glfwSetWindowShouldClose(void *h, int v) { if (h) ((BPWindow *) h)->should_close = v; }
GLFWAPI void glfwSetWindowTitle(void *h, const char *t) { (void) h; (void) t; }
GLFWAPI void glfwSetWindowIcon(void *h, int c, const GLFWimage *i) { (void) h; (void) c; (void) i; }
GLFWAPI void glfwGetWindowPos(void *h, int *x, int *y) {
    (void) h;
    if (x) *x = 0;
    if (y) *y = 0;
}
GLFWAPI void glfwSetWindowPos(void *h, int x, int y) { (void) h; (void) x; (void) y; }
GLFWAPI void glfwGetWindowSize(void *h, int *w, int *hh) {
    BPWindow *win = h;
    if (w) *w = win ? win->width : 0;
    if (hh) *hh = win ? win->height : 0;
}
GLFWAPI void glfwSetWindowSizeLimits(void *h, int a, int b, int c, int d) { (void) h; (void) a; (void) b; (void) c; (void) d; }
GLFWAPI void glfwSetWindowAspectRatio(void *h, int n, int d) { (void) h; (void) n; (void) d; }
GLFWAPI void glfwSetWindowSize(void *h, int w, int hh) { (void) h; (void) w; (void) hh; }
GLFWAPI void glfwGetFramebufferSize(void *h, int *w, int *hh) { glfwGetWindowSize(h, w, hh); }
GLFWAPI void glfwGetWindowFrameSize(void *h, int *l, int *t, int *r, int *b) {
    (void) h;
    if (l) *l = 0;
    if (t) *t = 0;
    if (r) *r = 0;
    if (b) *b = 0;
}
GLFWAPI void glfwGetWindowContentScale(void *h, float *x, float *y) {
    (void) h;
    if (x) *x = 1.f;
    if (y) *y = 1.f;
}
GLFWAPI float glfwGetWindowOpacity(void *h) { (void) h; return 1.f; }
GLFWAPI void glfwSetWindowOpacity(void *h, float o) { (void) h; (void) o; }
GLFWAPI void glfwIconifyWindow(void *h) { (void) h; }
GLFWAPI void glfwRestoreWindow(void *h) { (void) h; }
GLFWAPI void glfwMaximizeWindow(void *h) { (void) h; }
GLFWAPI void glfwShowWindow(void *h) { (void) h; }
GLFWAPI void glfwHideWindow(void *h) { (void) h; }
GLFWAPI void glfwFocusWindow(void *h) { (void) h; }
GLFWAPI void glfwRequestWindowAttention(void *h) { (void) h; }
GLFWAPI GLFWmonitor *glfwGetWindowMonitor(void *h) { (void) h; return NULL; }
GLFWAPI void glfwSetWindowMonitor(void *h, GLFWmonitor *m, int x, int y, int w, int hh, int r) {
    (void) h; (void) m; (void) x; (void) y; (void) w; (void) hh; (void) r;
}

GLFWAPI int glfwGetWindowAttrib(void *h, int attrib) {
    BPWindow *w = h;
    switch (attrib) {
        case GLFW_FOCUSED: return w ? w->focused : 0;
        case GLFW_VISIBLE:
        case GLFW_HOVERED:
        case GLFW_DECORATED:
        case GLFW_MAXIMIZED: return GLFW_TRUE;
        case GLFW_ICONIFIED:
        case GLFW_RESIZABLE: return GLFW_FALSE;
        case GLFW_CLIENT_API: return GLFW_OPENGL_API;
        case GLFW_CONTEXT_VERSION_MAJOR: return g_gles == 3 ? 3 : 2;
        case GLFW_CONTEXT_VERSION_MINOR: return g_gles == 3 ? 2 : 1;
        default: return 0;
    }
}
GLFWAPI void glfwSetWindowAttrib(void *h, int a, int v) { (void) h; (void) a; (void) v; }
GLFWAPI void glfwSetWindowUserPointer(void *h, void *p) { if (h) ((BPWindow *) h)->user = p; }
GLFWAPI void *glfwGetWindowUserPointer(void *h) { return h ? ((BPWindow *) h)->user : NULL; }

#define SETTER(fn, field, type)                                   \
    GLFWAPI void *fn(void *h, void *cb) {                         \
        BPWindow *w = h;                                          \
        if (!w) return NULL;                                      \
        void *prev = (void *) w->field;                           \
        w->field = (type) cb;                                     \
        return prev;                                              \
    }

SETTER(glfwSetWindowPosCallback, pos_cb, cb_win_ii)
SETTER(glfwSetWindowSizeCallback, size_cb, cb_win_ii)
SETTER(glfwSetWindowCloseCallback, close_cb, cb_win)
SETTER(glfwSetWindowRefreshCallback, refresh_cb, cb_win)
SETTER(glfwSetWindowFocusCallback, focus_cb, cb_win_i)
SETTER(glfwSetWindowIconifyCallback, iconify_cb, cb_win_i)
SETTER(glfwSetWindowMaximizeCallback, maximize_cb, cb_win_i)
SETTER(glfwSetFramebufferSizeCallback, fb_size_cb, cb_win_ii)
SETTER(glfwSetWindowContentScaleCallback, content_scale_cb, cb_win_ff)
SETTER(glfwSetKeyCallback, key_cb, cb_win_iiii)
SETTER(glfwSetCharCallback, char_cb, cb_win_u)
SETTER(glfwSetCharModsCallback, char_mods_cb, cb_win_ui)
SETTER(glfwSetMouseButtonCallback, mouse_button_cb, cb_win_iii)
SETTER(glfwSetCursorPosCallback, cursor_pos_cb, cb_win_dd)
SETTER(glfwSetCursorEnterCallback, cursor_enter_cb, cb_win_i)
SETTER(glfwSetScrollCallback, scroll_cb, cb_win_dd)
SETTER(glfwSetDropCallback, drop_cb, void *)

// ---------------------------------------------------------------- eventos
static void dispatch(BPWindow *w, const bp_event_t *e) {
    switch (e->type) {
        case BP_EV_KEY:
            if (e->a >= 0 && e->a <= GLFW_KEY_LAST) w->keys[e->a] = e->c != GLFW_RELEASE;
            if (w->key_cb) w->key_cb(w, e->a, e->b, e->c, e->d);
            break;
        case BP_EV_CHAR:
            if (w->char_cb) w->char_cb(w, (unsigned int) e->a);
            if (w->char_mods_cb) w->char_mods_cb(w, (unsigned int) e->a, e->b);
            break;
        case BP_EV_MOUSE_BUTTON:
            if (e->a >= 0 && e->a <= GLFW_MOUSE_BUTTON_LAST) w->mouse[e->a] = e->b == GLFW_PRESS;
            if (w->mouse_button_cb) w->mouse_button_cb(w, e->a, e->b, e->c);
            break;
        case BP_EV_CURSOR:
            if (w->cursor_mode == GLFW_CURSOR_DISABLED) {
                // Câmera: posição virtual ilimitada, acumula deltas (como o GLFW desktop).
                w->cursor_x += e->dx;
                w->cursor_y += e->dy;
            } else {
                w->cursor_x = e->x;
                w->cursor_y = e->y;
            }
            if (w->cursor_pos_cb) w->cursor_pos_cb(w, w->cursor_x, w->cursor_y);
            break;
        case BP_EV_SCROLL:
            if (w->scroll_cb) w->scroll_cb(w, e->x, e->y);
            break;
        case BP_EV_RESIZE:
            if (e->a > 0 && e->b > 0 && (e->a != w->width || e->b != w->height)) {
                w->width = e->a;
                w->height = e->b;
                if (w->fb_size_cb) w->fb_size_cb(w, e->a, e->b);
                if (w->size_cb) w->size_cb(w, e->a, e->b);
            }
            break;
        case BP_EV_FOCUS:
            w->focused = e->a;
            if (w->focus_cb) w->focus_cb(w, e->a);
            break;
        default:
            break;
    }
}

static void drain(void) {
    bp_event_t local[256];
    BPWindow *w = g_window;
    for (;;) {
        int n = 0;
        pthread_mutex_lock(&g_lock);
        while (g_q_len > 0 && n < 256) {
            local[n++] = g_queue[g_q_head];
            g_q_head = (g_q_head + 1) % QUEUE_CAP;
            g_q_len--;
        }
        pthread_mutex_unlock(&g_lock);
        if (n == 0) return;
        // Callbacks fora do lock: podem chamar outras funções GLFW.
        if (w) for (int i = 0; i < n; i++) dispatch(w, &local[i]);
    }
}

static void wait_events(double timeout_s) {
    pthread_mutex_lock(&g_lock);
    if (g_q_len == 0) {
        if (timeout_s < 0) {
            pthread_cond_wait(&g_cond, &g_lock);
        } else {
            struct timespec ts;
            clock_gettime(CLOCK_REALTIME, &ts);
            int64_t ns = ts.tv_nsec + (int64_t) (timeout_s * 1e9);
            ts.tv_sec += ns / 1000000000LL;
            ts.tv_nsec = ns % 1000000000LL;
            pthread_cond_timedwait(&g_cond, &g_lock, &ts);
        }
    }
    pthread_mutex_unlock(&g_lock);
    drain();
}

GLFWAPI void glfwPollEvents(void) { drain(); }
GLFWAPI void glfwWaitEvents(void) { wait_events(-1); }
GLFWAPI void glfwWaitEventsTimeout(double t) { wait_events(t); }
GLFWAPI void glfwPostEmptyEvent(void) {
    pthread_mutex_lock(&g_lock);
    pthread_cond_broadcast(&g_cond);
    pthread_mutex_unlock(&g_lock);
}

// ---------------------------------------------------------------- entrada
GLFWAPI int glfwGetInputMode(void *h, int mode) {
    BPWindow *w = h;
    if (!w) return 0;
    switch (mode) {
        case GLFW_CURSOR: return w->cursor_mode;
        case GLFW_STICKY_KEYS: return w->sticky_keys;
        case GLFW_STICKY_MOUSE_BUTTONS: return w->sticky_mouse;
        case GLFW_LOCK_KEY_MODS: return w->lock_mods;
        case GLFW_RAW_MOUSE_MOTION: return w->raw_motion;
        default: return 0;
    }
}

GLFWAPI void glfwSetInputMode(void *h, int mode, int value) {
    BPWindow *w = h;
    if (!w) return;
    switch (mode) {
        case GLFW_CURSOR:
            if (value != w->cursor_mode) LOGI("cursor %s", value == GLFW_CURSOR_DISABLED ? "capturado" : "livre");
            w->cursor_mode = value;
            break;
        case GLFW_STICKY_KEYS: w->sticky_keys = value; break;
        case GLFW_STICKY_MOUSE_BUTTONS: w->sticky_mouse = value; break;
        case GLFW_LOCK_KEY_MODS: w->lock_mods = value; break;
        case GLFW_RAW_MOUSE_MOTION: w->raw_motion = value; break;
        default: break;
    }
}

GLFWAPI int glfwRawMouseMotionSupported(void) { return GLFW_TRUE; }
GLFWAPI const char *glfwGetKeyName(int key, int scancode) { (void) key; (void) scancode; return NULL; }
GLFWAPI int glfwGetKeyScancode(int key) { return key; }
GLFWAPI int glfwGetKey(void *h, int key) {
    BPWindow *w = h;
    if (!w || key < 0 || key > GLFW_KEY_LAST) return GLFW_RELEASE;
    return w->keys[key] ? GLFW_PRESS : GLFW_RELEASE;
}
GLFWAPI int glfwGetMouseButton(void *h, int b) {
    BPWindow *w = h;
    if (!w || b < 0 || b > GLFW_MOUSE_BUTTON_LAST) return GLFW_RELEASE;
    return w->mouse[b] ? GLFW_PRESS : GLFW_RELEASE;
}
GLFWAPI void glfwGetCursorPos(void *h, double *x, double *y) {
    BPWindow *w = h;
    if (x) *x = w ? w->cursor_x : 0;
    if (y) *y = w ? w->cursor_y : 0;
}
GLFWAPI void glfwSetCursorPos(void *h, double x, double y) {
    BPWindow *w = h;
    if (!w) return;
    w->cursor_x = x;
    w->cursor_y = y;
}

static int g_cursor_tag;
GLFWAPI GLFWcursor *glfwCreateCursor(const GLFWimage *img, int x, int y) { (void) img; (void) x; (void) y; return &g_cursor_tag; }
GLFWAPI GLFWcursor *glfwCreateStandardCursor(int shape) { (void) shape; return &g_cursor_tag; }
GLFWAPI void glfwDestroyCursor(GLFWcursor *c) { (void) c; }
GLFWAPI void glfwSetCursor(void *h, GLFWcursor *c) { (void) h; (void) c; }

// Joysticks: controles físicos chegam como teclado/mouse pela UI por enquanto.
GLFWAPI int glfwJoystickPresent(int jid) { (void) jid; return GLFW_FALSE; }
GLFWAPI const float *glfwGetJoystickAxes(int jid, int *count) { (void) jid; if (count) *count = 0; return NULL; }
GLFWAPI const unsigned char *glfwGetJoystickButtons(int jid, int *count) { (void) jid; if (count) *count = 0; return NULL; }
GLFWAPI const unsigned char *glfwGetJoystickHats(int jid, int *count) { (void) jid; if (count) *count = 0; return NULL; }
GLFWAPI const char *glfwGetJoystickName(int jid) { (void) jid; return NULL; }
GLFWAPI const char *glfwGetJoystickGUID(int jid) { (void) jid; return NULL; }
GLFWAPI void glfwSetJoystickUserPointer(int jid, void *p) { (void) jid; (void) p; }
GLFWAPI void *glfwGetJoystickUserPointer(int jid) { (void) jid; return NULL; }
GLFWAPI int glfwJoystickIsGamepad(int jid) { (void) jid; return GLFW_FALSE; }
GLFWAPI void *glfwSetJoystickCallback(void *cb) { (void) cb; return NULL; }
GLFWAPI int glfwUpdateGamepadMappings(const char *s) { (void) s; return GLFW_TRUE; }
GLFWAPI const char *glfwGetGamepadName(int jid) { (void) jid; return NULL; }
GLFWAPI int glfwGetGamepadState(int jid, GLFWgamepadstate *s) { (void) jid; (void) s; return GLFW_FALSE; }

GLFWAPI void glfwSetClipboardString(void *h, const char *s) {
    (void) h;
    pthread_mutex_lock(&g_lock);
    free(g_clip_request);
    g_clip_request = s ? strdup(s) : NULL;
    free(g_clipboard);
    g_clipboard = s ? strdup(s) : NULL;
    pthread_mutex_unlock(&g_lock);
}

GLFWAPI const char *glfwGetClipboardString(void *h) {
    (void) h;
    // Ponteiro válido até a próxima chamada (contrato do GLFW).
    static char *copy;
    pthread_mutex_lock(&g_lock);
    free(copy);
    copy = g_clipboard ? strdup(g_clipboard) : NULL;
    pthread_mutex_unlock(&g_lock);
    return copy;
}

// ---------------------------------------------------------------- tempo
GLFWAPI double glfwGetTime(void) { return (double) (bp_now_ns() - g_time_base) / 1e9; }
GLFWAPI void glfwSetTime(double t) { g_time_base = bp_now_ns() - (int64_t) (t * 1e9); }
GLFWAPI uint64_t glfwGetTimerValue(void) { return (uint64_t) bp_now_ns(); }
GLFWAPI uint64_t glfwGetTimerFrequency(void) { return 1000000000ULL; }

// ---------------------------------------------------------------- contexto
GLFWAPI void glfwMakeContextCurrent(void *h) {
    BPWindow *w = h;
    if (!w) {
        if (g_dpy != EGL_NO_DISPLAY) bp_egl.MakeCurrent(g_dpy, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
        t_current = NULL;
        return;
    }
    t_current = w;
    if (w->surface == EGL_NO_SURFACE) w->surface_gen = (unsigned int) -1;  // força criar a superfície
    sync_surface(w);
    EGLSurface s = w->surface != EGL_NO_SURFACE ? w->surface : g_pbuffer;
    if (!bp_egl.MakeCurrent(g_dpy, s, s, w->context)) LOGE("eglMakeCurrent: 0x%x", bp_egl.GetError());
    bp_perf_render_thread_init();
    w->last_swap_end = bp_now_ns();
}

GLFWAPI void *glfwGetCurrentContext(void) { return t_current; }

GLFWAPI void glfwSwapBuffers(void *h) {
    BPWindow *w = h;
    if (!w) return;
    int64_t start = bp_now_ns();
    bp_perf_report_frame(start - w->last_swap_end);
    sync_surface(w);
    if (w->surface != EGL_NO_SURFACE) {
        if (!bp_egl.SwapBuffers(g_dpy, w->surface)) {
            EGLint err = bp_egl.GetError();
            LOGW("eglSwapBuffers: 0x%x", err);
        }
    } else {
        // Em segundo plano: não renderiza na tela e poupa bateria/temperatura.
        usleep(50000);
    }
    w->last_swap_end = bp_now_ns();
}

GLFWAPI void glfwSwapInterval(int interval) {
    if (g_dpy != EGL_NO_DISPLAY && bp_egl.SwapInterval) bp_egl.SwapInterval(g_dpy, interval);
}

GLFWAPI int glfwExtensionSupported(const char *ext) { (void) ext; return GLFW_FALSE; }

GLFWAPI void *glfwGetProcAddress(const char *name) {
    static void *gl;
    static int tried;
    if (!tried) {
        tried = 1;
        const char *lib = getenv("BP_GL_LIB");
        if (lib && *lib) gl = dlopen(lib, RTLD_LAZY | RTLD_GLOBAL);
    }
    void *p = gl ? dlsym(gl, name) : NULL;
    if (!p && bp_egl.GetProcAddress) p = bp_egl.GetProcAddress(name);
    return p;
}
