package dev.blockport.launcher

import android.app.ActivityManager
import android.content.Context
import android.content.pm.PackageManager
import dev.blockport.core.DeviceInfo

object DeviceProbe {
    /** VK_MAKE_VERSION(1, 1, 0) */
    private const val VULKAN_1_1 = 0x401000

    fun read(context: Context): DeviceInfo {
        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val mem = ActivityManager.MemoryInfo().also(am::getMemoryInfo)
        val vulkan = context.packageManager
            .hasSystemFeature(PackageManager.FEATURE_VULKAN_HARDWARE_VERSION, VULKAN_1_1)
        return DeviceInfo(
            totalRamMb = (mem.totalMem / (1024 * 1024)).toInt(),
            cores = Runtime.getRuntime().availableProcessors(),
            supportsVulkan11 = vulkan,
        )
    }
}
