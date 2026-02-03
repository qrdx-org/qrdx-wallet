# QRDX Wallet Icons

This directory should contain the wallet icons in various sizes.

## Required Icons

### Browser Extension
- `icon-16.png` - 16x16px (toolbar icon, small screens)
- `icon-48.png` - 48x48px (extension management page)
- `icon-128.png` - 128x128px (Chrome Web Store, installation)

### Mobile App
Place in `/assets/` directory (root level):
- `icon.png` - 1024x1024px (app icon)
- `adaptive-icon.png` - 1024x1024px (Android adaptive icon)
- `splash.png` - 1284x2778px (splash screen)
- `favicon.png` - 48x48px (web favicon)

## Design Guidelines

- Use the QRDX brand colors
- Primary: #6366f1 (indigo)
- Keep it simple and recognizable at small sizes
- Ensure good contrast for visibility
- Follow platform-specific icon guidelines:
  - iOS: Rounded square with no transparency
  - Android: Can use transparency for adaptive icon
  - Browser: Square PNG with transparency

## Tools

- [Figma](https://www.figma.com/) - Design
- [ImageOptim](https://imageoptim.com/) - Optimize PNGs
- [Icon Kitchen](https://icon.kitchen/) - Generate adaptive icons

## TODO

- [ ] Create brand-consistent icon set
- [ ] Generate all required sizes
- [ ] Optimize for file size
- [ ] Test on all platforms
