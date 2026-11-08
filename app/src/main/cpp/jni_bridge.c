// Ponte JNI chamada pelo ART (dev.blockport.launcher.game.NativeBridge).
#include <stdlib.h>
#include <string.h>

#include "bp.h"

#define JNI_FN(name) JNIEXPORT JNICALL Java_dev_blockport_launcher_game_NativeBridge_##name

jint JNI_FN(launchJvm)(JNIEnv *env, jclass clazz, jstring jhome, jobjectArray jargs, jstring jlog) {
    (void) clazz;
    const char *home = (*env)->GetStringUTFChars(env, jhome, NULL);
    const char *log = (*env)->GetStringUTFChars(env, jlog, NULL);
    int argc = (*env)->GetArrayLength(env, jargs);
    char **argv = calloc((size_t) argc + 1, sizeof(char *));
    for (int i = 0; i < argc; i++) {
        jstring s = (jstring) (*env)->GetObjectArrayElement(env, jargs, i);
        const char *c = (*env)->GetStringUTFChars(env, s, NULL);
        argv[i] = strdup(c);
        (*env)->ReleaseStringUTFChars(env, s, c);
        (*env)->DeleteLocalRef(env, s);
    }
    // Copias: a JVM roda nesta chamada e as strings do ART precisam sobreviver.
    char *home_copy = strdup(home);
    char *log_copy = strdup(log);
    (*env)->ReleaseStringUTFChars(env, jhome, home);
    (*env)->ReleaseStringUTFChars(env, jlog, log);
    return bp_launch_jvm(home_copy, argc, argv, log_copy);
}

void JNI_FN(setSurface)(JNIEnv *env, jclass clazz, jobject surface, jint w, jint h) {
    (void) clazz;
    bp_surface_set(env, surface, w, h);
}

void JNI_FN(surfaceDestroyed)(JNIEnv *env, jclass clazz) {
    (void) env; (void) clazz;
    bp_surface_destroyed();
}

void JNI_FN(setRefreshRate)(JNIEnv *env, jclass clazz, jint hz) {
    (void) env; (void) clazz;
    bp_set_refresh_rate(hz);
}

void JNI_FN(sendKey)(JNIEnv *env, jclass clazz, jint key, jint scancode, jint action, jint mods) {
    (void) env; (void) clazz;
    bp_event_t e = {.type = BP_EV_KEY, .a = key, .b = scancode, .c = action, .d = mods};
    bp_push_event(&e);
}

void JNI_FN(sendChar)(JNIEnv *env, jclass clazz, jint codepoint, jint mods) {
    (void) env; (void) clazz;
    bp_event_t e = {.type = BP_EV_CHAR, .a = codepoint, .b = mods};
    bp_push_event(&e);
}

void JNI_FN(sendMouseButton)(JNIEnv *env, jclass clazz, jint button, jint action, jint mods) {
    (void) env; (void) clazz;
    bp_event_t e = {.type = BP_EV_MOUSE_BUTTON, .a = button, .b = action, .c = mods};
    bp_push_event(&e);
}

void JNI_FN(sendCursor)(JNIEnv *env, jclass clazz, jfloat x, jfloat y, jfloat dx, jfloat dy) {
    (void) env; (void) clazz;
    bp_event_t e = {.type = BP_EV_CURSOR, .x = x, .y = y, .dx = dx, .dy = dy};
    bp_push_event(&e);
}

void JNI_FN(sendScroll)(JNIEnv *env, jclass clazz, jfloat x, jfloat y) {
    (void) env; (void) clazz;
    bp_event_t e = {.type = BP_EV_SCROLL, .x = x, .y = y};
    bp_push_event(&e);
}

void JNI_FN(setFocused)(JNIEnv *env, jclass clazz, jboolean focused) {
    (void) env; (void) clazz;
    bp_event_t e = {.type = BP_EV_FOCUS, .a = focused ? 1 : 0};
    bp_push_event(&e);
}

jboolean JNI_FN(isCursorGrabbed)(JNIEnv *env, jclass clazz) {
    (void) env; (void) clazz;
    return bp_cursor_grabbed() ? JNI_TRUE : JNI_FALSE;
}

void JNI_FN(setClipboard)(JNIEnv *env, jclass clazz, jstring text) {
    (void) clazz;
    if (!text) {
        bp_clipboard_set_from_android(NULL);
        return;
    }
    const char *c = (*env)->GetStringUTFChars(env, text, NULL);
    bp_clipboard_set_from_android(c);
    (*env)->ReleaseStringUTFChars(env, text, c);
}

jstring JNI_FN(takeClipboardRequest)(JNIEnv *env, jclass clazz) {
    (void) clazz;
    char *r = bp_clipboard_take_request();
    if (!r) return NULL;
    jstring s = (*env)->NewStringUTF(env, r);
    free(r);
    return s;
}
