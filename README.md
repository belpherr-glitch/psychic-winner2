# BlockPort

Launcher de Minecraft Java para Android, escrito do zero (Kotlin + Jetpack Compose).

## Estado atual (v0.2 — runtime, ainda não testado em aparelho)

| Parte | Status |
|---|---|
| Lista/instalação de versões, downloads paralelos verificados | ok, testado |
| Regras da Mojang, classpath, linha de comando | ok, testado |
| **GLFW 3.4 próprio para Android** (EGL + ANativeWindow, 117 funções exigidas pelo LWJGL 3.3.3) | compila; exportação verificada no CI |
| **Bootstrap da JVM** in-process (JLI_Launch) em processo `:game` separado | compila; não testado em aparelho |
| LWJGL 3.3.3 oficial + natives bionic (compatibilidade JNI verificada símbolo a símbolo) | ok |
| Renderer por versão: GL4ES (1.13–1.16), LTW/OpenGL 3.x (1.17+) | integrado; não testado |
| Controles de toque, teclado/mouse físico (pointer capture), teclado virtual, clipboard | implementado |
| Login Microsoft | não implementado (perfil local) |
| Minecraft ≤ 1.12.2 (LWJGL 2) | não suportado |

### O que faz rodar mais rápido (de verdade)

- **Resolução de render ajustável** (padrão 75%): o maior ganho de FPS em celular.
- **Thread de render nos núcleos grandes** (exclui o cluster econômico).
- **Android Performance Hint** (13+): cada frame reporta seu tempo ao kernel, que sobe o clock antes de engasgar.
- **Taxa de atualização máxima** da tela e **Game Mode API** declarada.
- **Modo de desempenho sustentado** opcional: clock estável em vez de picos e throttling.
- `org.lwjgl.util.NoChecks`, `LIBGL_NOERROR`, alocador do sistema, GC escolhido pelo aparelho.
- Jogo em processo separado; em segundo plano o render pausa (economiza bateria) e a superfície é recriada ao voltar.

Ganhos de FPS ainda precisam ser medidos em aparelhos reais.

## Estrutura

- `core/` — Kotlin/JVM puro: modelos, regras, plano de download, instalador, comando de lançamento, perfil de desempenho. Testes em `core/src/test`.
- `app/` — app Android (Compose), consome `core`.
- `app/src/main/cpp/` — GLFW para Android, bootstrap da JVM, desempenho (C).
- `tools/check_natives.sh` — verifica símbolos e dependências das natives no APK.
- `.github/workflows/build-apk.yml` — baixa componentes de terceiros (ver `NOTICE.md`), compila, verifica e publica o APK debug.

## Gerar o APK

**GitHub Actions:** cada push roda o workflow *Build APK*; o APK sai como artefato `BlockPort-debug-apk` na aba Actions.

**Local:** Android Studio, ou `./gradlew :core:test :app:assembleDebug` (JDK 17 + Android SDK). O APK fica em `app/build/outputs/apk/debug/`.

## Roadmap

1. Testar em aparelhos reais e corrigir o que o log (aba Desempenho → "Ver último log") mostrar.
2. Fabric + Sodium com 1 toque (o maior ganho de FPS disponível para o Minecraft Java).
3. Zink (OpenGL sobre Vulkan) como renderer alternativo para GPUs Adreno/Mali recentes.
4. Login Microsoft (OAuth device code): o jogo exige conta que possua Minecraft Java.
5. Editor de controles de toque e suporte a gamepad.
6. Compilar as natives de terceiros a partir do código-fonte no próprio CI.

Minecraft é propriedade da Mojang/Microsoft; este projeto não distribui o jogo, só baixa dos servidores oficiais.
