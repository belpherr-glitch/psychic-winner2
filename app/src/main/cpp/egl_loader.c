// Carrega EGL do sistema e, opcionalmente, sobrepõe as funções de contexto
// com as de um wrapper (BP_EGL_LIB, ex.: libltw.so), que precisa ver todos os
// contextos criados para traduzir OpenGL 3.x -> GLES 3.
#include <dlfcn.h>
#include <stdlib.h>

#include "bp.h"

bp_egl_t bp_egl;
static int g_loaded;

#define LOAD(h, field, name) (*(void **)(&bp_egl.field) = dlsym((h), (name)))

int bp_egl_load(void) {
    if (g_loaded) return 1;
    void *sys = dlopen("libEGL.so", RTLD_NOW | RTLD_LOCAL);
    if (!sys) {
        LOGE("dlopen libEGL.so: %s", dlerror());
        return 0;
    }
    LOAD(sys, GetDisplay, "eglGetDisplay");
    LOAD(sys, Initialize, "eglInitialize");
    LOAD(sys, ChooseConfig, "eglChooseConfig");
    LOAD(sys, GetConfigAttrib, "eglGetConfigAttrib");
    LOAD(sys, BindAPI, "eglBindAPI");
    LOAD(sys, CreateContext, "eglCreateContext");
    LOAD(sys, DestroyContext, "eglDestroyContext");
    LOAD(sys, CreateWindowSurface, "eglCreateWindowSurface");
    LOAD(sys, CreatePbufferSurface, "eglCreatePbufferSurface");
    LOAD(sys, DestroySurface, "eglDestroySurface");
    LOAD(sys, MakeCurrent, "eglMakeCurrent");
    LOAD(sys, SwapBuffers, "eglSwapBuffers");
    LOAD(sys, SwapInterval, "eglSwapInterval");
    LOAD(sys, GetError, "eglGetError");
    LOAD(sys, GetProcAddress, "eglGetProcAddress");

    const char *wrapper = getenv("BP_EGL_LIB");
    if (wrapper && *wrapper) {
        // Mesmo caminho absoluto que o LWJGL usará para o GL: mesma instância.
        void *w = dlopen(wrapper, RTLD_NOW | RTLD_GLOBAL);
        if (!w) {
            LOGE("dlopen %s: %s", wrapper, dlerror());
        } else {
            void *p;
            if ((p = dlsym(w, "eglCreateContext"))) *(void **)(&bp_egl.CreateContext) = p;
            if ((p = dlsym(w, "eglDestroyContext"))) *(void **)(&bp_egl.DestroyContext) = p;
            if ((p = dlsym(w, "eglMakeCurrent"))) *(void **)(&bp_egl.MakeCurrent) = p;
            if ((p = dlsym(w, "eglGetProcAddress"))) *(void **)(&bp_egl.GetProcAddress) = p;
            LOGI("EGL wrapper ativo: %s", wrapper);
        }
    }

    if (!bp_egl.GetDisplay || !bp_egl.CreateContext || !bp_egl.MakeCurrent || !bp_egl.SwapBuffers) {
        LOGE("EGL incompleto");
        return 0;
    }
    g_loaded = 1;
    return 1;
}
