import type {
  OperationQueryParams,
  OperationRequestBody,
  OperationResponse,
  operations,
} from "@opensea/api-types"
import type { Camelize } from "../utils/case"
import type { WalletAuthFetcher } from "./fetcher"

type OperationName = keyof operations
export type WalletAuthRequest<T extends OperationName> = Camelize<
  OperationRequestBody<T>
>
export type WalletAuthResponse<T extends OperationName> = Camelize<
  OperationResponse<T>
>
export type WalletAuthQuery<T extends OperationName> = Camelize<
  OperationQueryParams<T>
>

const segment = (value: string | number) => encodeURIComponent(String(value))

/** Typed helpers for wallet-authenticated REST operations. */
export class WalletAuthAPI {
  constructor(private fetcher: WalletAuthFetcher) {}

  getDropEligibility(slug: string) {
    return this.fetcher.get<OperationResponse<"get_drop_eligibility">>(
      `/api/v2/drops/${segment(slug)}/eligibility`,
    )
  }

  getFavorites(
    address: string,
    query?: WalletAuthQuery<"get_profile_favorites">,
  ) {
    return this.fetcher.get<OperationResponse<"get_profile_favorites">>(
      `/api/v2/account/${segment(address)}/favorites`,
      query,
    )
  }

  getTokenWatchlist(address: string) {
    return this.fetcher.get<OperationResponse<"get_account_token_watchlist">>(
      `/api/v2/account/${segment(address)}/token_watchlist`,
    )
  }

  getPerpetualWatchlist(address: string) {
    return this.fetcher.get<
      OperationResponse<"get_account_perpetual_watchlist">
    >(`/api/v2/account/${segment(address)}/perpetual_watchlist`)
  }

  addWatchlistEntry(body: WalletAuthRequest<"add_watchlist_entry">) {
    return this.fetcher.request<OperationResponse<"add_watchlist_entry">>(
      "POST",
      "/api/v2/watchlist",
      body,
    )
  }

  removeWatchlistEntry(body: WalletAuthRequest<"remove_watchlist_entry">) {
    return this.fetcher.request<OperationResponse<"remove_watchlist_entry">>(
      "DELETE",
      "/api/v2/watchlist",
      body,
    )
  }

  getAccountRelationship(addressOrUsername: string) {
    return this.fetcher.get<OperationResponse<"get_account_relationship">>(
      `/api/v2/accounts/${segment(addressOrUsername)}/relationship`,
    )
  }

  getAccountFollowing(
    addressOrUsername: string,
    query?: WalletAuthQuery<"get_account_following">,
  ) {
    return this.fetcher.get<OperationResponse<"get_account_following">>(
      `/api/v2/accounts/${segment(addressOrUsername)}/following`,
      query,
    )
  }

  getAccountFollowers(
    addressOrUsername: string,
    query?: WalletAuthQuery<"get_account_followers">,
  ) {
    return this.fetcher.get<OperationResponse<"get_account_followers">>(
      `/api/v2/accounts/${segment(addressOrUsername)}/followers`,
      query,
    )
  }

  followAccount(addressOrUsername: string) {
    return this.fetcher.request<OperationResponse<"follow_account">>(
      "POST",
      `/api/v2/accounts/${segment(addressOrUsername)}/follow`,
    )
  }

  unfollowAccount(addressOrUsername: string) {
    return this.fetcher.request<OperationResponse<"unfollow_account">>(
      "DELETE",
      `/api/v2/accounts/${segment(addressOrUsername)}/follow`,
    )
  }

  watchAccount(addressOrUsername: string) {
    return this.fetcher.request<OperationResponse<"watch_account">>(
      "POST",
      `/api/v2/accounts/${segment(addressOrUsername)}/watch`,
    )
  }

  unwatchAccount(addressOrUsername: string) {
    return this.fetcher.request<OperationResponse<"unwatch_account">>(
      "DELETE",
      `/api/v2/accounts/${segment(addressOrUsername)}/watch`,
    )
  }

  listSavedTools(query?: WalletAuthQuery<"list_saved_tools">) {
    return this.fetcher.get<OperationResponse<"list_saved_tools">>(
      "/api/v2/saved-tools",
      query,
    )
  }

  saveTool(body: WalletAuthRequest<"save_tool">) {
    return this.fetcher.request<OperationResponse<"save_tool">>(
      "POST",
      "/api/v2/saved-tools",
      body,
    )
  }

