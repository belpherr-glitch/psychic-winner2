# Componentes de terceiros

O código do BlockPort (launcher, camada GLFW para Android, bootstrap da JVM,
controles e sistema de desempenho) é próprio deste repositório.
O APK também inclui, sem modificações, estes componentes de código aberto,
baixados pelo CI:

| Componente | Licença | Origem |
|---|---|---|
| LWJGL 3.3.3 (jars, baixados em tempo de execução do Maven Central) | BSD-3-Clause | https://www.lwjgl.org |
| Natives bionic do LWJGL 3 (`liblwjgl*.so`) | BSD-3-Clause | build do projeto PojavLauncher (commit fixado no workflow) |
| gl4es (`libgl4es_114.so`) | MIT | https://github.com/ptitSeb/gl4es (build do PojavLauncher) |
| OpenAL Soft (`libopenal.so`) | LGPL-2.0 | https://github.com/kcat/openal-soft (build do PojavLauncher) |
| FreeType (`libfreetype.so`) | FreeType License | https://freetype.org (build do PojavLauncher) |
| LTW (`libltw.so`) | LGPL-3.0 | https://github.com/PojavLauncherTeam/LTW |
| OpenJDK 21 para Android | GPLv2 + Classpath Exception | https://github.com/AngelAuraMC/angelauramc-openjdk-build (release `download_jre21`) |

As bibliotecas LGPL são carregadas dinamicamente e podem ser substituídas.
Minecraft é marca da Mojang/Microsoft; o jogo não é distribuído, é baixado dos servidores oficiais.
