package dev.blockport.launcher

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateListOf
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import dev.blockport.core.Environment
import dev.blockport.core.GameRuntime
import dev.blockport.core.InstallProgress
import dev.blockport.core.Installer
import dev.blockport.core.LaunchCommandBuilder
import dev.blockport.core.LaunchContext
import dev.blockport.core.PerformanceProfile
import dev.blockport.core.Plan
import dev.blockport.core.VersionEntry
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID

class LauncherViewModel(app: Application) : AndroidViewModel(app) {
    private val root = File(app.filesDir, "minecraft")
    private val installer = Installer(root)
    private val env = Environment()
    private val runtime: GameRuntime = NotInstalledRuntime

    val device = DeviceProbe.read(app)
    val profile = PerformanceProfile.recommend(device)

    val versions = mutableStateListOf<VersionEntry>()
    val installed = mutableStateListOf<String>()
    var loading by mutableStateOf(true)
        private set
    var error by mutableStateOf<String?>(null)
    var showSnapshots by mutableStateOf(false)
    var query by mutableStateOf("")
    var playerName by mutableStateOf("Player")
    var installing by mutableStateOf<String?>(null)
        private set
    var progress by mutableStateOf<InstallProgress?>(null)
        private set
    var launchReport by mutableStateOf<String?>(null)

    init {
        refresh()
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
        if (installing != null) return
        viewModelScope.launch {
            installing = entry.id
            error = null
            try {
                installer.install(entry, env) { progress = it }
                if (entry.id !in installed) installed.add(entry.id)
            } catch (e: Exception) {
                error = "Falha ao instalar ${entry.id}: ${e.message}"
            } finally {
                installing = null
                progress = null
            }
        }
    }

    fun play(entry: VersionEntry) {
        viewModelScope.launch {
            val report = withContext(Dispatchers.IO) {
                val json = installer.loadInstalled(entry.id)
                val resolved = Plan.resolve(json, env)
                val ctx = LaunchContext(
                    gameDir = root.absolutePath,
                    assetsRoot = File(root, "assets").absolutePath,
                    librariesRoot = File(root, "libraries").absolutePath,
                    nativesDir = installer.nativesDir(entry.id).absolutePath,
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
                val cmd = LaunchCommandBuilder.build(json, ctx, profile, env)
                val result = runtime.launch(cmd, root.absolutePath)
                buildString {
                    appendLine(result.exceptionOrNull()?.message ?: "Jogo iniciado.")
                    appendLine()
                    appendLine("Java necessário: ${json.javaVersion?.majorVersion ?: 8}")
                    appendLine("Renderer: ${profile.renderer.label}")
                    appendLine()
                    appendLine("Comando gerado:")
                    append(cmd.joinToString(" "))
                }
            }
            launchReport = report
        }
    }
}
