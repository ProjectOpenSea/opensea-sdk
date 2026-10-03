---
title: Contributing
category: 64cbb5277b5f3c0065d96616
slug: opensea-sdk-contributions
parentDocSlug: opensea-sdk
order: 5
hidden: false
---

# Contributing

Contributions are welcome! Please use GitHub issues for suggestions/concerns - if you prefer to express your intentions in code, feel free to submit a pull request.

## Development Setup

**Prerequisites**

- Node.js 22 or higher
- npm or yarn

**Initial Setup**

Before any development, install the required NPM dependencies:

```bash
npm install
```

TypeScript is included as a dev dependency, so there's no need to install it globally.

## Development Workflow

**Build**

Lint and build the library into the `lib` directory:

```bash
npm run build
```

**Linting**

Check code quality and formatting:

```bash
npm run lint
```

Fix linting issues automatically:

```bash
npm run lint:fix
```

**Testing**

Run the unit tests:

```bash
npm test
```

Run all tests (unit + integration):

```bash
npm run test:all
```

Note that integration tests require access to a blockchain RPC provider (via Alchemy) and the OpenSea API. Set up your environment variables in a `.env` file:

```bash
ALCHEMY_API_KEY=your_alchemy_key
OPENSEA_API_KEY=your_opensea_key
WALLET_PRIV_KEY=your_test_wallet_private_key  # For integration tests only
```

**Testing Your Branch Locally**

To test your changes in another project:

```bash
# In @opensea/sdk repo
npm link

# In the project where you want to test
npm link @opensea/sdk
```

## Pull Request Guidelines

When submitting a pull request:

1. **Run tests**: Ensure all tests pass with `npm test`
2. **Run linting**: Ensure code passes linting with `npm run lint`
3. **Add tests**: Add tests for any new functionality
4. **Update docs**: Update relevant documentation if needed
5. **Follow conventions**: Match the existing code style and patterns
6. **Descriptive commits**: Write clear commit messages describing your changes

## Code Style

The project uses:

- **TypeScript** for type safety
- **Biome** for code linting and formatting
- **Husky** for pre-commit hooks (automatically runs linting on changed files)

The pre-commit hooks will automatically format your code and run linting checks. If the checks fail, the commit will be rejected until issues are fixed.

## Project Structure

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

> **Note:** TypeChain was removed in v10. Contract interactions now use ABIs directly through the provider abstraction layer (`src/provider/`).

## Adding New Features

When adding new features:

1. **Check existing issues**: See if someone has already suggested the feature
2. **Create an issue first**: Discuss the feature before implementing
3. **Follow SDK patterns**: Look at existing code for consistency
4. **Add comprehensive tests**: Include both unit and integration tests where appropriate
5. **Document your changes**: Update relevant documentation files
6. **Consider backward compatibility**: Avoid breaking changes when possible

## Getting Help

- **Issues**: Use [GitHub Issues](https://github.com/ProjectOpenSea/opensea-sdk/issues) for bug reports and feature requests
- **Discussions**: Use [GitHub Discussions](https://github.com/ProjectOpenSea/opensea-sdk/discussions) for questions and general discussion
- **Documentation**: Check the [docs](https://docs.opensea.io/reference/sdk-overview) for API and SDK guidance
