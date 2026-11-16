# EvoLab

Jogo mobile onde você monta jogos simples e solta redes neurais pra aprenderem a jogar por evolução.

- **Moldes de jogo**: Corredor (pular/abaixar), Voador (bater asa entre barreiras) e Esquiva (desviar de blocos que caem).
- **Editor**: regras em sliders (velocidade, gravidade, pulo...), escolha de obstáculos e uma pista montada à mão que se repete em loop.
- **Treino**: uma população de IAs joga ao mesmo tempo; as de maior pontuação passam os "genes" (pesos da rede) pra geração seguinte, com cruzamento e mutação.
- **Acompanhar**: velocidade 1x–MAX, seguir a melhor ou qualquer IA, ver só ela, ver o cérebro dela ao vivo e o gráfico de evolução.
- **Jogar eu mesmo**: testa o jogo que você montou.

## Estrutura

- `www/` — o jogo inteiro (HTML + canvas + JS puro, sem dependências). Abra `www/index.html` num navegador pra testar.
  - `js/core.js` — rede neural e algoritmo genético
  - `js/games.js` — moldes de jogo (física, sensores, desenho)
  - `js/app.js` — telas e laço de simulação
- `android/` — casca Android (WebView) que empacota `www/` num APK.

## Gerar o APK

Cada push roda o workflow **APK** no GitHub Actions; o arquivo fica em *Actions → última execução → Artifacts → EvoLab-apk*.

Local (precisa do Android SDK): `cd android && ./gradlew assembleDebug` → `android/app/build/outputs/apk/debug/app-debug.apk`.
