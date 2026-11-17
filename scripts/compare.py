# Junta uma imagem de referência com renders do personagem, lado a lado, pra comparar estilo.
# uso: python3 scripts/compare.py <referencia.jpg> <pasta-dos-renders> <saida.png>
import sys
from PIL import Image
ref = Image.open(sys.argv[1]).convert('RGB')
ref = ref.resize((int(ref.width * 560 / ref.height), 560))
mine = [Image.open(f'{sys.argv[2]}/c{i}f.png') for i in (1, 0, 3, 5)]
W = Image.new('RGB', (ref.width + 300 * 4, 560), 'white')
W.paste(ref, (0, 0))
for k, m in enumerate(mine):
    m = m.resize((int(m.width * 560 / m.height), 560))
    W.paste(m.crop(((m.width - 300) // 2, 0, (m.width - 300) // 2 + 300, 560)), (ref.width + 300 * k, 0))
W.save(sys.argv[3])
