import type { Chain } from "../types"
import {
  getAccountTokenActivityPath,
  getBatchTokensPath,
  getSwapExecutePath,
  getSwapQuotePath,
  getTokenActivityPath,
  getTokenActivityStatsPath,
  getTokenGroupPath,
  getTokenGroupsPath,
  getTokenHoldersPath,
  getTokenLiquidityPoolsPath,
  getTokenOhlcvPath,
  getTokenPath,
  getTokenPriceHistoryPath,
  getTopTokensPath,
  getTrendingTokensPath,
} from "./apiPaths"
import type { Fetcher } from "./fetcher"
import type {
  BatchTokensRequest,
  GetAccountTokenActivityArgs,
  GetAccountTokenActivityResponse,
  GetSwapQuoteArgs,
  GetSwapQuoteResponse,
  GetTokenGroupResponse,
  GetTokenGroupsArgs,
  GetTokenGroupsResponse,
  GetTokenResponse,
  GetTokensArgs,
  GetTopTokensResponse,
  GetTrendingTokensResponse,
  OhlcvResponse,
  PriceHistoryResponse,
  SwapExecuteRequest,
  SwapExecuteResponse,
  TokenActivityArgs,
  TokenActivityStatsArgs,
  TokenActivityStatsResponse,
  TokenBatchResponse,
  TokenHoldersArgs,
  TokenHoldersResponse,
  TokenLiquidityPoolsArgs,
  TokenLiquidityPoolsResponse,
  TokenSwapActivityPaginatedResponse,
  TokenTimeSeriesArgs,
} from "./types"

/**
 * Token-related API operations
 */
export class TokensAPI {
  constructor(private fetcher: Fetcher) {}

  /**
   * Gets a list of trending tokens.
   */
  async getTrendingTokens(
    args?: GetTokensArgs,
  ): Promise<GetTrendingTokensResponse> {
    const response = await this.fetcher.get<GetTrendingTokensResponse>(
      getTrendingTokensPath(),
      args,
    )
    return response
  }

  /**
   * Gets a list of top tokens.
   */
  async getTopTokens(args?: GetTokensArgs): Promise<GetTopTokensResponse> {
    const response = await this.fetcher.get<GetTopTokensResponse>(
      getTopTokensPath(),
      args,
    )
    return response
  }

  /**
   * Gets a swap quote.
   */
  async getSwapQuote(args: GetSwapQuoteArgs): Promise<GetSwapQuoteResponse> {
    const response = await this.fetcher.get<GetSwapQuoteResponse>(
      getSwapQuotePath(),
      args,
    )
    return response
  }

  /**
   * Get executable transactions for a token swap.
   * Supports same-chain and cross-chain swaps with multiple from/to assets.
   */
  async executeSwap(request: SwapExecuteRequest): Promise<SwapExecuteResponse> {
    return this.fetcher.post<SwapExecuteResponse>(getSwapExecutePath(), request)
  }

  /**
   * Gets details for a specific token.
   */
  async getToken(chain: string, address: string): Promise<GetTokenResponse> {
    const response = await this.fetcher.get<GetTokenResponse>(
      getTokenPath(chain, address),
    )
    return response
  }

  /**
   * Gets a paginated list of token groups (equivalent currencies across chains).
   */
  async getTokenGroups(
    args?: GetTokenGroupsArgs,
  ): Promise<GetTokenGroupsResponse> {
    return this.fetcher.get<GetTokenGroupsResponse>(getTokenGroupsPath(), args)
  }

  /**
   * Gets a single token group by its slug.
   */
  async getTokenGroup(slug: string): Promise<GetTokenGroupResponse> {
    return this.fetcher.get<GetTokenGroupResponse>(getTokenGroupPath(slug))
  }

  /**
   * Fetch multiple tokens in a single request by chain + contract address.
   */
  async getTokensBatch(
    request: BatchTokensRequest,
  ): Promise<TokenBatchResponse> {
    return this.fetcher.post<TokenBatchResponse>(getBatchTokensPath(), request)
  }

  /**
   * Fetch the price history of a token. `start_time` is required and the
   * default `end_time` is "now".
   */
  async getTokenPriceHistory(
    chain: Chain,
    address: string,
    args: TokenTimeSeriesArgs,
  ): Promise<PriceHistoryResponse> {
    return this.fetcher.get<PriceHistoryResponse>(
      getTokenPriceHistoryPath(chain, address),
      args,
    )
  }

  /**
   * Fetch OHLCV (open / high / low / close / volume) candles for a token.
   * `startTime` and `bucketSize` are required.
   */
  async getTokenOhlcv(
    chain: Chain,
    address: string,
    args: TokenTimeSeriesArgs & { bucketSize: string },
  ): Promise<OhlcvResponse> {
    return this.fetcher.get<OhlcvResponse>(
      getTokenOhlcvPath(chain, address),
      args,
    )
  }

  /**
   * Fetch recent swap activity for a token.
   */
  async getTokenActivity(
    chain: Chain,
    address: string,
    args?: TokenActivityArgs,
  ): Promise<TokenSwapActivityPaginatedResponse> {
    return this.fetcher.get<TokenSwapActivityPaginatedResponse>(
      getTokenActivityPath(chain, address),
      args,
    )
  }

  /**
   * Fetch materialized trade count, USD volume, and average trade size for a
   * token across the requested windows.
   */
  async getTokenActivityStats(
    chain: Chain,
    address: string,
    args?: TokenActivityStatsArgs,
  ): Promise<TokenActivityStatsResponse> {
    return this.fetcher.get<TokenActivityStatsResponse>(
      getTokenActivityStatsPath(chain, address),
      args ? { windows: args.windows?.join(",") } : undefined,
    )
  }

  /**
   * Fetch paginated fungible token activity (transfers, swaps, wraps, and
   * unwraps) for an account across all chains.
   */
  async getAccountTokenActivity(
    address: string,
    args?: GetAccountTokenActivityArgs,
  ): Promise<GetAccountTokenActivityResponse> {
    return this.fetcher.get<GetAccountTokenActivityResponse>(
      getAccountTokenActivityPath(address),
      args,
    )
  }

  /**
   * Fetch paginated holders for a token, including quantity held, USD value
   * and percentage held.
   *
   * `distribution` summarizes the holder base, and is null for tokens the API
   * has not measured: `totalHolders`, `topHoldersCount` (the measured top
   * cohort, 250 or every holder when there are fewer), `topHoldersConcentration`
   * (percent of eligible supply that cohort holds, 0-100, where eligible supply
   * excludes mint, LP, CEX and burn holdings), and `healthScore` with
   * `healthLabel` (STRONG | HEALTHY | CONCERNING | BAD).
   * `topOnePercentConcentration` is deprecated in favor of
   * `topHoldersConcentration`: for tokens with more than 25,000 holders it is
   * approximated from the same 250 rows.
   */
  async getTokenHolders(
    chain: Chain,
    address: string,
    args?: TokenHoldersArgs,
  ): Promise<TokenHoldersResponse> {
    return this.fetcher.get<TokenHoldersResponse>(
      getTokenHoldersPath(chain, address),
      args,
    )
  }

  /**
   * Fetch liquidity pools for a token (pool type, reserves in USD, and
   * bonding-curve progress / graduation flag where applicable).
   */
  async getTokenLiquidityPools(
    chain: Chain,
    address: string,
    args?: TokenLiquidityPoolsArgs,
  ): Promise<TokenLiquidityPoolsResponse> {
    return this.fetcher.get<TokenLiquidityPoolsResponse>(
      getTokenLiquidityPoolsPath(chain, address),
      args,
    )
  }
}
