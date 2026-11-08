package dev.blockport.launcher

import android.content.Context
import dev.blockport.core.GameRuntime
import dev.blockport.core.Renderer
import dev.blockport.launcher.game.GameActivity
import java.io.File
import java.io.IOException
import java.util.zip.ZipInputStream

/** JRE 21 ARM64 para Android, empacotada no APK pelo CI (assets/runtime). */
object JreInstaller {
    private const val ZIP = "runtime/jre21.zip"
    private const val VERSION = "runtime/jre21.version"

    fun home(context: Context) = File(context.filesDir, "runtimes/jre21")

    private fun bundledVersion(context: Context): String? = try {
        context.assets.open(VERSION).bufferedReader().use { it.readText().trim() }
    } catch (e: IOException) {
        null
    }

    fun isBundled(context: Context) = bundledVersion(context) != null

    /** Extrai na primeira execução (ou quando o APK traz uma JRE nova). */
    fun ensure(context: Context, onProgress: (Int) -> Unit = {}): File {
        val version = bundledVersion(context) ?: throw IOException("Este APK não contém o runtime Java.")
        val home = home(context)
        val marker = File(home, ".blockport-version")
        if (marker.isFile && marker.readText() == version && File(home, "lib").isDirectory) return home

        home.deleteRecursively()
        home.mkdirs()
        val root = home.canonicalPath + File.separator
        var count = 0
        ZipInputStream(context.assets.open(ZIP).buffered(1 shl 16)).use { zip ->
            generateSequence { zip.nextEntry }.forEach { entry ->
                val out = File(home, entry.name).canonicalFile
                if (!out.path.startsWith(root)) return@forEach  // zip-slip
                if (entry.isDirectory) {
                    out.mkdirs()
                } else {
                    out.parentFile?.mkdirs()
                    out.outputStream().use { zip.copyTo(it, 1 shl 16) }
                    if (++count % 50 == 0) onProgress(count)
                }
            }
        }
        marker.writeText(version)
        return home
    }
}

/** Configurações de desempenho escolhidas pelo usuário. */
data class GameSettings(
    /** Fração da resolução da tela usada para renderizar (0.25–1.0). */
    val renderScale: Float = 0.75f,
    val sustainedPerformance: Boolean = false,
) {
    companion object {
        private const val PREFS = "blockport"

        fun load(context: Context): GameSettings {
            val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            return GameSettings(
                renderScale = p.getFloat("renderScale", 0.75f),
                sustainedPerformance = p.getBoolean("sustained", false),
            )
        }

        fun save(context: Context, s: GameSettings) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putFloat("renderScale", s.renderScale)
                .putBoolean("sustained", s.sustainedPerformance)
                .apply()
        }
    }
}

/**
 * Inicia o jogo no processo ":game". Define o ambiente nativo do renderer:
 * o GLFW próprio (libglfw.so) cria o contexto EGL e a lib GL traduz OpenGL -> GLES.
 */
class AndroidGameRuntime(
    private val context: Context,
    private val javaHome: File,
    private val renderer: Renderer,
    private val settings: GameSettings,
    private val logFile: File,
) : GameRuntime {
    override val name = "OpenJDK 21 + ${renderer.label}"

    private val nativeDir: String get() = context.applicationInfo.nativeLibraryDir

    val glLibrary: String
        get() = when (renderer) {
            Renderer.GL4ES -> "$nativeDir/libgl4es_114.so"
            Renderer.LTW -> "$nativeDir/libltw.so"
        }

    override fun isAvailable() = File(javaHome, "lib").isDirectory && File(glLibrary).isFile

    /** Propriedades JVM que apontam o LWJGL para as natives do APK. */
    fun jvmProperties(gameDir: File): List<String> = listOf(
        "-Dorg.lwjgl.librarypath=$nativeDir",
        "-Dorg.lwjgl.glfw.libname=$nativeDir/libglfw.so",
        "-Dorg.lwjgl.opengl.libname=$glLibrary",
        "-Dorg.lwjgl.openal.libname=$nativeDir/libopenal.so",
        "-Dorg.lwjgl.freetype.libname=$nativeDir/libfreetype.so",
        "-Dorg.lwjgl.system.allocator=system",
        // Desliga as checagens de argumentos do LWJGL em cada chamada nativa.
        "-Dorg.lwjgl.util.NoChecks=true",
        "-Dio.netty.transport.noNative=true",
        "-Djava.awt.headless=true",
        "-Djava.io.tmpdir=${context.cacheDir.absolutePath}",
        "-Duser.home=${gameDir.absolutePath}",
        "-Dfml.earlyprogresswindow=false",
    )

    private fun environment(gameDir: File): Map<String, String> = buildMap {
        put("HOME", gameDir.absolutePath)
        put("TMPDIR", context.cacheDir.absolutePath)
        put("BP_GLES_VERSION", renderer.glesVersion.toString())
        put("BP_GL_LIB", glLibrary)
        put("LIBGL_NOERROR", "1")  // sem glGetError a cada chamada
        when (renderer) {
            Renderer.GL4ES -> {
                put("LIBGL_ES", "2")
                put("LIBGL_MIPMAP", "3")
                put("LIBGL_NORMALIZE", "1")
                put("LIBGL_NOINTOVLHACK", "1")
            }
            Renderer.LTW -> put("BP_EGL_LIB", glLibrary)
        }
    }

    override fun launch(command: List<String>, workingDir: String): Result<Unit> = runCatching {
        check(isAvailable()) { "Runtime incompleto: JRE ou ${File(glLibrary).name} ausente." }
        val gameDir = File(workingDir)
        context.startActivity(
            GameActivity.intent(
                context,
                javaHome = javaHome.absolutePath,
                args = command,
                env = environment(gameDir),
                logPath = logFile.absolutePath,
                renderScale = settings.renderScale,
                sustained = settings.sustainedPerformance,
            ),
        )
    }
}
