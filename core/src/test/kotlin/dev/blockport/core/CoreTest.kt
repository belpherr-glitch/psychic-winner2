package dev.blockport.core

import java.io.File
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

private const val MODERN = """
{
  "id": "1.20.1", "type": "release", "mainClass": "net.minecraft.client.main.Main",
  "assetIndex": {"id": "5", "sha1": "abc", "size": 1, "totalSize": 2, "url": "https://example.com/5.json"},
  "downloads": {"client": {"sha1": "deadbeef", "size": 10, "url": "https://example.com/client.jar"}},
  "arguments": {
    "game": [
      "--username", "${'$'}{auth_player_name}",
      "--version", "${'$'}{version_name}",
      {"rules": [{"action": "allow", "features": {"has_custom_resolution": true}}],
       "value": ["--width", "${'$'}{resolution_width}", "--height", "${'$'}{resolution_height}"]},
      {"rules": [{"action": "allow", "features": {"is_demo_user": true}}], "value": "--demo"}
    ],
    "jvm": [
      {"rules": [{"action": "allow", "os": {"name": "windows"}}], "value": "-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump"},
      {"rules": [{"action": "allow", "os": {"name": "linux"}}], "value": "-Dlinux.only=1"},
      "-Djava.library.path=${'$'}{natives_directory}",
      "-cp", "${'$'}{classpath}"
    ]
  },
  "libraries": [
    {"name": "com.mojang:logging:1.1.1",
     "downloads": {"artifact": {"path": "com/mojang/logging/1.1.1/logging-1.1.1.jar", "sha1": "aa", "size": 1, "url": "https://libraries.minecraft.net/com/mojang/logging/1.1.1/logging-1.1.1.jar"}}},
    {"name": "org.lwjgl:lwjgl:3.3.1:natives-windows",
     "rules": [{"action": "allow", "os": {"name": "windows"}}],
     "downloads": {"artifact": {"path": "org/lwjgl/lwjgl/3.3.1/lwjgl-3.3.1-natives-windows.jar", "sha1": "bb", "size": 1, "url": "https://libraries.minecraft.net/win.jar"}}},
    {"name": "org.lwjgl:lwjgl:3.3.1:natives-linux-arm64",
     "rules": [{"action": "allow", "os": {"name": "linux", "arch": "arm64"}}],
     "downloads": {"artifact": {"path": "org/lwjgl/lwjgl/3.3.1/lwjgl-3.3.1-natives-linux-arm64.jar", "sha1": "cc", "size": 1, "url": "https://libraries.minecraft.net/arm.jar"}}},
    {"name": "org.lwjgl.lwjgl:lwjgl-platform:2.9.4",
     "natives": {"linux": "natives-linux", "windows": "natives-windows"},
     "downloads": {"classifiers": {"natives-linux": {"path": "org/lwjgl/lwjgl/lwjgl-platform/2.9.4/lwjgl-platform-2.9.4-natives-linux.jar", "sha1": "dd", "size": 1, "url": "https://libraries.minecraft.net/nat.jar"}}}}
  ]
}
"""

class CoreTest {
    private val env = Environment()
    private val version = McJson.decodeFromString(VersionJson.serializer(), MODERN)

    @Test
    fun rulesDefaultAllowAndLastMatchWins() {
        assertTrue(Rules.allows(null, env))
        assertFalse(Rules.allows(listOf(Rule("allow", os = OsRule(name = "windows"))), env))
        val rules = listOf(Rule("allow"), Rule("disallow", os = OsRule(name = "linux")))
        assertFalse(Rules.allows(rules, env))
        assertTrue(Rules.allows(rules, env.copy(osName = "osx")))
    }

    @Test
    fun rulesFeatures() {
        val r = listOf(Rule("allow", features = mapOf("has_custom_resolution" to true)))
        assertFalse(Rules.allows(r, env))
        assertTrue(Rules.allows(r, env.copy(features = mapOf("has_custom_resolution" to true))))
    }