  removeSavedTool(query: WalletAuthQuery<"unsave_tool">) {
    const params = new URLSearchParams({
      tool_id: query.toolId,
      registry_chain: query.registryChain,
      registry_addr: query.registryAddr,
    })
    if (query.toolkitName != null) {
      params.set("toolkit_name", query.toolkitName)
    }
    return this.fetcher.request<OperationResponse<"unsave_tool">>(
      "DELETE",
      `/api/v2/saved-tools?${params}`,
    )
  }

  /**
   * `CancelRequest` carries `offererSignature`, which is camelCase on the wire.
   * It is optional, so snake-casing it didn't fail the request — it just dropped
   * the signature, turning a signed cancel into an unsigned one. Sent verbatim.
   */
  cancelOrder(
    chain: string,
    protocolAddress: string,
    orderHash: string,
    body?: WalletAuthRequest<"cancel_order">,
  ) {
    return this.fetcher.request<OperationResponse<"cancel_order">>(
      "POST",
      `/api/v2/orders/chain/${segment(chain)}/protocol/${segment(protocolAddress)}/${segment(orderHash)}/cancel`,
      body,
      undefined,
      { snakeizeBody: false },
    )
  }

  saveDropEdits(slug: string, body: WalletAuthRequest<"save_drop_edits">) {
    return this.fetcher.request<OperationResponse<"save_drop_edits">>(
      "POST",
      `/api/v2/drops/${segment(slug)}`,
      body,
    )
  }

  savePrerevealDropItem(
    slug: string,
    body: WalletAuthRequest<"save_prereveal_drop_item">,
  ) {
    return this.fetcher.request<OperationResponse<"save_prereveal_drop_item">>(
      "POST",
      `/api/v2/drops/${segment(slug)}/prereveal-item`,
      body,
    )
  }

  saveSelfMintDropItem(
    slug: string,
    body: WalletAuthRequest<"save_self_mint_drop_item">,
  ) {
    return this.fetcher.request<OperationResponse<"save_self_mint_drop_item">>(
      "POST",
      `/api/v2/drops/${segment(slug)}/items`,
      body,
    )
  }

  updateSelfMintDropItem(
    slug: string,
    tokenId: string | number,
    body: WalletAuthRequest<"update_self_mint_drop_item">,
  ) {
    return this.fetcher.request<
      OperationResponse<"update_self_mint_drop_item">
    >("PUT", `/api/v2/drops/${segment(slug)}/items/${segment(tokenId)}`, body)
  }

  updateDropItem(
    slug: string,
    tokenId: string | number,
    body: WalletAuthRequest<"update_drop_item">,
  ) {
    return this.fetcher.request<OperationResponse<"update_drop_item">>(
      "PATCH",
      `/api/v2/drops/${segment(slug)}/items/${segment(tokenId)}`,
      body,
    )
  }

  createDropItemMediaUpload(
    slug: string,
    body: WalletAuthRequest<"upload_drop_item_media">,
  ) {
    return this.fetcher.request<OperationResponse<"upload_drop_item_media">>(
      "POST",
      `/api/v2/drops/${segment(slug)}/items/media`,
      body,
      undefined,
      { camelizeResponse: false },
    )
  }

  saveDropItemMedia(
    slug: string,
    body: WalletAuthRequest<"save_drop_item_media">,
  ) {
    return this.fetcher.request<OperationResponse<"save_drop_item_media">>(
      "POST",
      `/api/v2/drops/${segment(slug)}/items/media/save`,
      body,
    )
  }

  createDropAllowlistUpload(slug: string) {
    return this.fetcher.request<OperationResponse<"upload_drop_allowlist">>(
      "POST",
      `/api/v2/drops/${segment(slug)}/allowlist`,
      undefined,
      undefined,
      { camelizeResponse: false },
    )
  }

  validateDropAllowlist(
    slug: string,
    body: WalletAuthRequest<"validate_drop_allowlist">,
  ) {
    return this.fetcher.request<OperationResponse<"validate_drop_allowlist">>(
      "POST",
      `/api/v2/drops/${segment(slug)}/allowlist/validate`,
      body,
    )
  }

  modifyCollection(slug: string, body: WalletAuthRequest<"modify_collection">) {
    return this.fetcher.request<OperationResponse<"modify_collection">>(
      "PATCH",
      `/api/v2/collections/${segment(slug)}`,
      body,
    )
  }

  updateCollectionMetadata(
    slug: string,
    body: WalletAuthRequest<"update_collection_metadata">,
  ) {
    return this.fetcher.request<
      OperationResponse<"update_collection_metadata">
    >("PATCH", `/api/v2/collections/${segment(slug)}/metadata`, body)
  }

