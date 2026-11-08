// BlockPort native runtime: interno, compartilhado entre os módulos C.
#pragma once

#include <EGL/egl.h>
#include <android/log.h>
#include <jni.h>
#include <stdint.h>

#define BP_TAG "BlockPort"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, BP_TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN, BP_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, BP_TAG, __VA_ARGS__)
#define BP_EXPORT __attribute__((visibility("default")))

// ---- EGL carregado dinamicamente (permite wrappers como o LTW) ----
typedef struct {
    EGLDisplay (*GetDisplay)(EGLNativeDisplayType);
    EGLBoolean (*Initialize)(EGLDisplay, EGLint *, EGLint *);
    EGLBoolean (*ChooseConfig)(EGLDisplay, const EGLint *, EGLConfig *, EGLint, EGLint *);
    EGLBoolean (*GetConfigAttrib)(EGLDisplay, EGLConfig, EGLint, EGLint *);
    EGLBoolean (*BindAPI)(EGLenum);
    EGLContext (*CreateContext)(EGLDisplay, EGLConfig, EGLContext, const EGLint *);
    EGLBoolean (*DestroyContext)(EGLDisplay, EGLContext);
    EGLSurface (*CreateWindowSurface)(EGLDisplay, EGLConfig, EGLNativeWindowType, const EGLint *);
    EGLSurface (*CreatePbufferSurface)(EGLDisplay, EGLConfig, const EGLint *);
    EGLBoolean (*DestroySurface)(EGLDisplay, EGLSurface);
    EGLBoolean (*MakeCurrent)(EGLDisplay, EGLSurface, EGLSurface, EGLContext);
    EGLBoolean (*SwapBuffers)(EGLDisplay, EGLSurface);
    EGLBoolean (*SwapInterval)(EGLDisplay, EGLint);
    EGLint (*GetError)(void);
    void *(*GetProcAddress)(const char *);
} bp_egl_t;

extern bp_egl_t bp_egl;
int bp_egl_load(void);

// ---- Desempenho ----
int64_t bp_now_ns(void);
/** Chamado uma vez na thread de render: fixa nos núcleos grandes e abre sessão de Performance Hint. */
void bp_perf_render_thread_init(void);
/** Reporta o tempo de CPU do último frame (ns) ao Android. */
void bp_perf_report_frame(int64_t work_ns);

// ---- Superfície / entrada (glfw_android.c) ----
void bp_surface_set(JNIEnv *env, jobject surface, int width, int height);
void bp_surface_destroyed(void);

enum {
    BP_EV_KEY = 1,
    BP_EV_CHAR,
    BP_EV_MOUSE_BUTTON,
    BP_EV_CURSOR,
    BP_EV_SCROLL,
    BP_EV_RESIZE,
    BP_EV_FOCUS,
};

typedef struct {
    int type;
    int a, b, c, d;
    double x, y, dx, dy;
} bp_event_t;

void bp_push_event(const bp_event_t *ev);
int bp_cursor_grabbed(void);
void bp_set_refresh_rate(int hz);
void bp_clipboard_set_from_android(const char *text);
/** Devolve (malloc) texto que o jogo pediu para copiar, ou NULL. */
char *bp_clipboard_take_request(void);

// ---- JVM (jvm_launcher.c) ----
int bp_launch_jvm(const char *java_home, int argc, char **argv, const char *log_path);
