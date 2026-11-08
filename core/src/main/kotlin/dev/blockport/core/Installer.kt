package dev.blockport.core

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicInteger
import java.util.zip.ZipInputStream

data class InstallProgress(val phase: String, val done: Int, val total: Int) {
    val fraction: Float get() = if (total == 0) 0f else done.toFloat() / total
}

fun File.sha1(): String {
    val md = MessageDigest.getInstance("SHA-1")
    inputStream().use { input ->
        val buf = ByteArray(64 * 1024)
        while (true) {
            val n = input.read(buf)
            if (n < 0) break
            md.update(buf, 0, n)
        }
    }
    return md.digest().joinToString("") { "%02x".format(it) }
}

/**
 * Baixa e valida versões do Minecraft. Downloads em paralelo, escrita atômica
 * (arquivo temporário + rename) e verificação SHA-1, reaproveitando o que já está íntegro.
 */
class Installer(
    private val root: File,
    private val http: OkHttpClient = OkHttpClient(),
    private val parallelism: Int = 12,
) {
    companion object {
        const val MANIFEST_URL = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json"
    }

    suspend fun fetchManifest(): VersionManifest =
        McJson.decodeFromString(VersionManifest.serializer(), fetchText(MANIFEST_URL))

    fun isInstalled(id: String): Boolean =
        File(root, Plan.versionJsonPath(id)).exists() && File(root, Plan.clientJarPath(id)).exists()

    fun loadInstalled(id: String): VersionJson =
        McJson.decodeFromString(VersionJson.serializer(), File(root, Plan.versionJsonPath(id)).readText())

    fun loadAssetIndex(json: VersionJson): AssetIndex? =
        json.assetIndex?.let {
            McJson.decodeFromString(AssetIndex.serializer(), File(root, Plan.assetIndexPath(it.id)).readText())
        }

    suspend fun install(
        entry: VersionEntry,
        env: Environment,
        onProgress: (InstallProgress) -> Unit = {},
    ): ResolvedVersion {
        onProgress(InstallProgress("Versão", 0, 1))
        val versionTask = DownloadTask(entry.url, Plan.versionJsonPath(entry.id), entry.sha1, 0)
        download(versionTask)
        val json = loadInstalled(entry.id)
        val resolved = Plan.resolve(json, env)

        // Índice de assets primeiro, para saber quantos arquivos existem.
        val indexRef = json.assetIndex
        val assetTasks = if (indexRef != null) {
            download(DownloadTask(indexRef.url, Plan.assetIndexPath(indexRef.id), indexRef.sha1, indexRef.size))
            Plan.assets(loadAssetIndex(json)!!)
        } else emptyList()

        downloadAll("Bibliotecas", resolved.downloads, onProgress)
        downloadAll("Assets", assetTasks, onProgress)

        withContext(Dispatchers.IO) {
            val nativesDir = nativesDir(entry.id)
            nativesDir.mkdirs()
            resolved.nativeJars.forEach { extractNatives(File(root, it), nativesDir) }
        }
        return resolved
    }

    fun nativesDir(id: String) = File(root, "versions/$id/natives")

    private suspend fun downloadAll(
        phase: String,
        tasks: List<DownloadTask>,
        onProgress: (InstallProgress) -> Unit,
    ) = coroutineScope {
        val done = AtomicInteger(0)
        val gate = Semaphore(parallelism)
        onProgress(InstallProgress(phase, 0, tasks.size))
        tasks.map { task ->
            async(Dispatchers.IO) {
                gate.withPermit { download(task) }
                onProgress(InstallProgress(phase, done.incrementAndGet(), tasks.size))
            }
        }.awaitAll()
    }

    private suspend fun download(task: DownloadTask) = withContext(Dispatchers.IO) {
        val dest = File(root, task.dest)
        if (dest.isFile && (task.sha1 == null || dest.sha1().equals(task.sha1, ignoreCase = true))) {
            if (task.sha1 != null || dest.length() > 0) return@withContext
        }
        dest.parentFile?.mkdirs()
        var lastError: Exception? = null
        repeat(3) { attempt ->
            val tmp = File(dest.parentFile, dest.name + ".part")
            try {
                http.newCall(Request.Builder().url(task.url).build()).execute().use { resp ->
                    if (!resp.isSuccessful) throw IOException("HTTP ${resp.code} em ${task.url}")
                    tmp.outputStream().use { out -> resp.body!!.byteStream().copyTo(out) }
                }
                if (task.sha1 != null && !tmp.sha1().equals(task.sha1, ignoreCase = true)) {
                    throw IOException("SHA-1 inválido em ${task.url}")
                }
                if (!tmp.renameTo(dest)) {
                    tmp.copyTo(dest, overwrite = true)
                    tmp.delete()
                }
                return@withContext
            } catch (e: IOException) {
                lastError = e
                tmp.delete()
                if (attempt < 2) Thread.sleep(500L * (attempt + 1))
            }
        }
        throw IOException("Falha ao baixar ${task.url}", lastError)
    }

    private suspend fun fetchText(url: String): String = withContext(Dispatchers.IO) {
        http.newCall(Request.Builder().url(url).build()).execute().use { resp ->
            if (!resp.isSuccessful) throw IOException("HTTP ${resp.code} em $url")
            resp.body!!.string()
        }
    }

    private fun extractNatives(jar: File, into: File) {
        ZipInputStream(jar.inputStream().buffered()).use { zip ->
            generateSequence { zip.nextEntry }.forEach { entry ->
                if (entry.isDirectory || entry.name.startsWith("META-INF")) return@forEach
                val out = File(into, entry.name).canonicalFile
                // Proteção contra zip-slip.
                if (!out.path.startsWith(into.canonicalPath + File.separator)) return@forEach
                out.parentFile?.mkdirs()
                out.outputStream().use { zip.copyTo(it) }
            }
        }
    }
}
