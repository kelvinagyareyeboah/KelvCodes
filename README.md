<div align="center">

```
██╗  ██╗███████╗██╗     ██╗   ██╗ ██████╗ ██████╗ ██████╗ ███████╗███████╗
██║ ██╔╝██╔════╝██║     ██║   ██║██╔════╝██╔═══██╗██╔══██╗██╔════╝██╔════╝
█████╔╝ █████╗  ██║     ██║   ██║██║     ██║   ██║██║  ██║█████╗  ███████╗
██╔═██╗ ██╔══╝  ██║     ╚██╗ ██╔╝██║     ██║   ██║██║  ██║██╔══╝  ╚════██║
██║  ██╗███████╗███████╗ ╚████╔╝ ╚██████╗╚██████╔╝██████╔╝███████╗███████║
╚═╝  ╚═╝╚══════╝╚══════╝  ╚═══╝   ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚══════╝
```

**AI-powered code generation · contextual refactoring · real-time suggestions**

[![Version](https://img.shields.io/visual-studio-marketplace/v/kelvcodes.kelvcodes?style=flat-square&label=vs%20marketplace&color=3fb950&labelColor=161b22)](https://marketplace.visualstudio.com/items?itemName=kelvcodes.kelvcodes)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/kelvcodes.kelvcodes?style=flat-square&color=58a6ff&labelColor=161b22)](https://marketplace.visualstudio.com/items?itemName=kelvcodes.kelvcodes)
[![Rating](https://img.shields.io/visual-studio-marketplace/stars/kelvcodes.kelvcodes?style=flat-square&color=f0883e&labelColor=161b22)](https://marketplace.visualstudio.com/items?itemName=kelvcodes.kelvcodes)
[![License](https://img.shields.io/github/license/kelvinagyareyeboah/kelvcodes?style=flat-square&color=bc8cff&labelColor=161b22)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?style=flat-square&labelColor=161b22)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-39d353?style=flat-square&labelColor=161b22)](./CONTRIBUTING.md)

</div>

---

## `$ whoami`

**kelvcodes** is a lightweight, fast VS Code extension that brings AI-powered intelligence directly into your editor — no context switching, no copy-pasting from a browser tab. Generate production-ready code from a prompt, refactor with full file awareness, and get real-time inline suggestions that actually understand your codebase.

> *"Write less boilerplate. Ship more product."*

---

## `$ ls features/`

### ⚡ AI Code Generation
Describe what you want in plain English. kelvcodes generates functions, classes, API handlers, and entire modules in milliseconds — in whatever language you're working in.

### 🔄 Contextual Refactoring
Select any block of code and ask kelvcodes to simplify, optimize, rename, or restructure it. It reads your full file context before touching a single line.

### 👁 Real-Time Inline Suggestions
Ghost-text completions appear as you type, trained on your current file and open tabs. Accept with `Tab`, skip with `Escape`.

### 🖥 Command Palette Integration
Every feature is one keystroke away. Hit `Ctrl+Shift+K` (or `Cmd+Shift+K` on Mac) to open the kelvcodes panel from anywhere in VS Code.

---

## `$ cat INSTALL.md`

### Via VS Code Marketplace

1. Open VS Code
2. Launch the Extensions panel → `Ctrl+Shift+X`
3. Search **kelvcodes**
4. Click **Install**

### Via CLI

```bash
code --install-extension kelvcodes.kelvcodes
```

### Via VSIX (manual)

```bash
git clone https://github.com/kelvinagyareyeboah/kelvcodes.git
cd kelvcodes
npm install
npm run build
code --install-extension kelvcodes-*.vsix
```

---

## `$ cat USAGE.md`

### Generate code

```
Ctrl+Shift+K  →  "Generate"  →  type your prompt  →  Enter
```

```
// prompt: "create a debounce function in TypeScript"

function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
```

### Refactor selected code

```
Select code  →  Right-click  →  kelvcodes: Refactor  →  describe the change
```

### Inline suggestions

Suggestions appear automatically as you type. No shortcut needed.

```
Tab          →  accept suggestion
Escape       →  dismiss
Alt+]        →  next suggestion
Alt+[        →  previous suggestion
```

---

## `$ cat package.json | jq '.dependencies'`

| Package | Purpose |
|---|---|
| `typescript` | Extension language |
| `@types/vscode` | VS Code Extension API types |
| `@anthropic-ai/sdk` | AI inference (Claude API) |
| `esbuild` | Fast bundler |
| `webpack` | Extension packaging |

---

## `$ cat config.json`

Add to your VS Code `settings.json`:

```jsonc
{
  // Your API key (required)
  "kelvcodes.apiKey": "your-api-key-here",

  // Model to use (default: claude-sonnet-4-20250514)
  "kelvcodes.model": "claude-sonnet-4-20250514",

  // Enable / disable inline suggestions
  "kelvcodes.inlineSuggestions": true,

  // Max tokens per generation (default: 1024)
  "kelvcodes.maxTokens": 1024,

  // Trigger shortcut
  "kelvcodes.keybinding": "ctrl+shift+k"
}
```

---

## `$ cat ROADMAP.md`

```
[✓] AI code generation
[✓] Contextual refactoring
[✓] Real-time inline suggestions
[✓] Command palette integration
[ ] Multi-file context window
[ ] Chat sidebar panel
[ ] Automated test generation
[ ] JSDoc / docstring auto-writer
[ ] Custom model support
[ ] Offline / local model mode
```

---

## `$ ls project/`

```
kelvcodes/
├── src/
│   ├── extension.ts        # Entry point
│   ├── commands/           # Command handlers
│   ├── providers/          # Inline suggestion provider
│   ├── api/                # Claude API client
│   └── utils/              # Helpers
├── test/
├── package.json
├── tsconfig.json
├── webpack.config.js
└── README.md
```

---

## `$ cat CONTRIBUTING.md`

All contributions are welcome — bug reports, feature requests, or pull requests.

```bash
# Fork → clone → branch
git checkout -b feat/your-feature

# Install deps
npm install

# Run in dev mode (opens Extension Development Host)
npm run watch
F5  # inside VS Code

# Before submitting
npm run lint
npm run test
```

Please follow the existing code style and open an issue before major changes.

---

## `$ cat LICENSE`

MIT License — © 2025 [Agyare Kelvin Yeboah](https://kelvinagyareyeboah.me)

Free to use, modify, and distribute with attribution.

---

## `$ whoami --links`

<div align="center">

[![GitHub](https://img.shields.io/badge/GitHub-kelvinagyareyeboah-161b22?style=flat-square&logo=github&logoColor=white)](https://github.com/kelvinagyareyeboah)
[![Twitter](https://img.shields.io/badge/Twitter-@_yo_kelvin-161b22?style=flat-square&logo=x&logoColor=white)](https://x.com/_yo_kelvin)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-agyarekelvinyeboah-0a66c2?style=flat-square&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/agyarekelvinyeboah)
[![Website](https://img.shields.io/badge/Website-kelvinagyareyeboah.me-3fb950?style=flat-square&logo=safari&logoColor=white)](https://kelvinagyareyeboah.me)
[![Zoharix](https://img.shields.io/badge/Company-zoharix.tech-bc8cff?style=flat-square&logo=vercel&logoColor=white)](https://zoharix.tech)

---

*built with intention by [@kelvinagyareyeboah](https://github.com/kelvinagyareyeboah) · co-founder @ [Zoharix](https://zoharix.tech)*