  setCollectionVisibility(
    slug: string,
    body: WalletAuthRequest<"set_collection_visibility">,
  ) {
    return this.fetcher.request<OperationResponse<"set_collection_visibility">>(
      "PATCH",
      `/api/v2/collections/${segment(slug)}/visibility`,
      body,
    )
  }

  createCollectionImageUpload(
    slug: string,
    imageType: string,
    contentType: WalletAuthQuery<"upload_collection_image">["contentType"],
  ) {
    const query = new URLSearchParams({ content_type: contentType })
    return this.fetcher.request<OperationResponse<"upload_collection_image">>(
      "POST",
      `/api/v2/collections/${segment(slug)}/images/${segment(imageType)}?${query}`,
      undefined,
      undefined,
      { camelizeResponse: false },
    )
  }

  /**
   * `UpdateProfileSettingsRequest` is camelCase on the wire (`displayName`,
   * `externalUrl`, `profileImageToken`, `bannerImageToken`), so the body is sent
   * verbatim. Snake-casing it silently drops every field except `bio`, which
   * survives only because it is a single word — the request still returns 200,
   * so the loss is invisible to the caller.
   */
  updateProfileSettings(body: WalletAuthRequest<"update_profile_settings">) {
    return this.fetcher.request<OperationResponse<"update_profile_settings">>(
      "PATCH",
      "/api/v2/profile",
      body,
      undefined,
      { snakeizeBody: false },
    )
  }

  claimProfileUsername(body: WalletAuthRequest<"claim_profile_username">) {
    return this.fetcher.request<OperationResponse<"claim_profile_username">>(
      "POST",
      "/api/v2/profile/username",
      body,
    )
  }

  /**
   * `UploadProfileImageRequest` is camelCase on the wire (`imageType`,
   * `contentType`) and both are required, so snake-casing the body made this
   * call fail validation every time. Sent verbatim.
   */
  createProfileImageUpload(body: WalletAuthRequest<"upload_profile_image">) {
    return this.fetcher.request<OperationResponse<"upload_profile_image">>(
      "POST",
      "/api/v2/profile/images",
      body,
      undefined,
      { snakeizeBody: false, camelizeResponse: false },
    )
  }

  /**
   * `SetNftPfpRequest` is camelCase on the wire (`contractAddress`, `tokenId`,
   * `collectionSlug`) and the first two are required, so snake-casing the body
   * made this call fail validation every time. Sent verbatim.
   */
  setProfileNftPfp(body: WalletAuthRequest<"set_profile_nft_pfp">) {
    return this.fetcher.request<OperationResponse<"set_profile_nft_pfp">>(
      "POST",
      "/api/v2/profile/nft-pfp",
      body,
      undefined,
      { snakeizeBody: false },
    )
  }

  clearProfileNftPfp() {
    return this.fetcher.request<OperationResponse<"clear_profile_nft_pfp">>(
      "DELETE",
      "/api/v2/profile/nft-pfp",
    )
  }

  createProfileShelf(body: WalletAuthRequest<"create_profile_shelf">) {
    return this.fetcher.request<OperationResponse<"create_profile_shelf">>(
      "POST",
      "/api/v2/profile/shelves",
      body,
    )
  }

  reorderProfileShelves(body: WalletAuthRequest<"reorder_profile_shelves">) {
    return this.fetcher.request<OperationResponse<"reorder_profile_shelves">>(
      "PATCH",
      "/api/v2/profile/shelves",
      body,
    )
  }

  updateProfileShelf(
    shelfId: string,
    body: WalletAuthRequest<"update_profile_shelf">,
  ) {
    return this.fetcher.request<OperationResponse<"update_profile_shelf">>(
      "PATCH",
      `/api/v2/profile/shelves/${segment(shelfId)}`,
      body,
    )
  }

  deleteProfileShelf(shelfId: string) {
    return this.fetcher.request<OperationResponse<"delete_profile_shelf">>(
      "DELETE",
      `/api/v2/profile/shelves/${segment(shelfId)}`,
    )
  }

  /**
   * `LinkWalletSiwxRequest` is camelCase on the wire. `chainArch` is required, so
   * snake-casing it made every call fail validation, and the nested SIWX `message`
   * keeps camelCase keys the server uses to rebuild the message the wallet signed.
   * Sent verbatim, matching the raw fetch in `auth/siwx.ts` that posts the same
   * operation.
   */
  linkWallet(body: WalletAuthRequest<"link_wallet_with_siwx">) {
    return this.fetcher.request<OperationResponse<"link_wallet_with_siwx">>(
      "POST",
      "/api/v2/accounts/wallets/siwx",
      body,
      undefined,
      { snakeizeBody: false },
    )
  }

