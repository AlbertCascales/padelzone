---
version: 1
name: EmpiezaPadel — Producto 3D en pista de noche (motion comic)
description: >
  Estilo de vídeo aprobado por el usuario el 23/09/2026 (demo "Bullpadel Impulse Ctrl 2026"). Sustituye
  al blockframe negro/lima (guardado en frame-blockframe.md). El producto REAL (foto propia de la web,
  sin fondo) gira en 3D sobre una pista de noche con focos; viñetas animadas SVG/CSS explican el
  porqué de cada consejo (pista en perspectiva, trayectorias de bola, formas de pala, punto dulce).
  Referencia viva copiada en el proyecto: `referencia-demo.html`. Léela antes de construir un frame y
  reutiliza su CSS y sus patrones.
unit: 1080×1920 vertical · contenido en el 83% superior (y ≤ 1594px)
principle: cada producto se ve (foto real propia) · cada consejo se ilustra · nada inventado · voz anti-postureo
---

## Paleta
- fondo: #070907 con radial verde oscuro #1d2a10 → #0c120a; glow lima rgba(200,241,53,.22)
- marca: lima #c8f135 (dato clave, `<em>`, CTA) · texto #f2f5ea · alerta/"no lo necesitas": #ff4d5e
- pista: azul #1b5a8c → #0e3a5e con líneas #e9f3ff; bola: gradiente lima con glow

## Tipografía (locales en `assets/fonts/`, @font-face root-relative)
- Display: DM Serif Display · Etiquetas: Space Grotesk 600–800 mayúsculas · Cuerpo: DM Sans

## Atmósfera (siempre, en capas bajo el contenido)
- `.bg` radial + `.glow` que respira + dos `.beam` (focos de pista) que oscilan
- polvo: ~40 partículas deterministas (PRNG con semilla, NUNCA Math.random)
- `.grain` + `.vignette` DEBAJO del texto

## Componentes
- **Producto 3D** (`.palawrap > .pala`, ver referencia): `assets/img/<id>.png` = foto REAL de la ficha con el
  fondo quitado (`recortar-fondo.py`, lo hace el scaffolder). Grosor: 7 copias de la imagen oscurecidas
  (`.edge`, brightness .18) en translateZ -2px…-12px + la cara delantera. Cae girando (rotationY -720→-18,
  entra desde z≈-700 para que se vea ya en t=0) y rebota (thock); en reposo gira despacio.
  Zapatillas y accesorios usan el mismo componente con su foto.
- **Caption narrativo** (`.cap`): DM Serif 80px en y≈1290, palabra a palabra, clave en `<em>` lima, `.capfade` detrás.
- **Pill** arriba (y≈130): "Tu primera pala · sin postureo", "Reseña en 20 segundos"…
- **Estrellas** = nota editorial `stars` ("Nuestra valoración"), **specs** en rejilla 2×2 (forma, balance,
  núcleo, precio con contador) — datos SOLO de la ficha. Nivel solo si el producto lo trae (palas sí;
  zapatillas/accesorios no).
- **Pros/contras** que voltean (rotationX -95→0); el contra tiembla.
- **Sello** del veredicto (borde lima, fondo casi opaco, UNA línea: nowrap) que cae y sacude el producto.

## Viñetas (motion comic) — el porqué de cada consejo
Vocabulario probado en la referencia:
- pista en perspectiva con red y cristales; la bola traza su parábola (curva Bézier calculada en onUpdate,
  trazo discontinuo que se dibuja) y la escena tiembla en el bote
- forma de pala diamante (borde rojo, punto dulce pequeño y alto) tachada con una X → redonda (borde lima,
  punto dulce grande y centrado)
Ideas análogas: suela y agarre en arena (zapatillas), overgrip que se enrolla, bote de pelotas que pierde
presión, antivibrador, codo con destello de dolor (lesión por pala dura), marcador de partido.
Siluetas y formas simples y planas. Ninguna tapa más de ~40% del frame ni el caption.

## Fotograma 0 nunca vacío
El primer fotograma es la miniatura, y la portada por defecto en TikTok: el producto ya visible y la pill
arriba. Incidente del 23/09/2026: las demos «salían en negro» porque en t=0 el objeto aún no había entrado.

## Movimiento
- eases power3/expo al entrar, sine.inOut en reposo; fundidos cortos (.3–.4s) entre viñetas
- sacudidas solo en impactos; una timeline GSAP pausada, seek-safe (`immediateRender:false` en fromTo
  repetidos); nada de letterSpacing animado
- el texto entra EN SU CUE de voz (timestamps de `audio_meta.json`)

## Prohibido
- inventar datos o niveles; usar la foto de otro producto; logos o estética "oficial" de una marca
- emojis, bokeh "IA", nav/cursores; contenido por debajo de y=1594
