---
title: Contributing
category: 64cbb5277b5f3c0065d96616
slug: opensea-sdk-contributions
parentDocSlug: opensea-sdk
order: 5
hidden: false
---

# Contributing

Open a [GitHub issue](https://github.com/ProjectOpenSea/opensea-sdk/issues) for bugs and feature requests, or send a pull request. The public repository is a mirror of a private monorepo: accepted pull requests are brought into the monorepo and reach the public repository with the next release. For larger features, open an issue first so the approach can be discussed before you write code.

## Setup

You need Node.js 22 or higher. Install dependencies (TypeScript is a dev dependency):

```bash
npm install
```

## Development workflow

```bash
npm run build      # compile src/ into lib/ with tsc
npm run lint       # Biome lint and format check
npm run lint:fix   # apply Biome fixes
npm test           # unit tests
npm run test:all   # unit and integration tests
```

Integration tests call a real RPC provider (Alchemy) and the OpenSea API, and some send transactions that cost ETH. They read a `.env` file:

```bash
ALCHEMY_API_KEY=your_alchemy_key
OPENSEA_API_KEY=your_opensea_key
WALLET_PRIV_KEY=your_test_wallet_private_key  # For integration tests only
```

`test/README-integration.md` lists the other variables some tests need, such as the NFTs to list and buy.

To try your branch in another project:

```bash
# In @opensea/sdk repo
npm link

# In the project where you want to test
npm link @opensea/sdk
```

## Pull requests

- Make sure `npm test` and `npm run lint` pass.
- Add tests for new behavior, including integration tests where they make sense.
- Update the docs your change affects.
- Match the existing code style and patterns, and avoid breaking changes where you can.
- Write commit messages that say what changed.

## Project structure

```
@opensea/sdk
├── src/                   # Source code
│   ├── api/               # API client implementation
│   ├── orders/            # Order creation and utilities
│   ├── provider/          # Provider abstractions (OpenSeaSigner, OpenSeaProvider, ContractCaller, OpenSeaWallet)
│   ├── sdk/               # Core SDK functionality
│   ├── utils/             # Utility functions
│   ├── sdk.ts             # Main SDK entry point (ethers)
│   └── viem.ts            # Viem entry point (@opensea/sdk/viem)
├── test/                  # Test files
│   ├── api/               # API tests
│   ├── fixtures/          # Test fixtures and mocks
│   └── ...
├── developerDocs/         # Developer documentation
└── lib/                   # Compiled output (generated)
```

There is no TypeChain (removed in v10). Contract calls use ABIs directly through the provider layer in `src/provider/`.

## Getting help

- [GitHub Issues](https://github.com/ProjectOpenSea/opensea-sdk/issues) for bug reports and feature requests
- [GitHub Discussions](https://github.com/ProjectOpenSea/opensea-sdk/discussions) for questions
- [OpenSea docs](https://docs.opensea.io/reference/sdk-overview) for API and SDK guides
