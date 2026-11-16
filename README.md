# EvoLab

Jogo mobile onde você monta jogos simples e solta redes neurais pra aprenderem a jogar por evolução.

- **Moldes de jogo**: Corredor (pular/abaixar), Voador (bater asa entre barreiras), Esquiva (desviar de blocos que caem) e Pistas (trocar de pista numa estrada).
- **Editor**: cenário (Campo, Deserto, Noite, Neve, Doce), regras em sliders (velocidade, gravidade, pulo...), escolha de obstáculos e uma pista montada à mão que se repete em loop.
- **Treino**: uma população de IAs joga ao mesmo tempo; as de maior pontuação passam os "genes" (pesos da rede) pra geração seguinte, com cruzamento e mutação. Cada IA tem nome, a campeã usa coroa.
- **Acompanhar**: velocidade 1x–MAX, seguir a melhor ou qualquer IA (toque nela), ver só ela, ver o cérebro dela ao vivo e o gráfico de evolução.
- **Medalhas**: bronze, prata e ouro conforme o recorde das IAs em cada jogo.
- **Desafiar IA**: você joga na mesma pista, ao mesmo tempo, contra a campeã que treinou.

Feito pra tela deitada. Fonte Fredoka (licença OFL, em `www/font/`).

## Estrutura

- `www/` — o jogo inteiro (HTML + canvas + JS puro, sem dependências). Abra `www/index.html` num navegador pra testar.
  - `js/core.js` — rede neural e algoritmo genético
  - `js/games.js` — moldes de jogo (física, sensores, desenho)
  - `js/app.js` — telas e laço de simulação
- `android/` — casca Android (WebView) que empacota `www/` num APK.

## Gerar o APK

Cada push roda o workflow **APK** no GitHub Actions; o arquivo fica em *Actions → última execução → Artifacts → EvoLab-apk*.

Local (precisa do Android SDK): `cd android && ./gradlew assembleDebug` → `android/app/build/outputs/apk/debug/app-debug.apk`.
