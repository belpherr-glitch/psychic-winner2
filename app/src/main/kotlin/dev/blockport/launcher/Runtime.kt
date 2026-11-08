package dev.blockport.launcher

import dev.blockport.core.GameRuntime

/**
 * Placeholder: o runtime real (JRE ARM64 + ponte LWJGL/GLFW + renderer GL) ainda
 * não existe. Veja "Roadmap" no README.
 */
object NotInstalledRuntime : GameRuntime {
    override val name = "Nenhum runtime instalado"
    override fun isAvailable() = false
    override fun launch(command: List<String>, workingDir: String): Result<Unit> =
        Result.failure(IllegalStateException("Runtime Java/OpenGL ainda não implementado nesta versão."))
}
