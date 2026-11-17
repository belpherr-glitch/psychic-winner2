import sys, glob
from PIL import Image
d = sys.argv[1]
fs = sorted(glob.glob(d + '/c*.png'))
W = Image.new('RGB', (330 * 8, 920))
for k, f in enumerate(fs):
    W.paste(Image.open(f), ((k // 2) * 330, (k % 2) * 460))
W.crop((0, 0, 1320, 920)).save(d + '/sheetA.png')
W.crop((1320, 0, 2640, 920)).save(d + '/sheetB.png')
