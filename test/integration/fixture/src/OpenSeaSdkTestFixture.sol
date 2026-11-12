// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title OpenSeaSdkTestFixture
/// @notice ERC1155 that the OpenSea SDK integration suite trades against. It has no value:
///         the owner mints a large supply and the suite lists, offers on, and fulfills it
///         between the owner wallet and a derived buyer wallet. Metadata is fully onchain so
///         OpenSea can index it without any hosting.
contract OpenSeaSdkTestFixture is ERC1155, Ownable {
    // forge-lint: disable-next-line(screaming-snake-case-const)
    string public constant name = "OpenSea SDK Test Fixture";
    // forge-lint: disable-next-line(screaming-snake-case-const)
    string public constant symbol = "OSSDKTEST";

    string private constant DESCRIPTION =
        "Valueless ERC1155 used by the OpenSea SDK nightly integration tests. Do not buy.";

    /// @dev Static SVG, base64-encoded at call time so the source stays readable.
    string private constant IMAGE_SVG = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'>"
        "<rect width='400' height='400' fill='#2081e2'/>"
        "<text x='200' y='190' font-family='monospace' font-size='40' fill='#fff' text-anchor='middle'>SDK TEST</text>"
        "<text x='200' y='240' font-family='monospace' font-size='22' fill='#fff' text-anchor='middle'>FIXTURE</text>"
        "</svg>";

    constructor(address initialOwner) ERC1155("") Ownable(initialOwner) {}

    /// @notice Mint `amount` of token `id` to `to`. Owner only.
    function mint(address to, uint256 id, uint256 amount) external onlyOwner {
        _mint(to, id, amount, "");
    }

    /// @notice Token metadata as a base64 JSON data URI. Every id shares the image and trait.
    function uri(uint256 id) public pure override returns (string memory) {
        string memory json = string.concat(
            '{"name":"OpenSea SDK Test Fixture #',
            Strings.toString(id),
            '","description":"',
            DESCRIPTION,
            '","image":"',
            _image(),
            '","attributes":[{"trait_type":"Purpose","value":"Integration test"}]}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    /// @notice Collection-level metadata (ERC-7572), read by OpenSea for the collection page.
    function contractURI() external pure returns (string memory) {
        string memory json =
            string.concat('{"name":"', name, '","description":"', DESCRIPTION, '","image":"', _image(), '"}');
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _image() private pure returns (string memory) {
        return string.concat("data:image/svg+xml;base64,", Base64.encode(bytes(IMAGE_SVG)));
    }
}
