# Terra Pesada

Jogo mobile (Android) de máquinas pesadas em cel shading. Você é contratado para
serviços de terraplanagem e opera carregadeira, caminhão basculante, trator de
esteira e minicarregadeira num terreno que deforma de verdade.

## O que já tem

- **Terreno deformável**: heightfield de 80 × 80 m (célula de 50 cm) com material
  solto e compactado. A terra escorrega até o ângulo de repouso de cada solo.
- **Grãos com física**: tudo que cai da caçamba ou da báscula vira partícula com
  volume real. Ao tocar o chão vira terreno; ao cair na báscula vira carga.
- **Quatro solos**: terra, cascalho, areia e argila, cada um com ângulo de repouso,
  coesão e dureza próprios.
- **Máquinas**: carregadeira articulada e caminhão basculante desde o início.
  Trator de esteira e minicarregadeira são comprados na garagem. Os pistões
  hidráulicos e as esteiras se movem de verdade.
- **Contratos**: nivelar lote, estrada de cascalho, aterrar buraco, cavar fundação,
  levar terra ao bota-fora e terraplanagem grande. O canteiro mostra em cores
  onde cortar e onde aterrar.
- **Controles de toque**: joystick esquerdo dirige; o direito opera braço,
  caçamba, lâmina e báscula. Arrastar no alto da tela gira a câmera, pinça dá zoom.
  Câmera externa, de cabine e aérea.

## Como baixar o APK

Cada push gera um APK pelo GitHub Actions (`.github/workflows/android-apk.yml`).
Ele aparece em **Releases** (`Terra Pesada · build N`) e como artefato da execução.
No celular, baixe o `.apk` e permita instalar de fontes desconhecidas.

## Desenvolver

```bash
npm install
npm run dev          # abre no navegador (teclado: WASD dirige, I/K braço, J/L caçamba, C câmera)
npm run build        # gera dist/
npx cap sync android # copia para o projeto Android
cd android && ./gradlew assembleDebug
```

Stack: Three.js (render), Vite (build), Capacitor (empacotamento Android).
