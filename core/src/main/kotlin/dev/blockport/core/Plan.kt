package dev.blockport.core

/** Um arquivo a baixar. [dest] é relativo à raiz do jogo. */
data class DownloadTask(
    val url: String,
    val dest: String,
    val sha1: String?,
    val size: Long,
)

/** Resultado da resolução de uma versão: o que baixar e o que entra no classpath/natives. */
data class ResolvedVersion(
    val json: VersionJson,
    val downloads: List<DownloadTask>,
    /** Caminhos relativos à raiz, na ordem do classpath (libs + client jar). */
    val classpath: List<String>,
    /** Jars de natives (relativos à raiz) que precisam ser extraídos. */
    val nativeJars: List<String>,
)

object Plan {
    const val RESOURCES_URL = "https://resources.download.minecraft.net"
    private const val LIBRARIES_URL = "https://libraries.minecraft.net"

    /** group:artifact:version[:classifier] -> group/as/path/artifact/version/artifact-version[-classifier].jar */
    fun mavenPath(name: String, classifier: String? = null): String {
        val parts = name.split(':')
        require(parts.size >= 3) { "Nome Maven inválido: $name" }
        val (group, artifact, version) = parts
        val cls = classifier ?: parts.getOrNull(3)
        val file = buildString {
            append(artifact).append('-').append(version)
            if (cls != null) append('-').append(cls)
            append(".jar")
        }
        return "${group.replace('.', '/')}/$artifact/$version/$file"
    }

    fun clientJarPath(id: String) = "versions/$id/$id.jar"
    fun versionJsonPath(id: String) = "versions/$id/$id.json"
    fun assetIndexPath(id: String) = "assets/indexes/$id.json"
    fun assetObjectPath(hash: String) = "assets/objects/${hash.substring(0, 2)}/$hash"

    fun resolve(json: VersionJson, env: Environment): ResolvedVersion {
        val tasks = LinkedHashMap<String, DownloadTask>()
        val classpath = ArrayList<String>()
        val nativeJars = ArrayList<String>()

        for (lib in json.libraries) {
            if (!Rules.allows(lib.rules, env)) continue

            // Artefato principal (vai no classpath).
            val artifact = lib.downloads?.artifact
            if (artifact != null || (lib.downloads == null && lib.natives == null)) {
                val rel = "libraries/" + (artifact?.path ?: mavenPath(lib.name))
                val url = artifact?.url ?: ((lib.url ?: "$LIBRARIES_URL/") .trimEnd('/') + "/" + mavenPath(lib.name))
                if (!url.isNullOrBlank()) {
                    tasks.putIfAbsent(rel, DownloadTask(url, rel, artifact?.sha1, artifact?.size ?: 0))
                    if (rel !in classpath) classpath += rel
                }
            }

            // Natives no formato antigo (classifiers + mapa `natives`).
            val classifier = lib.natives?.get(env.osName)?.replace("\${arch}", "64")
            val nativeRef = classifier?.let { lib.downloads?.classifiers?.get(it) }
            if (nativeRef?.url != null) {
                val rel = "libraries/" + (nativeRef.path ?: mavenPath(lib.name, classifier))
                tasks.putIfAbsent(rel, DownloadTask(nativeRef.url, rel, nativeRef.sha1, nativeRef.size))
                nativeJars += rel
            }
        }

        json.downloads?.client?.let { client ->
            val rel = clientJarPath(json.id)
            if (client.url != null) tasks[rel] = DownloadTask(client.url, rel, client.sha1, client.size)
            classpath += rel
        }

        return ResolvedVersion(json, tasks.values.toList(), classpath, nativeJars)
    }

    fun assets(index: AssetIndex): List<DownloadTask> =
        index.objects.values
            .distinctBy { it.hash }
            .map { DownloadTask("$RESOURCES_URL/${it.hash.substring(0, 2)}/${it.hash}", assetObjectPath(it.hash), it.hash, it.size) }
}
