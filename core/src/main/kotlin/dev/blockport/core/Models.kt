package dev.blockport.core

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement

/** Json tolerante: os JSONs da Mojang têm muitos campos que não usamos. */
val McJson = Json {
    ignoreUnknownKeys = true
    isLenient = true
}

@Serializable
data class VersionManifest(val latest: Latest, val versions: List<VersionEntry>) {
    @Serializable
    data class Latest(val release: String, val snapshot: String)
}

@Serializable
data class VersionEntry(
    val id: String,
    val type: String,
    val url: String,
    val sha1: String? = null,
    val releaseTime: String? = null,
)

@Serializable
data class OsRule(val name: String? = null, val arch: String? = null, val version: String? = null)

@Serializable
data class Rule(
    val action: String,
    val os: OsRule? = null,
    val features: Map<String, Boolean>? = null,
)

@Serializable
data class FileRef(
    val path: String? = null,
    val sha1: String? = null,
    val size: Long = 0,
    val url: String? = null,
)

@Serializable
data class LibraryDownloads(
    val artifact: FileRef? = null,
    val classifiers: Map<String, FileRef>? = null,
)

@Serializable
data class Library(
    val name: String,
    val downloads: LibraryDownloads? = null,
    val rules: List<Rule>? = null,
    val natives: Map<String, String>? = null,
    /** Base Maven para libs antigas sem bloco `downloads`. */
    val url: String? = null,
)

@Serializable
data class AssetIndexRef(
    val id: String,
    val sha1: String? = null,
    val size: Long = 0,
    val totalSize: Long = 0,
    val url: String,
)

@Serializable
data class VersionDownloads(val client: FileRef? = null)

@Serializable
data class JavaVersionInfo(val component: String? = null, val majorVersion: Int = 8)

/** Argumentos podem ser string ou objeto {rules, value}; mantidos crus e interpretados em [LaunchCommandBuilder]. */
@Serializable
data class Arguments(
    val game: List<JsonElement> = emptyList(),
    val jvm: List<JsonElement> = emptyList(),
)

@Serializable
data class VersionJson(
    val id: String,
    val type: String = "release",
    val mainClass: String,
    val assets: String? = null,
    val assetIndex: AssetIndexRef? = null,
    val downloads: VersionDownloads? = null,
    val libraries: List<Library> = emptyList(),
    val arguments: Arguments? = null,
    /** Formato legado (<= 1.12): uma única string. */
    val minecraftArguments: String? = null,
    val javaVersion: JavaVersionInfo? = null,
)

@Serializable
data class AssetObject(val hash: String, val size: Long = 0)

@Serializable
data class AssetIndex(
    val objects: Map<String, AssetObject>,
    @SerialName("map_to_resources") val mapToResources: Boolean = false,
    val virtual: Boolean = false,
)