    @Test
    fun mavenPath() {
        assertEquals("com/mojang/logging/1.1.1/logging-1.1.1.jar", Plan.mavenPath("com.mojang:logging:1.1.1"))
        assertEquals(
            "org/lwjgl/lwjgl/3.3.1/lwjgl-3.3.1-natives-linux-arm64.jar",
            Plan.mavenPath("org.lwjgl:lwjgl:3.3.1:natives-linux-arm64"),
        )
    }

    @Test
    fun resolveFiltersByPlatformAndBuildsClasspath() {
        val r = Plan.resolve(version, env)
        val paths = r.downloads.map { it.dest }
        assertContains(paths, "libraries/com/mojang/logging/1.1.1/logging-1.1.1.jar")
        assertContains(paths, "libraries/org/lwjgl/lwjgl/3.3.1/lwjgl-3.3.1-natives-linux-arm64.jar")
        assertFalse(paths.any { "windows" in it })
        assertContains(paths, "versions/1.20.1/1.20.1.jar")
        // client jar por último no classpath
        assertEquals("versions/1.20.1/1.20.1.jar", r.classpath.last())
        // natives antigos vão para extração, não para o classpath
        assertEquals(listOf("libraries/org/lwjgl/lwjgl/lwjgl-platform/2.9.4/lwjgl-platform-2.9.4-natives-linux.jar"), r.nativeJars)
        assertFalse(r.classpath.any { it.contains("lwjgl-platform") })
    }

    @Test
    fun assetsPlan() {
        val idx = McJson.decodeFromString(
            AssetIndex.serializer(),
            """{"objects":{"a/b.png":{"hash":"ab12cd","size":3},"c.png":{"hash":"ab12cd","size":3}}}""",
        )
        val tasks = Plan.assets(idx)
        assertEquals(1, tasks.size)
        assertEquals("https://resources.download.minecraft.net/ab/ab12cd", tasks[0].url)
        assertEquals("assets/objects/ab/ab12cd", tasks[0].dest)
    }

    @Test
    fun launchCommand() {
        val profile = PerformanceProfile.recommend(DeviceInfo(8192, 8, supportsVulkan11 = true))
        val ctx = LaunchContext(
            gameDir = "/g", assetsRoot = "/g/assets", librariesRoot = "/g/libraries", nativesDir = "/g/n",
            classpath = listOf("/g/a.jar", "/g/b.jar"), playerName = "Steve", uuid = "u", accessToken = "t",
            versionName = "1.20.1", assetIndexName = "5",
        )
        val withRes = Environment(features = mapOf("has_custom_resolution" to true))
        val cmd = LaunchCommandBuilder.build(version, ctx, profile, withRes)
        assertEquals("java", cmd.first())
        assertContains(cmd, "-Xmx${profile.heapMaxMb}M")
        assertContains(cmd, "-Dlinux.only=1")
        assertFalse(cmd.any { "MojangTricks" in it }, "regra windows deve ser filtrada")
        assertContains(cmd, "-Djava.library.path=/g/n")
        assertEquals("/g/a.jar:/g/b.jar", cmd[cmd.indexOf("-cp") + 1])
        val main = cmd.indexOf("net.minecraft.client.main.Main")
        assertTrue(main > cmd.indexOf("-cp"))
        assertEquals(listOf("--username", "Steve", "--version", "1.20.1", "--width", "1280", "--height", "720"), cmd.drop(main + 1))
        assertFalse("--demo" in cmd)
        assertFalse(cmd.any { it.contains("\${") }, "sem placeholders sobrando")
    }

    @Test
    fun legacyArgumentsAndDefaultJvmArgs() {
        val legacy = VersionJson(
            id = "1.8.9", mainClass = "net.minecraft.client.main.Main",
            minecraftArguments = "--username \${auth_player_name} --gameDir \${game_directory}",
        )
        val ctx = LaunchContext("/g", "/a", "/l", "/n", listOf("/x.jar"), "Alex", "u", "t", versionName = "1.8.9", assetIndexName = "1.8")
        val cmd = LaunchCommandBuilder.build(legacy, ctx, PerformanceProfile.recommend(DeviceInfo(4096, 4, false)), Environment())
        assertContains(cmd, "-Djava.library.path=/n")
        assertEquals(listOf("--username", "Alex", "--gameDir", "/g"), cmd.takeLast(4))
    }

