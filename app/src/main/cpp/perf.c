// Alavancas de desempenho do lado nativo:
//  1. Thread de render fixada nos núcleos de alto desempenho (exclui o cluster "little").
//  2. Sessão APerformanceHint (Android 13+): o kernel ajusta clock/núcleo
//     a partir do tempo real de cada frame, em vez de reagir com atraso.
#define _GNU_SOURCE
#include <dlfcn.h>
#include <sched.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include <unistd.h>

#include "bp.h"

#define MAX_CPUS 32

int64_t bp_now_ns(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (int64_t) ts.tv_sec * 1000000000LL + ts.tv_nsec;
}

static long cpu_max_freq(int cpu) {
    char path[128];
    snprintf(path, sizeof(path), "/sys/devices/system/cpu/cpu%d/cpufreq/cpuinfo_max_freq", cpu);
    FILE *f = fopen(path, "r");
    if (!f) return -1;
    long v = -1;
    if (fscanf(f, "%ld", &v) != 1) v = -1;
    fclose(f);
    return v;
}

static void pin_big_cores(void) {
    if (getenv("BP_NO_AFFINITY")) return;
    long freq[MAX_CPUS];
    int n = (int) sysconf(_SC_NPROCESSORS_CONF);
    if (n > MAX_CPUS) n = MAX_CPUS;
    long lo = -1, hi = -1;
    for (int i = 0; i < n; i++) {
        freq[i] = cpu_max_freq(i);
        if (freq[i] <= 0) continue;
        if (lo < 0 || freq[i] < lo) lo = freq[i];
        if (freq[i] > hi) hi = freq[i];
    }
    if (lo <= 0 || hi == lo) {
        LOGI("afinidade: núcleos homogêneos, sem fixação");
        return;
    }
    cpu_set_t set;
    CPU_ZERO(&set);
    int count = 0;
    for (int i = 0; i < n; i++) {
        if (freq[i] > lo) {
            CPU_SET(i, &set);
            count++;
        }
    }
    if (count == 0) return;
    if (sched_setaffinity(gettid(), sizeof(set), &set) == 0) {
        LOGI("thread de render fixada em %d núcleos grandes", count);
    } else {
        LOGW("sched_setaffinity falhou");
    }
}

// ---- APerformanceHint via dlsym (minSdk < 33) ----
typedef struct APerformanceHintManager APerformanceHintManager;
typedef struct APerformanceHintSession APerformanceHintSession;
static APerformanceHintManager *(*p_get_manager)(void);
static APerformanceHintSession *(*p_create_session)(APerformanceHintManager *, const int32_t *, size_t, int64_t);
static int (*p_report)(APerformanceHintSession *, int64_t);
static APerformanceHintSession *g_session;

static void open_hint_session(void) {
    void *android = dlopen("libandroid.so", RTLD_NOW | RTLD_LOCAL);
    if (!android) return;
    *(void **) (&p_get_manager) = dlsym(android, "APerformanceHint_getManager");
    *(void **) (&p_create_session) = dlsym(android, "APerformanceHint_createSession");
    *(void **) (&p_report) = dlsym(android, "APerformanceHint_reportActualWorkDuration");
    if (!p_get_manager || !p_create_session || !p_report) {
        LOGI("Performance Hint indisponível (Android < 13)");
        return;
    }
    APerformanceHintManager *mgr = p_get_manager();
    if (!mgr) return;
    int hz = 60;
    const char *e = getenv("BP_REFRESH_HZ");
    if (e && atoi(e) > 0) hz = atoi(e);
    int32_t tid = gettid();
    g_session = p_create_session(mgr, &tid, 1, 1000000000LL / hz);
    LOGI("Performance Hint: sessão %s (alvo %d Hz)", g_session ? "aberta" : "recusada", hz);
}

void bp_perf_render_thread_init(void) {
    static int done;
    if (done) return;
    done = 1;
    pin_big_cores();
    open_hint_session();
}

void bp_perf_report_frame(int64_t work_ns) {
    if (g_session && work_ns > 0) p_report(g_session, work_ns);
}
