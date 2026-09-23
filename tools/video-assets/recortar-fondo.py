"""Quita el fondo blanco de las fotos de producto para usarlas en 3D en los vídeos.

Uso:  python tools/video-assets/recortar-fondo.py <entrada.jpg> <salida.png>

Borra el blanco conectado con los bordes (el fondo) y los huecos blancos grandes del
interior (p. ej. el corazón de una pala). Los blancos pequeños (logos, letras) se
conservan. Después recorta al contenido.
"""
import sys
from collections import deque
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGBA')
w, h = im.size
px = im.load()


def blanco(c):
    return c[0] > 225 and c[1] > 225 and c[2] > 225


def mancha(x0, y0, seen):
    """Pixeles blancos conectados a (x0, y0) y si alguno toca el borde."""
    out, borde, q = [], False, deque([(x0, y0)])
    seen[y0 * w + x0] = 1
    while q:
        x, y = q.popleft()
        out.append((x, y))
        if x in (0, w - 1) or y in (0, h - 1):
            borde = True
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and blanco(px[nx, ny]):
                seen[ny * w + nx] = 1
                q.append((nx, ny))
    return out, borde


seen = bytearray(w * h)
min_hueco = int(w * h * 0.004)  # huecos interiores mayores que esto = transparentes
for y in range(h):
    for x in range(w):
        if not seen[y * w + x] and blanco(px[x, y]):
            pts, borde = mancha(x, y, seen)
            if borde or len(pts) >= min_hueco:
                for a, b in pts:
                    px[a, b] = (255, 255, 255, 0)

im.crop(im.getbbox()).save(dst)
print(dst, im.getbbox())