    @Test
    fun performanceProfileScalesWithDevice() {
        val low = PerformanceProfile.recommend(DeviceInfo(3072, 4, false))
        val mid = PerformanceProfile.recommend(DeviceInfo(6144, 8, true))
        val high = PerformanceProfile.recommend(DeviceInfo(16384, 8, true))
        assertTrue(low.heapMaxMb in 768..1600)
        assertTrue(mid.heapMaxMb > low.heapMaxMb)
        assertEquals(4096, high.heapMaxMb)
        assertContains(low.jvmFlags, "-XX:+UseSerialGC")
        assertContains(mid.jvmFlags, "-XX:+UseParallelGC")
        assertTrue(low.heapInitMb <= low.heapMaxMb)
    }

    @Test
    fun lwjglOverrideReplacesVersionLwjgl() {
        val r = Plan.resolve(version, Environment(lwjglOverride = true))
        // nenhuma lib org/lwjgl da versão, só as fixadas 3.3.3
        val lwjglPaths = r.classpath.filter { it.startsWith("libraries/org/lwjgl/") }
        assertTrue(lwjglPaths.isNotEmpty())
        assertTrue(lwjglPaths.all { "/${Lwjgl.VERSION}/" in it }, lwjglPaths.toString())
        assertContains(r.classpath, "libraries/org/lwjgl/lwjgl-glfw/3.3.3/lwjgl-glfw-3.3.3.jar")
        assertTrue(r.nativeJars.isEmpty(), "natives desktop não são usadas no Android")
        assertContains(r.classpath, "libraries/com/mojang/logging/1.1.1/logging-1.1.1.jar")
        assertEquals("versions/1.20.1/1.20.1.jar", r.classpath.last())
        assertTrue(Lwjgl.downloads.all { it.sha1!!.length == 40 && it.size > 0 })
    }

    @Test
    fun rendererAndCompat() {
        assertEquals(Renderer.GL4ES, Renderer.select(8))
        assertEquals(Renderer.LTW, Renderer.select(16))
        assertEquals(Renderer.LTW, Renderer.select(21))

        val modern = version.copy(
            libraries = version.libraries + Library("org.lwjgl:lwjgl:3.3.1"),
            javaVersion = JavaVersionInfo(majorVersion = 17),
        )
        assertEquals(null, Compat.check(modern))
        assertTrue(Compat.check(modern.copy(javaVersion = JavaVersionInfo(majorVersion = 25)))!!.contains("Java 25"))
        val legacy = VersionJson(id = "1.8.9", mainClass = "x", libraries = listOf(Library("org.lwjgl.lwjgl:lwjgl:2.9.4")))
        assertTrue(Compat.check(legacy)!!.contains("LWJGL 2"))
    }

    @Test
    fun extraJvmArgsGoBeforeVersionArgs() {
        val ctx = LaunchContext("/g", "/a", "/l", "/n", listOf("/x.jar"), "Alex", "u", "t", versionName = "1.20.1", assetIndexName = "5")
        val profile = PerformanceProfile.recommend(DeviceInfo(4096, 4, false))
        val cmd = LaunchCommandBuilder.build(version, ctx, profile, Environment(), "/jre/bin/java", listOf("-Dorg.lwjgl.librarypath=/n"))
        assertEquals("/jre/bin/java", cmd.first())
        assertTrue(cmd.indexOf("-Dorg.lwjgl.librarypath=/n") < cmd.indexOf("-cp"))
        assertTrue(cmd.indexOf("-Xmx${profile.heapMaxMb}M") < cmd.indexOf("-Dorg.lwjgl.librarypath=/n"))
    }

    @Test
    fun sha1OfFile() {
        val f = File.createTempFile("blockport", ".txt").apply { writeText("abc"); deleteOnExit() }
        assertEquals("a9993e364706816aba3e25717850c26c9cd0d89d", f.sha1())
    }
}
