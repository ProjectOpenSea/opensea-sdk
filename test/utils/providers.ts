import { ethers } from "ethers"
import { Chain } from "../../src/types"
import { ALCHEMY_API_KEY } from "./env"

function alchemyProvider(chain: Chain) {
  switch (chain) {
    case Chain.Mainnet:
      return new ethers.JsonRpcProvider(
        `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      )
    case Chain.Optimism:
      return new ethers.JsonRpcProvider(
        `https://opt-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      )
    case Chain.Base:
      return new ethers.JsonRpcProvider(
        `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      )
    case Chain.Polygon:
      return new ethers.JsonRpcProvider(
        `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      )
    default:
      throw new Error(`Unsupported alchemy chain: ${chain}`)
  }
}

export { alchemyProvider }
