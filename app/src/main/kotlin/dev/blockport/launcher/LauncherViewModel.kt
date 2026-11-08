package dev.blockport.launcher

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import dev.blockport.core.Compat
import dev.blockport.core.Environment
import dev.blockport.core.InstallProgress
import dev.blockport.core.Installer
import dev.blockport.core.LaunchCommandBuilder
import dev.blockport.core.LaunchContext
import dev.blockport.core.PerformanceProfile
import dev.blockport.core.Plan
import dev.blockport.core.Renderer
import dev.blockport.core.VersionEntry
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID

class LauncherViewModel(app: Application) : AndroidViewModel(app) {
    private val root = File(app.filesDir, "minecraft")
    private val installer = Installer(root)
    /** Android: LWJGL fixado em 3.3.3 com natives bionic. */
    private val env = Environment(lwjglOverride = true)
    val logFile = File(root, "latestlog.txt")

    val device = DeviceProbe.read(app)
    val profile = PerformanceProfile.recommend(device)
    val runtimeBundled = JreInstaller.isBundled(app)

    val versions = mutableStateListOf<VersionEntry>()
    val installed = mutableStateListOf<String>()
    var loading by mutableStateOf(true)
        private set
    var error by mutableStateOf<String?>(null)
    var showSnapshots by mutableStateOf(false)
    var query by mutableStateOf("")
    var playerName by mutableStateOf("Player")
    var busy by mutableStateOf<String?>(null)
        private set
    var progress by mutableStateOf<InstallProgress?>(null)
        private set
    var launchReport by mutableStateOf<String?>(null)
    var settings by mutableStateOf(GameSettings.load(app))
        private set

    init {
        refresh()
    }

    fun updateSettings(s: GameSettings) {
        settings = s
        GameSettings.save(getApplication(), s)
    }

    fun refresh() {
        viewModelScope.launch {
            loading = true
            error = null
            try {
                val manifest = installer.fetchManifest()
                versions.clear()
                versions.addAll(manifest.versions)
                installed.clear()
                installed.addAll(manifest.versions.filter { installer.isInstalled(it.id) }.map { it.id })
            } catch (e: Exception) {
                error = "Falha ao carregar versões: ${e.message}"
            } finally {
                loading = false
            }
        }
    }

    fun visibleVersions(): List<VersionEntry> = versions.filter {
        (showSnapshots || it.type == "release") && it.id.contains(query.trim(), ignoreCase = true)
    }

    fun install(entry: VersionEntry) {
        if (busy != null) return
        viewModelScope.launch {
            busy = entry.id
            error = null
            try {
                installer.install(entry, env) { progress = it }
                if (entry.id !in installed) installed.add(entry.id)
            } catch (e: Exception) {
                error = "Falha ao instalar ${entry.id}: ${e.message}"
            } finally {
                busy = null
                progress = null
            }
        }
    }

    fun play(entry: VersionEntry) {
        if (busy != null) return
        viewModelScope.launch {
            busy = entry.id
            error = null
            try {
                val failure = launchGame(entry)
                if (failure != null) launchReport = failure
            } catch (e: Exception) {
                launchReport = "Erro: ${e.message}"
            } finally {
                busy = null
                progress = null
            }
        }
    }

    /** Devolve null se o jogo foi iniciado, ou o motivo da falha. */
    private suspend fun launchGame(entry: VersionEntry): String? = withContext(Dispatchers.IO) {
        val app = getApplication<Application>()
        val json = installer.loadInstalled(entry.id)
        Compat.check(json)?.let { return@withContext it }

        val javaHome = JreInstaller.ensure(app) { n -> progress = InstallProgress("Preparando Java", n, 0) }
        val resolved = Plan.resolve(json, env)
        installer.ensure(resolved.downloads) { progress = it }

        val renderer = Renderer.select(json.javaVersion?.majorVersion ?: 8)
        val runtime = AndroidGameRuntime(app, javaHome, renderer, settings, logFile)
        val ctx = LaunchContext(
            gameDir = root.absolutePath,
            assetsRoot = File(root, "assets").absolutePath,
            librariesRoot = File(root, "libraries").absolutePath,
            nativesDir = app.applicationInfo.nativeLibraryDir,
            classpath = resolved.classpath.map { File(root, it).absolutePath },
            playerName = playerName.ifBlank { "Player" },
            // Perfil local (offline). Login Microsoft: ver Roadmap.
            uuid = UUID.nameUUIDFromBytes("OfflinePlayer:$playerName".toByteArray()).toString(),
            accessToken = "0",
            userType = "legacy",
            versionName = entry.id,
            versionType = entry.type,
            assetIndexName = json.assetIndex?.id ?: json.assets ?: "legacy",
        )
        val cmd = LaunchCommandBuilder.build(
            json, ctx, profile, env,
            javaExecutable = File(javaHome, "bin/java").absolutePath,
            extraJvmArgs = runtime.jvmProperties(root),
        )
        runtime.launch(cmd, root.absolutePath).exceptionOrNull()?.message
    }

    fun readLog(): String =
        if (logFile.isFile) logFile.readLines().takeLast(300).joinToString("\n") else "Nenhum log ainda."
}
