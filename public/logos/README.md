Coin and network logos the wallet draws in one colour (components/wallet/CoinLogo.tsx
uses each file as a CSS mask, so only its shape matters and it takes the text colour).

- `qrdx.svg` is the glyph of the QRDX mark (`public/tokens/qrdx.svg` without its disc).
- Every other file is the "mono" variant from web3icons (`@web3icons/core` 4.0.50,
  https://web3icons.io), MIT License, Copyright (c) 0xa3k5.

To add one: copy `dist/svgs/tokens/mono/<SYMBOL>.svg.js` or `dist/svgs/networks/mono/<name>.svg.js`
from that package, keep the SVG string, and name the file in lower case. Then list it in
`CoinLogo.tsx`.