  unlinkWallet(wallet: string) {
    return this.fetcher.request<OperationResponse<"unlink_wallet">>(
      "DELETE",
      `/api/v2/accounts/wallets/${segment(wallet)}`,
    )
  }

  makeWalletPrivate(wallet: string) {
    return this.fetcher.request<OperationResponse<"make_wallet_private">>(
      "PUT",
      `/api/v2/accounts/wallets/${segment(wallet)}/private`,
    )
  }

  makeWalletPublic(wallet: string) {
    return this.fetcher.request<OperationResponse<"make_wallet_public">>(
      "DELETE",
      `/api/v2/accounts/wallets/${segment(wallet)}/private`,
    )
  }

  // ── Agent accounts ────────────────────────────────────────────────
  //
  // An agent is an account, not a flag on a wallet, and ownership is a
  // relationship between two accounts that both sides confirm. It is a
  // declaration, not an authorization: naming an account as your agent
  // grants it nothing. It is self-reported and OpenSea does not verify it.
  //
  // The five writes below need `write:wallets`. `listOwnAgentRelationships`
  // needs `read:wallets`. A client driving the whole handshake needs both, or
  // the list call fails with "Insufficient permissions".

  /**
   * Declare the authenticated account an agent. Requires `write:wallets`.
   *
   * Independent of ownership: an agent nobody owns is valid. `changed` is
   * false when the account was already an agent, so a retry is
   * distinguishable from a real change.
   */
  declareAgentAccount() {
    return this.fetcher.request<OperationResponse<"declare_agent_account">>(
      "PUT",
      "/api/v2/accounts/agent",
    )
  }

  /**
   * Withdraw the authenticated account's agent declaration. Requires
   * `write:wallets`.
   */
  withdrawAgentAccountDeclaration() {
    return this.fetcher.request<
      OperationResponse<"withdraw_agent_account_declaration">
    >("DELETE", "/api/v2/accounts/agent")
  }

  /**
   * Propose an agent ownership relationship. Requires `write:wallets`.
   *
   * `callerRole` says which side the caller is on: `AGENT` means "I am an
   * agent and the counterparty owns me". The caller's own account is never in
   * the body; it comes from the bearer token.
   *
   * Proposing a relationship that is already awaiting you confirms it, so a
   * client that cannot tell who moved first can just propose.
   */
  proposeAgentRelationship(
    body: WalletAuthRequest<"propose_agent_relationship">,
  ) {
    return this.fetcher.request<
      OperationResponse<"propose_agent_relationship">
    >("POST", "/api/v2/accounts/agent-relationships", body)
  }

  /**
   * Confirm a relationship proposed to the authenticated account. Requires
   * `write:wallets`. An agent ends up with at most one confirmed owner.
   */
  confirmAgentRelationship(
    body: WalletAuthRequest<"confirm_agent_relationship">,
  ) {
    return this.fetcher.request<
      OperationResponse<"confirm_agent_relationship">
    >("POST", "/api/v2/accounts/agent-relationships/confirm", body)
  }

  /**
   * Withdraw a proposal or revoke a confirmed relationship. Requires
   * `write:wallets`. Either side may do this at any point, and it deletes the
   * relationship rather than marking it inactive.
   *
   * `removed` is false when no such relationship existed, which covers both a
   * counterparty you never proposed to and someone else's relationship.
   *
   * Sent as query parameters rather than a body on purpose: fetch, OkHttp and
   * urllib all drop DELETE bodies by default, and proxies may strip them.
   */
  revokeAgentRelationship(query: WalletAuthQuery<"revoke_agent_relationship">) {
    const params = new URLSearchParams({
      counterparty_address: query.counterpartyAddress,
      caller_role: query.callerRole,
    })
    return this.fetcher.request<OperationResponse<"revoke_agent_relationship">>(
      "DELETE",
      `/api/v2/accounts/agent-relationships?${params}`,
    )
  }

  /**
   * List the authenticated account's own relationships. Requires
   * `read:wallets`, not `write:wallets`.
   *
   * Includes proposals still awaiting either side. Pending relationships show
   * up here only; a public profile shows confirmed ones alone.
   */
  listOwnAgentRelationships() {
    return this.fetcher.get<OperationResponse<"list_own_agent_relationships">>(
      "/api/v2/accounts/agent-relationships",
    )
  }
}
