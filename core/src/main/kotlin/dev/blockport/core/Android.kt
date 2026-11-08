package dev.blockport.core

/**
 * No Android o LWJGL da versão é substituído por um LWJGL 3.3.3 oficial único,
 * cujas natives bionic foram verificadas símbolo a símbolo (ver README).
 */
object Lwjgl {
    const val VERSION = "3.3.3"

    private data class Module(val name: String, val sha1: String, val size: Long)

    private val modules = listOf(
        Module("lwjgl", "29589b5f87ed335a6c7e7ee6a5775f81f97ecb84", 785029),
        Module("lwjgl-glfw", "efa1eb78c5ccd840e9f329717109b5e892d72f8e", 135546),
        Module("lwjgl-opengl", "02f6b0147078396a58979125a4c947664e98293a", 929192),
        Module("lwjgl-openal", "daada81ceb5fc0c291fbfdd4433cb8d9423577f2", 110586),
        Module("lwjgl-stb", "25dd6161988d7e65f71d5065c99902402ee32746", 120283),
        Module("lwjgl-tinyfd", "82d755ca94b102e9ca77283b9e2dc46d1b15fbe5", 13400),
        Module("lwjgl-jemalloc", "b543467b7ff3c6920539a88ee602d34098628be5", 43896),
        Module("lwjgl-freetype", "a0db6c84a8becc8ca05f9dbfa985edc348a824c7", 450896),
    )

    fun isLwjgl(lib: Library): Boolean = lib.name.startsWith("org.lwjgl")

    val downloads: List<DownloadTask> = modules.map {
        val path = "org/lwjgl/${it.name}/$VERSION/${it.name}-$VERSION.jar"
        DownloadTask("https://repo1.maven.org/maven2/$path", "libraries/$path", it.sha1, it.size)
    }
}

/** Renderer OpenGL usado pelo jogo. */
enum class Renderer(val label: String, val glesVersion: Int) {
    /** OpenGL 2.1 sobre GLES 2: Minecraft 1.13–1.16. */
    GL4ES("GL4ES (OpenGL 2.1)", 2),

    /** OpenGL 3.x sobre GLES 3: Minecraft 1.17+ (exige OpenGL 3.2). */
    LTW("LTW (OpenGL 3.x)", 3);

    companion object {
        /** 1.17 foi a primeira versão a exigir Java 16 e OpenGL 3.2. */
        fun select(javaMajor: Int): Renderer = if (javaMajor >= 16) LTW else GL4ES
    }
}

object Compat {
    const val MAX_JAVA = 21

    /** null = suportado; senão o motivo. */
    fun check(json: VersionJson): String? {
        val lwjgl3 = json.libraries.any { it.name.startsWith("org.lwjgl:lwjgl:3.") }
        if (!lwjgl3) return "Versões com LWJGL 2 (1.12.2 ou anteriores) ainda não são suportadas."
        val java = json.javaVersion?.majorVersion ?: 8
        if (java > MAX_JAVA) return "Esta versão exige Java $java; o runtime embutido é Java $MAX_JAVA."
        return null
    }
}
