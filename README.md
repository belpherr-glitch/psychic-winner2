# Vale Brisa

Jogo de fazenda 3D com visual pixel art para Android.

- **Tecnologia**: Three.js (WebGL) + Vite, empacotado como app Android com Capacitor.
- **Visual**: render em baixa resolução ampliado sem filtro, texturas pixel art geradas por código, shader toon "cozy" com luz de contorno e vento.
- **Estado atual**: menu inicial, criador de personagem, fazenda vazia, movimentação com analógico virtual, animações de parado/andar/correr, save automático.

## Baixar o APK

Cada push compila um APK novo pelo GitHub Actions e publica em
[Releases › vale-brisa-latest](../../releases/tag/vale-brisa-latest). Todos os APKs usam a mesma chave de
assinatura (`android/app/valebrisa-dev.keystore`, chave de desenvolvimento), então dá pra
instalar uma versão nova por cima da antiga sem perder o save.

## Desenvolvimento

```bash
npm install
npm run dev              # roda no navegador (WASD move, Shift anda devagar)
npm run android:sync     # gera dist/ e copia pro projeto Android
cd android && ./gradlew assembleDebug
```

Teste visual automatizado (screenshots do menu, criador e jogo):

```bash
npm run build && npx vite preview --port 4173 &
NODE_PATH=$(npm root -g) node scripts/shots.mjs pasta-de-saida
```

## Estrutura

| Arquivo | O que faz |
| --- | --- |
| `src/main.js` | renderizador, luz, câmera, estados (menu / criador / jogo / pausa) e loop |
| `src/world.js` | fazenda: chão, casa, cerca, árvores, lago, céu |
| `src/character.js` | personagem chibi modular, clipes de animação e mistura |
| `src/player.js` | movimentação, colisão |
| `src/materials.js` | shader toon, vento, água |
| `src/textures.js` | todas as texturas pixel art e o layout da fazenda |
| `src/input.js` | analógico virtual e teclado |
| `src/ui.js`, `src/style.css` | menus, criador, HUD |
| `src/save.js` | save versionado |
