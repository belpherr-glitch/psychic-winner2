// Sobe a JVM (OpenJDK para Android) dentro do processo ":game" via JLI_Launch,
// com stdout/stderr redirecionados para o log do jogo e para o logcat.
#include <dlfcn.h>
#include <fcntl.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#include "bp.h"

typedef int (*JLI_Launch_t)(int argc, char **argv, int jargc, const char **jargv, int appclassc,
                            const char **appclassv, const char *fullversion, const char *dotversion,
                            const char *pname, const char *lname, jboolean javaargs, jboolean cpwildcard,
                            jboolean javaw, jint ergo);

static int g_log_fd = -1;

static void *log_pump(void *arg) {
    int in = (int) (intptr_t) arg;
    char buf[4096];
    char line[1024];
    size_t len = 0;
    for (;;) {
        ssize_t n = read(in, buf, sizeof(buf));
        if (n <= 0) break;
        if (g_log_fd >= 0) write(g_log_fd, buf, (size_t) n);
        for (ssize_t i = 0; i < n; i++) {
            if (buf[i] == '\n' || len == sizeof(line) - 1) {
                line[len] = 0;
                __android_log_write(ANDROID_LOG_INFO, "BlockPort-Game", line);
                len = 0;
            } else {
                line[len++] = buf[i];
            }
        }
    }
    return NULL;
}

static void redirect_stdio(const char *log_path) {
    int fds[2];
    if (pipe(fds) != 0) return;
    g_log_fd = open(log_path, O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC, 0644);
    setvbuf(stdout, NULL, _IOLBF, 0);
    setvbuf(stderr, NULL, _IONBF, 0);
    dup2(fds[1], STDOUT_FILENO);
    dup2(fds[1], STDERR_FILENO);
    close(fds[1]);
    pthread_t t;
    pthread_create(&t, NULL, log_pump, (void *) (intptr_t) fds[0]);
    pthread_detach(t);
}

static void *preload(const char *java_home, const char *rel) {
    char path[1024];
    snprintf(path, sizeof(path), "%s/%s", java_home, rel);
    if (access(path, F_OK) != 0) return NULL;
    void *h = dlopen(path, RTLD_NOW | RTLD_GLOBAL);
    if (!h) fprintf(stderr, "[BlockPort] falha ao carregar %s: %s\n", rel, dlerror());
    return h;
}

int bp_launch_jvm(const char *java_home, int argc, char **argv, const char *log_path) {
    redirect_stdio(log_path);
    printf("[BlockPort] JAVA_HOME=%s\n", java_home);
    for (int i = 0; i < argc; i++) printf("[BlockPort] arg[%d] %s\n", i, argv[i]);

    // Carrega na ordem das dependências: o linker do Android resolve
    // NEEDED pelo soname de bibliotecas já carregadas no mesmo namespace.
    preload(java_home, "lib/server/libjvm.so");
    void *jli = preload(java_home, "lib/libjli.so");
    if (!jli) jli = preload(java_home, "lib/jli/libjli.so");
    const char *libs[] = {"lib/libverify.so", "lib/libjava.so", "lib/libjimage.so", "lib/libzip.so",
                          "lib/libnet.so",    "lib/libnio.so",  NULL};
    for (int i = 0; libs[i]; i++) preload(java_home, libs[i]);

    if (!jli) {
        fprintf(stderr, "[BlockPort] libjli.so não encontrada em %s\n", java_home);
        return -1;
    }
    JLI_Launch_t launch = (JLI_Launch_t) dlsym(jli, "JLI_Launch");
    if (!launch) {
        fprintf(stderr, "[BlockPort] JLI_Launch ausente\n");
        return -1;
    }

    setenv("JAVA_HOME", java_home, 1);
    // Evita que o launcher tente se re-executar para ajustar LD_LIBRARY_PATH.
    unsetenv("LD_LIBRARY_PATH");

    int rc = launch(argc, argv, 0, NULL, 0, NULL, "1.8.0-internal", "1.8", argv[0], argv[0], JNI_FALSE,
                    JNI_TRUE, JNI_FALSE, 0);
    printf("[BlockPort] JVM terminou com código %d\n", rc);
    fflush(stdout);
    return rc;
}
