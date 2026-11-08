cmake_minimum_required(VERSION 3.22.1)
project(blockport C)

# libglfw.so: implementação GLFW própria + bootstrap da JVM + ponte JNI.
# Uma biblioteca só, carregada pelo ART (System.loadLibrary) e pelo LWJGL
# (mesmo caminho absoluto => mesma instância no processo).
add_library(glfw SHARED
    egl_loader.c
    glfw_android.c
    jvm_launcher.c
    jni_bridge.c
    perf.c)

target_compile_options(glfw PRIVATE -O2 -Wall -Wextra -Wno-unused-parameter -fvisibility=hidden)
target_link_libraries(glfw android log dl)
target_link_options(glfw PRIVATE -Wl,--no-undefined)
