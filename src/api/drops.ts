import type { Chain } from "../types"
import {
  getCrossChainDropMintPath,
  getDeployDropPath,
  getDeployDropReceiptPath,
  getDropMintPath,
  getDropPath,
  getDropsPath,
} from "./apiPaths"
import type { Fetcher } from "./fetcher"
import type {
  CrossChainDropMintRequest,
  CrossChainDropMintResponse,
  DropDeployReceiptResponse,
  DropDeployRequest,
  DropDeployResponse,
  DropMintRequest,
  DropMintResponse,
  GetDropResponse,
  GetDropsArgs,
  GetDropsResponse,
} from "./types"

/**
 * Drop-related API operations
 */
export class DropsAPI {
  constructor(private fetcher: Fetcher) {}

  /**
   * Gets a list of drops (mints).
   */
  async getDrops(args?: GetDropsArgs): Promise<GetDropsResponse> {
    const response = await this.fetcher.get<GetDropsResponse>(getDropsPath(), {
      ...args,
      chains: args?.chains?.join(","),
    })
    return response
  }

  /**
   * Gets detailed drop information for a collection.
   */
  async getDrop(slug: string): Promise<GetDropResponse> {
    const response = await this.fetcher.get<GetDropResponse>(getDropPath(slug))
    return response
  }

  /**
   * Builds a mint transaction for a drop.
   */
  async buildMintTransaction(
    slug: string,
    request: DropMintRequest,
  ): Promise<DropMintResponse> {
    const response = await this.fetcher.post<DropMintResponse>(
      getDropMintPath(slug),
      request,
    )
    return response
  }

  /**
   * Builds ordered transactions for paying on one chain and minting on
   * another. Submit each transaction in order, then poll the returned
   * `receiptRequest` with `getTransactionReceipt` until it is terminal.
   */
  async buildCrossChainMintTransactions(
    slug: string,
    request: CrossChainDropMintRequest,
  ): Promise<CrossChainDropMintResponse> {
    return this.fetcher.post<CrossChainDropMintResponse>(
      getCrossChainDropMintPath(slug),
      request,
    )
  }

  /**
   * Builds a deploy-contract transaction for a new drop. Returns
   * ready-to-sign transaction data. The caller submits it onchain, then polls
   * `getDeployReceipt` until the contract address is available.
   */
  async deployDropContract(
    request: DropDeployRequest,
  ): Promise<DropDeployResponse> {
    return this.fetcher.post<DropDeployResponse>(getDeployDropPath(), request)
  }

  /**
   * Get the receipt of a previously submitted drop-deploy transaction.
   */
  async getDeployReceipt(
    chain: Chain,
    txHash: string,
  ): Promise<DropDeployReceiptResponse> {
    return this.fetcher.get<DropDeployReceiptResponse>(
      getDeployDropReceiptPath(chain, txHash),
    )
  }
}
