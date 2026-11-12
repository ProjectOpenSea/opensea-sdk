# Security policy

## Reporting a vulnerability

Report vulnerabilities through OpenSea's Bugcrowd program:

**https://bugcrowd.com/engagements/opensea**

OpenSea's security team monitors that program, and every report is triaged and tracked there. Do not open a public GitHub issue, discussion, or pull request about a vulnerability, and do not disclose it publicly until the program has responded.

The Bugcrowd brief defines what is in scope, what is excluded, how severity is assessed, and how rewards work. This file does not repeat any of it, because a second copy would drift from the brief. Read the brief before you start.

The program sets response and disclosure timelines, not this repository.

## About this repository

`@opensea/sdk` is the TypeScript SDK for the OpenSea marketplace. It builds orders, produces the payloads wallets sign, fulfills orders onchain, and calls the OpenSea API with the caller's key.

It moves assets. This code decides what a user is asked to sign and what a transaction does, so a bug in order construction, signing payloads, approval handling, or recipient and amount arithmetic can cost a user NFTs or tokens. For a report in that area, include the inputs and the resulting order or calldata.

This repository is a read-only mirror of a private OpenSea monorepo. Fixes arrive here as synced commits, not merged pull requests, so a missing PR does not mean a missing fix.

## Please do not

- Test against production. Do not run exploit attempts against opensea.io, api.opensea.io, or any other OpenSea-operated service. Reproduce against a local build, a testnet, or your own deployment.
- Run automated scanners, fuzzers, or crawlers against opensea.io or the OpenSea API. That traffic looks like an attack and gets blocked, and raw scanner output is not a report on its own.
- Touch accounts, wallets, or data that are not yours. Use your own.
- Attempt denial of service, spam, or social engineering against OpenSea staff, users, or infrastructure.

We cannot accept a finding that required breaking one of these rules, however real the underlying bug is.
