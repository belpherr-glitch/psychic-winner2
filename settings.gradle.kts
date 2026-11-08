pluginManagement {
    repositories {
        gradlePluginPortal()
        google()
        mavenCentral()
    }
    plugins {
        kotlin("jvm") version "2.0.21"
        kotlin("android") version "2.0.21"
        kotlin("plugin.serialization") version "2.0.21"
        kotlin("plugin.compose") version "2.0.21"
        id("com.android.application") version "8.7.3"
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        mavenCentral()
        google()
    }
}

rootProject.name = "BlockPort"

// :core é Kotlin/JVM puro (testável em qualquer máquina).
include(":core")

// :app só entra quando existe Android SDK (CI, Android Studio).
val hasAndroidSdk = System.getenv("ANDROID_HOME") != null ||
    System.getenv("ANDROID_SDK_ROOT") != null ||
    file("local.properties").exists()
if (hasAndroidSdk) include(":app")
