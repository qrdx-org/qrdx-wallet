# The wallet's icon

`glass-mark.wgsl` draws the QRDX mark (the geometry of `components/QrdxMark.tsx`) as Liquid
Glass in the wallet's monochrome: clear rounded strokes, a white highlight from the upper left, a
darker band inside the far edge and a soft shadow. Its parameters:

| Param     | Meaning                                                                  |
| --------- | ------------------------------------------------------------------------ |
| `tile`    | 1: on the black tile (iOS home screen); 0: transparent background        |
| `shadow`  | 1: soft shadow under the glass; 0: none (small sizes)                    |
| `density` | 0: clear glass (large icons); toward 1: smoked glass (16 to 48 px)       |
| `size`    | how much of the image the mark spans                                     |

iOS fills transparent pixels of a home-screen icon with black and a web app cannot ship Apple's
layered `.icon` format, so `apple-touch-icon.png` is the glass on black. Every other icon has no
background.

To remake them, draw the effect with vgpu into a `target` in a browser with WebGPU (Chromium with
`--enable-unsafe-webgpu` on localhost works), read the pixels back, save PNGs at four times the
size and downscale with ImageMagick (`convert in.png -filter Lanczos -resize NxN out.png`; add
`-alpha off` for the apple-touch-icon, and `-define png:color-type=6` (`=2` for the
apple-touch-icon) so the files stay colour PNGs rather than greyscale):

| File                               | Render       | tile | shadow | density | size |
| ---------------------------------- | ------------ | ---- | ------ | ------- | ---- |
| `public/icons/icon-512.png`        | 2048         | 0    | 1      | 0       | 0.8  |
| `public/icons/icon-192.png`        | 768          | 0    | 1      | 0.25    | 0.8  |
| `public/icons/apple-touch-icon.png`| 720 → 180    | 1    | 1      | 0       | 0.74 |
| `public/icons/favicon-32.png`      | 128          | 0    | 0      | 0.85    | 0.92 |
| `assets/icon/extension-16.png`     | 64           | 0    | 0      | 0.9     | 0.94 |
| `assets/icon/extension-48.png`     | 192          | 0    | 0      | 0.75    | 0.9  |
| `assets/icon/extension-128.png`    | 512          | 0    | 1      | 0.15    | 0.82 |

The tile colour passed in: `ink` 0.031, 0.031, 0.031 (`--background`, dark).
