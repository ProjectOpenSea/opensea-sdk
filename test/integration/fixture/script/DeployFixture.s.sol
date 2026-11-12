// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {OpenSeaSdkTestFixture} from "../src/OpenSeaSdkTestFixture.sol";

/// @notice Deploys the SDK integration fixture with CREATE2, mints the supply to the owner, and
///         seeds the derived buyer wallet. Every step checks state first, so re-running it is a
///         no-op once everything is in place.
///
/// Env:
///   PK  owner private key, with or without 0x (the CI secret WALLET_PRIV_KEY holds the same key)
///
/// The buyer key is keccak256(abi.encodePacked(bytes32(PK), BUYER_TAG)), matching
/// getBuyerWallet() in packages/sdk/test/utils/setupIntegration.ts.
contract DeployFixture is Script {
    bytes32 internal constant SALT = keccak256("opensea-sdk-integration-fixture-v1");
    string internal constant BUYER_TAG = "opensea-sdk-integration-buyer";

    uint256 internal constant SUPPLY_PER_ID = 1e12;
    uint256 internal constant LISTING_ID = 1;
    uint256 internal constant SECOND_ID = 2;

    /// Matches BUYER_TOKEN_TARGET and BUYER_ETH_TARGET in packages/sdk/test/utils/fixtureTopUp.ts.
    uint256 internal constant BUYER_TOKENS = 100;
    uint256 internal constant BUYER_ETH = 0.0005 ether;

    function run() external returns (OpenSeaSdkTestFixture fixture) {
        uint256 ownerKey = _ownerKey();
        address owner = vm.addr(ownerKey);
        address buyer = vm.addr(uint256(keccak256(abi.encodePacked(bytes32(ownerKey), BUYER_TAG))));

        bytes32 initCodeHash = keccak256(abi.encodePacked(type(OpenSeaSdkTestFixture).creationCode, abi.encode(owner)));
        address predicted = vm.computeCreate2Address(SALT, initCodeHash);
        console2.log("fixture (CREATE2):", predicted);
        console2.log("buyer:", buyer);

        vm.startBroadcast(ownerKey);

        if (predicted.code.length == 0) {
            fixture = new OpenSeaSdkTestFixture{salt: SALT}(owner);
            require(address(fixture) == predicted, "CREATE2 address mismatch");
        } else {
            fixture = OpenSeaSdkTestFixture(predicted);
            console2.log("already deployed, skipping deploy");
        }
        require(fixture.owner() == owner, "fixture owned by another key");

        if (fixture.balanceOf(owner, LISTING_ID) == 0) fixture.mint(owner, LISTING_ID, SUPPLY_PER_ID);
        if (fixture.balanceOf(owner, SECOND_ID) == 0) fixture.mint(owner, SECOND_ID, SUPPLY_PER_ID);

        uint256 buyerTokens = fixture.balanceOf(buyer, LISTING_ID);
        if (buyerTokens < BUYER_TOKENS) {
            fixture.safeTransferFrom(owner, buyer, LISTING_ID, BUYER_TOKENS - buyerTokens, "");
        }
        if (buyer.balance < BUYER_ETH) {
            (bool ok,) = payable(buyer).call{value: BUYER_ETH - buyer.balance}("");
            require(ok, "buyer funding failed");
        }

        vm.stopBroadcast();

        console2.log("owner id 1 balance:", fixture.balanceOf(owner, LISTING_ID));
        console2.log("owner id 2 balance:", fixture.balanceOf(owner, SECOND_ID));
        console2.log("buyer id 1 balance:", fixture.balanceOf(buyer, LISTING_ID));
        console2.log("buyer wei:", buyer.balance);
    }

    /// @dev vm.envUint rejects a hex key without the 0x prefix, so accept both spellings.
    function _ownerKey() internal view returns (uint256) {
        string memory raw = vm.envString("PK");
        if (bytes(raw).length == 64) raw = string.concat("0x", raw);
        return vm.parseUint(raw);
    }
}
