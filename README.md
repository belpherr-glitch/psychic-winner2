# BlockPort

Launcher de Minecraft Java para Android, escrito do zero (Kotlin + Jetpack Compose).

## Estado atual (v0.1 — esqueleto)

**Ainda não roda o jogo.** O que existe e funciona:

| Parte | Status |
|---|---|
| Lista de versões (manifest oficial da Mojang) | ok |
| Download paralelo de client, libraries, assets e natives, com SHA-1 e escrita atômica | ok |
| Regras da Mojang (os/arch/features) e montagem do classpath | ok, testado |
| Montagem da linha de comando (JVM + game args, formatos novo e legado) | ok, testado |
| Perfil de desempenho por aparelho (heap, GC, renderer sugerido) | heurística inicial |
| UI Compose (versões, instalar, perfil de desempenho) | ok |
| **Runtime Java ARM64 + ponte LWJGL/GLFW + renderer OpenGL** | **não implementado** (`GameRuntime`) |
| Login Microsoft | não implementado (hoje só perfil local) |

O botão "Jogar" gera e mostra o comando completo; falta o runtime para executá-lo.

## Estrutura

- `core/` — Kotlin/JVM puro: modelos, regras, plano de download, instalador, comando de lançamento, perfil de desempenho. Testes em `core/src/test`.
- `app/` — app Android (Compose), consome `core`.
- `.github/workflows/build-apk.yml` — compila e publica o APK debug.

## Gerar o APK

**GitHub Actions:** cada push roda o workflow *Build APK*; o APK sai como artefato `BlockPort-debug-apk` na aba Actions.

**Local:** Android Studio, ou `./gradlew :core:test :app:assembleDebug` (JDK 17 + Android SDK). O APK fica em `app/build/outputs/apk/debug/`.

## Roadmap para jogar de verdade

1. Runtime: JRE ARM64 (Java 8/17/21 conforme `javaVersion` da versão) empacotado e carregado via JNI.
2. Ponte LWJGL 3 / GLFW sobre `Surface`/EGL, entrada de toque, teclado e controle.
3. Renderer OpenGL: GL4ES (compatível) e Zink/Vulkan (desempenho) escolhidos pelo perfil.
4. Login Microsoft (OAuth device code) — o jogo exige conta que possua Minecraft Java.
5. Benchmark por SoC para calibrar `PerformanceProfile`.
6. Assets legados (`virtual`/`map_to_resources`, versões <= 1.7.2).

Minecraft é propriedade da Mojang/Microsoft; este projeto não distribui o jogo, só baixa dos servidores oficiais.
