package dev.blockport.core

/**
 * Ambiente avaliado nas regras da Mojang. Android é apresentado como "linux"/"arm64":
 * é o que o runtime Java (HotSpot ARM64) e as natives LWJGL esperam.
 */
data class Environment(
    val osName: String = "linux",
    val osArch: String = "arm64",
    val features: Map<String, Boolean> = emptyMap(),
)

object Rules {
    /**
     * Semântica da Mojang: sem regras => permitido; senão começa negado e a
     * última regra que casa decide.
     */
    fun allows(rules: List<Rule>?, env: Environment): Boolean {
        if (rules.isNullOrEmpty()) return true
        var allowed = false
        for (rule in rules) {
            if (matches(rule, env)) allowed = rule.action == "allow"
        }
        return allowed
    }

    private fun matches(rule: Rule, env: Environment): Boolean {
        rule.os?.let { os ->
            if (os.name != null && os.name != env.osName) return false
            if (os.arch != null && os.arch != env.osArch) return false
        }
        rule.features?.let { required ->
            for ((key, value) in required) {
                if ((env.features[key] ?: false) != value) return false
            }
        }
        return true
    }
}
