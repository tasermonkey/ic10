# IC10 Emulator (`@tasermonkey/ic10`)

> **This is a modified fork of [Stationeers-ic/ic10](https://github.com/Stationeers-ic/ic10)**, the IC10
> emulator by the Stationeers-ic team and its contributors. All credit for the emulator itself
> goes to them. This fork is published to npm as **`@tasermonkey/ic10`**; the original is
> [`@stationeers-ic/ic10`](https://www.npmjs.com/package/@stationeers-ic/ic10). Like the original, it
> is licensed under the [GNU AGPL-3.0](LICENSE). [NOTICE](NOTICE) lists what changed and when.
>
> The fork exists to power [IC10 Bench](https://github.com/tasermonkey/ic10-bench), a testing
> framework for IC10 scripts: Vitest tests that build an emulated game world (devices, networks,
> property values), run a script against it tick by tick, and check registers and device state.
> Questions about this fork go to [its issues](https://github.com/tasermonkey/ic10/issues), not upstream's.

[![npm version](https://img.shields.io/npm/v/@tasermonkey/ic10.svg)](https://www.npmjs.com/package/@tasermonkey/ic10)
[![GitHub issues](https://img.shields.io/github/issues/tasermonkey/ic10.svg)](https://github.com/tasermonkey/ic10/issues)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/tasermonkey/ic10/ci.yml)](https://github.com/tasermonkey/ic10/actions)
[![Upstream](https://img.shields.io/badge/upstream-Stationeers--ic%2Fic10-lightgrey.svg)](https://github.com/Stationeers-ic/ic10)
[![Stationeers](https://img.shields.io/badge/Stationeers-IC10-blue.svg)](https://store.steampowered.com/app/544550/Stationeers/)
[![Node](https://img.shields.io/badge/runtime-Node%2024%2B-339933.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/lang-TypeScript-blue.svg)](https://www.typescriptlang.org/)

## Changes from upstream

- **Node 24 + npm, real ESM.** No Bun. Sources run directly on Node (type stripping), tests use
  Vitest, and imports are relative with `.ts` extensions (see `tools/codemod-esm.ts`).
- **Engine fixes** the tests depend on: `ld`/`sd` by reference ID (including IDs in defines),
  `define X 0`, the sandbox "no network for port" error, and `yield`/`sleep` reporting a suspend
  request instead of waiting in real time (which also fixes `sleep`'s double ×1000).
- **Matching the game.** Instruction behaviour checked against the game and its DLL: errors halt
  the chip instead of escaping `step()`, `jal`/branch-and-link store the next line in `ra`, batch
  reads over no devices, stack and device memory, slot reads, `lr`, `jr`, defines, malformed
  literals and the `nan` constant (audit findings G13–G35).
- **Tests for every condition instruction:** each `s*`, `b*` and `br*` form, its and-link variant,
  NaN, and the `ap`/`na` tolerances, plus `alias`, `sleep`, `yield` and `hcf`.
- **Readability:** typo fixes (`Builder`, `Environment`, `watch.ts`, …), English comments and
  messages, and documented environment-schema fields.

Game-data updates come from regenerating with the fork's own tools (`npm run upgrade`).

## About the original project

This project is an IC10 emulator (programming language for the game Stationeers) with a complete toolkit for development, testing, and code generation.

## 🚀 Features

- **Full IC10 Emulation** - Execute IC10 code with support for all instructions
- **TypeScript Type Generation** - Automatic generation of types for devices, instructions, and constants
- **Device System** - Typed classes for all in-game devices
- **Development Tools** - Automatic code generation, index files, and configurations
- **Testing** - Comprehensive test system with VSCode support
- **Watch Mode** - Automatic rebuild on source code changes

## 🏗️ Project Structure

```tree
src/
├── Core/                 # Base classes (Device, Housing, Network, Slot, Stack)
├── Defines/             # Generated constants and definitions
├── Devices/             # Auto-generated device classes
├── Ic10/                # IC10 emulator core
│   ├── Context/         # Execution contexts (Real, Sandbox)
│   ├── Instruction/     # IC10 instruction implementations
│   ├── Lines/           # Code line processing
│   └── SandBox.ts       # Execution sandbox
tests/                   # Tests
tools/                   # Generation scripts and utilities
samples/                 # IC10 code examples
```

## 🛠️ Installation & Setup

### Prerequisites
- [Node.js](https://nodejs.org) 24 or later (runs the TypeScript sources and tools directly)
- IDE with TypeScript support (VSCode recommended)

### Installation
```bash
git clone https://github.com/tasermonkey/ic10.git
cd ic10
npm install
```

### Development
```bash
# Run in development mode with file watching
npm run dev

# Run tests
npx vitest run

# Full project rebuild
npm run upgrade
```

## 📋 package.json Scripts

### Main Commands
- `dev` - Development mode with file watching
- `build` - Full project build
- `test` - Run tests
- `upgrade` - Full data update and regeneration

### Code Generation
- `download` - Download latest data from server
- `generate-device` - Generate device classes
- `generate:index` - Update index files
- `generate-instruction-index` - Generate instruction index
- `generate-vscode` - Update VSCode configuration

### Code Quality
- `lint` - Code checking with Biome
- `fix` - Automatic problem fixing
- `format` - Code formatting

## 🔧 Development Process

### 1. Project Initialization
```bash
npm run upgrade
```

This script performs:
- Downloading current device, instruction, and constant data
- Generating TypeScript types and classes
- Creating index files
- Updating VSCode configuration

### 2. Development Mode
```bash
npm run dev
```

The `watch.ts` script monitors changes and automatically:
- Regenerates index files when sources change
- Updates devices when definitions change
- Rebuilds instruction index when instruction classes change

### 3. Creating a New Instruction

1. Create a class in `src/Ic10/Instruction/`
2. Inherit from the base Instruction class
3. Implement the `tests()` method for testing
4. The system will automatically detect and add the instruction

### 4. Testing
```bash
# Run all tests
npx vitest run

# Run specific test
npx vitest run tests/ic10/main.test.ts

# Show executed tests
npm run show
```

## 🎯 Using the Emulator
comming soon

## 🔄 Code Generation System

### Device Generation (`generate-devices.ts`)
- Analyzes device data from API
- Creates typed TypeScript classes
- Groups devices by base types (Housing, Structure, Item)
- Generates index files for export

### Instruction Generation (`generate-instruction-index.ts`)
- Automatically discovers instruction classes
- Creates instruction map for quick access
- Generates TypeScript types for instruction names

### VSCode Update (`generate-vscode.ts`)
- Collects instruction test information
- Updates launch.json for debugging
- Provides autocompletion for instruction names

## 📊 Change Monitoring

The `watch.ts` system provides:
- **Debounce mechanism** - Prevents multiple rebuilds
- **Selective regeneration** - Only necessary parts on change
- **Template support** - Different scripts for different file types
- **Unnecessary file ignoring** - Prevents cyclic rebuilds

## 🧪 Testing

The project uses a comprehensive testing system:
- Unit tests for individual components
- Integration tests for the IC10 emulator
- Instruction tests with automatic discovery
- JUnit format report generation

## 🔧 Configuration

### VSCode
- Autocompletion for IC10 instructions
- Debug configuration for tests
- Biome integration for linting

### Biome
- Code formatting
- TypeScript linting
- Automatic problem fixing

### Vite
- Library building
- TypeScript type generation
- ESM and CommonJS support

## 🏛 Used Libraries

### exact-ic10-math (by Aidan647)
- Porting mathematical and bitwise functions from the Game (C#) to Typescript
- **Acknowledgments**: Aidan647 for creating the exact math library that provides full calculation compatibility with Stationeers game

### Other Key Libraries
- **crc-32** - Checksum calculation for device operations
- **uuid** - Unique identifier generation for emulator entities
- **axios** - HTTP client for data downloading
- **vite** - Modern project build system
- **biome** - Code formatting and linting

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Implement changes
4. Add tests
5. Ensure all tests pass
6. Create a Pull Request

### Code Standards
- Use `npm run fix` before commit
- Follow Biome code style
- Add tests for new functionality
- Update documentation when necessary

## 📝 Useful Commands

```bash
# Quick project check
npm run fix

# Formatting only
npm run format

# Formatting check
npm run format:check

# Run specific generation script
npm run generate-device
```

<!-- ## 📄 License

Project distributed under [license specified in package.json]. -->