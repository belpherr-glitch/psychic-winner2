package dev.blockport.core

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonPrimitive

data class LaunchContext(
    val gameDir: String,
    val assetsRoot: String,
    val librariesRoot: String,
    val nativesDir: String,
    /** Caminhos absolutos, já na ordem. */
    val classpath: List<String>,
    val playerName: String,
    val uuid: String,
    val accessToken: String,
    val userType: String = "msa",
    val versionName: String,
    val versionType: String = "release",
    val assetIndexName: String,
    val width: Int = 1280,
    val height: Int = 720,
    val launcherName: String = "BlockPort",
    val launcherVersion: String = "0.1.0",
)

object LaunchCommandBuilder {
    private val placeholder = Regex("""\$\{(\w+)}""")

    /**
     * Monta a linha de comando completa: [javaExecutable] + flags de desempenho +
     * JVM args da versão + mainClass + game args. No Android a JVM é carregada
     * in-process, mas a lista de argumentos é a mesma.
     */
    fun build(
        version: VersionJson,
        ctx: LaunchContext,
        profile: PerformanceProfile,
        env: Environment,
        javaExecutable: String = "java",
    ): List<String> {
        val vars = mapOf(
            "auth_player_name" to ctx.playerName,
            "version_name" to ctx.versionName,
            "game_directory" to ctx.gameDir,
            "assets_root" to ctx.assetsRoot,
            "game_assets" to ctx.assetsRoot,
            "assets_index_name" to ctx.assetIndexName,
            "auth_uuid" to ctx.uuid,
            "auth_access_token" to ctx.accessToken,
            "auth_session" to ctx.accessToken,
            "user_type" to ctx.userType,
            "user_properties" to "{}",
            "version_type" to ctx.versionType,
            "natives_directory" to ctx.nativesDir,
            "library_directory" to ctx.librariesRoot,
            "classpath_separator" to ":",
            "classpath" to ctx.classpath.joinToString(":"),
            "launcher_name" to ctx.launcherName,
            "launcher_version" to ctx.launcherVersion,
            "resolution_width" to ctx.width.toString(),
            "resolution_height" to ctx.height.toString(),
        )

        val jvm = version.arguments?.jvm?.takeIf { it.isNotEmpty() }
            ?.let { parse(it, env) }
            ?: listOf("-Djava.library.path=\${natives_directory}", "-cp", "\${classpath}")

        val game = when {
            version.arguments != null -> parse(version.arguments.game, env)
            version.minecraftArguments != null -> version.minecraftArguments.trim().split(Regex("\\s+"))
            else -> emptyList()
        }

        val all = buildList {
            add(javaExecutable)
            addAll(profile.jvmArgs())
            addAll(jvm)
            add(version.mainClass)
            addAll(game)
        }
        return all.map { substitute(it, vars) }
    }

    private fun substitute(text: String, vars: Map<String, String>): String =
        placeholder.replace(text) { m -> vars[m.groupValues[1]] ?: m.value }

    /** Interpreta a lista mista (string | {rules, value}) dos JSONs de versão. */
    fun parse(entries: List<JsonElement>, env: Environment): List<String> {
        val out = ArrayList<String>()
        for (el in entries) {
            when (el) {
                is JsonPrimitive -> out += el.content
                is JsonObject -> {
                    val rules = el["rules"]?.let { McJson.decodeFromJsonElement(kotlinx.serialization.builtins.ListSerializer(Rule.serializer()), it) }
                    if (!Rules.allows(rules, env)) continue
                    when (val value = el["value"]) {
                        is JsonPrimitive -> out += value.content
                        is JsonArray -> value.forEach { out += it.jsonPrimitive.content }
                        else -> Unit
                    }
                }
                else -> Unit
            }
        }
        return out
    }
}

/**
 * Ponto de encaixe do runtime nativo (JRE ARM64 + ponte LWJGL/GLFW + renderer).
 * Ainda não implementado: ver README, "Roadmap".
 */
interface GameRuntime {
    val name: String
    fun isAvailable(): Boolean
    fun launch(command: List<String>, workingDir: String): Result<Unit>
}
