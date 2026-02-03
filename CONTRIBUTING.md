# Contributing to QRDX Wallet

Thank you for considering contributing to QRDX Wallet! This document provides guidelines for contributing to the project.

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on constructive criticism
- Assume good intentions

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/qrdx-org/qrdx-wallet/issues)
2. If not, create a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if applicable
   - Platform/browser version

### Suggesting Features

1. Check if the feature has been suggested
2. Create a new issue with:
   - Clear description of the feature
   - Use case and benefits
   - Possible implementation approach
   - UI mockups if applicable

### Pull Requests

1. **Fork** the repository
2. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes** following our coding standards
4. **Test thoroughly**:
   - Extension: Test in Chrome and Firefox
   - Mobile: Test on iOS and Android
5. **Commit** with clear messages:
   ```bash
   git commit -m "feat: add wallet export functionality"
   ```
6. **Push** to your fork
7. **Create a Pull Request** with:
   - Clear title and description
   - Link to related issues
   - Screenshots/videos if UI changes
   - Test results

## Development Setup

See [DEVELOPMENT.md](docs/DEVELOPMENT.md) for detailed setup instructions.

Quick start:
```bash
cd qrdx-wallet
pnpm install
pnpm dev:extension  # or dev:mobile
```

## Coding Standards

### TypeScript

- Use strict mode
- Prefer `interface` over `type`
- Add JSDoc comments for public APIs
- Use explicit return types
- No `any` types (use `unknown` if needed)

### React

- Functional components only
- Use hooks for state and effects
- Keep components small and focused
- Extract complex logic to custom hooks
- Use meaningful component names

### Styling

**Extension (Tailwind CSS):**
```tsx
// ✅ Good
<button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg">
  Submit
</button>

// ❌ Avoid inline styles
<button style={{ padding: '8px 16px' }}>Submit</button>
```

**Mobile (React Native):**
```tsx
// ✅ Good
const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  }
})

<TouchableOpacity style={styles.button}>...</TouchableOpacity>
```

### Git Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting)
- `refactor:` Code refactoring
- `test:` Adding tests
- `chore:` Maintenance tasks

Examples:
```
feat: add biometric authentication
fix: resolve transaction signing error
docs: update installation instructions
refactor: simplify wallet manager logic
```

## Project Structure

Follow the established structure:
```
src/
├── core/         # Platform-agnostic business logic
├── shared/       # Shared React components
├── extension/    # Browser extension specific
└── mobile/       # React Native specific
```

## Testing

### Before Submitting PR

- [ ] Extension works in Chrome
- [ ] Extension works in Firefox
- [ ] Mobile app works on iOS (if applicable)
- [ ] Mobile app works on Android (if applicable)
- [ ] No console errors or warnings
- [ ] Code passes `pnpm lint`
- [ ] All features work as expected
- [ ] No sensitive data in logs

## Security

- **Never** commit private keys or passwords
- **Never** disable security features
- Follow guidelines in [SECURITY.md](docs/SECURITY.md)
- Report security issues to security@qrdx.org (not GitHub)

## Questions?

- Open a [Discussion](https://github.com/qrdx-org/qrdx-wallet/discussions)
- Join our [Discord](https://discord.gg/qrdx)
- Email: dev@qrdx.org

## License

By contributing, you agree that your contributions will be licensed under the ISC License.
