package dev.blockport.core

data class DeviceInfo(
    val totalRamMb: Int,
    val cores: Int,
    val supportsVulkan11: Boolean,
)

/**
 * Perfil de desempenho derivado do aparelho. Os números são heurísticas
 * iniciais; o objetivo é medir (FPS/frametime) e calibrar por SoC.
 */
data class PerformanceProfile(
    val heapMaxMb: Int,
    val heapInitMb: Int,
    val jvmFlags: List<String>,
) {
    fun jvmArgs(): List<String> = listOf("-Xms${heapInitMb}M", "-Xmx${heapMaxMb}M") + jvmFlags

    companion object {
        private const val ANDROID_RESERVE_MB = 1536
        private const val MIN_HEAP_MB = 768
        private const val MAX_HEAP_MB = 4096

        fun recommend(device: DeviceInfo): PerformanceProfile {
            val usable = (device.totalRamMb - ANDROID_RESERVE_MB).coerceAtLeast(MIN_HEAP_MB)
            val heapMax = (usable * 0.6).toInt().coerceIn(MIN_HEAP_MB, MAX_HEAP_MB)
            val heapInit = heapMax / 2

            val bigDevice = device.cores >= 6 && device.totalRamMb >= 6144
            val gc = if (bigDevice) {
                listOf("-XX:+UseParallelGC", "-XX:ParallelGCThreads=${(device.cores / 2).coerceAtLeast(2)}")
            } else {
                // Poucos núcleos/RAM: o menor overhead de coleta vence.
                listOf("-XX:+UseSerialGC")
            }

            val flags = gc + listOf(
                "-Xss1M",
                "-XX:+DisableExplicitGC",
                "-XX:-UsePerfData",
            )
            return PerformanceProfile(heapMax, heapInit, flags)
        }
    }
}
