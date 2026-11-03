import type {
  OperationQueryParams,
  OperationRequestBody,
  OperationResponse,
  operations,
} from "@opensea/api-types"
import { type Camelize, snakeizeKeysDeep } from "../utils/case"
import { segment } from "./apiPaths"
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

  /**
   * The drop's saved items, including a draft's, one page at a time. Only the
   * collection owner or an authorized editor can list them.
   */
  listDropItems(slug: string, query?: WalletAuthQuery<"list_drop_items">) {
    return this.fetcher.get<OperationResponse<"list_drop_items">>(
      `/api/v2/drops/${segment(slug)}/items`,
      query,
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

  /**
   * `UploadContext.fields` is an opaque signed multipart field map that the
   * caller must submit unchanged, so the response is not camelized. Otherwise a
   * legitimate field name such as S3's `success_action_status` comes back as
   * `successActionStatus` and the form no longer matches the signed policy.
   *
   * To save the items in bulk, generate one UUID for the set of files, pass it
   * as `uploadBatchId` on every request (each takes up to 50 filenames), then
   * save them by filename with `saveDropItemMediaBatch`.
   */
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

  /**
   * @deprecated Use `saveDropItemMediaBatch`, which saves the same items by
   * `uploadBatchId` and filename. This save sends every media token back and
   * the API checks each file separately, so it slows down with drop size.
   */
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

  /**
   * Save the drop's items from files uploaded with one `uploadBatchId` through
   * `createDropItemMediaUpload`, naming them by filename (up to 15,000). Each
   * save replaces the drop's items. A manifest from
   * `createDropCollectionManifestUpload` supplies token ids and metadata;
   * without one, items are numbered 1 to n in the order of `filenames`.
   */
  saveDropItemMediaBatch(
    slug: string,
    body: WalletAuthRequest<"save_drop_item_media_batch">,
  ) {
    return this.fetcher.request<
      OperationResponse<"save_drop_item_media_batch">
    >("POST", `/api/v2/drops/${segment(slug)}/items/media/save-batch`, body)
  }

  /**
   * `UploadContext.fields` is an opaque signed multipart field map that the
   * caller must submit unchanged, so the response is not camelized. Otherwise a
   * legitimate field name such as S3's `success_action_status` comes back as
   * `successActionStatus` and the form no longer matches the signed policy.
   */
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

  /**
   * `UploadContext.fields` is an opaque signed multipart field map that the
   * caller must submit unchanged, so the response is not camelized. Unlike the
   * other upload contexts, the returned token is not passed to a later call:
   * the next `saveDropItemMediaBatch` (or deprecated `saveDropItemMedia`)
   * reads the stored manifest.
   */
  createDropCollectionManifestUpload(slug: string) {
    return this.fetcher.request<
      OperationResponse<"upload_drop_collection_manifest">
    >(
      "POST",
      `/api/v2/drops/${segment(slug)}/items/manifest`,
      undefined,
      undefined,
      { camelizeResponse: false },
    )
  }

  /**
   * Build the transaction that publishes the drop's saved draft onchain. It
   * must be sent from the returned `from`, the contract's onchain owner; sent
   * from any other address it reverts.
   */
  buildDropPublishTransaction(slug: string) {
    return this.fetcher.request<
      OperationResponse<"build_drop_publish_transaction">
    >("POST", `/api/v2/drops/${segment(slug)}/publish`)
  }

  /** Same sender rule as `buildDropPublishTransaction`. */
  buildDropUnpublishTransaction(slug: string) {
    return this.fetcher.request<
      OperationResponse<"build_drop_unpublish_transaction">
    >("POST", `/api/v2/drops/${segment(slug)}/unpublish`)
  }

  /**
   * Start uploading the drop's item media and metadata to IPFS. Follow it with
   * `getDropMetadataIpfsProgress` using the returned `workflowExecutionId`.
   */
  uploadDropMetadataToIpfs(slug: string) {
    return this.fetcher.request<
      OperationResponse<"upload_drop_metadata_to_ipfs">
    >("POST", `/api/v2/drops/${segment(slug)}/metadata/ipfs`)
  }

  getDropMetadataIpfsProgress(slug: string, workflowExecutionId: string) {
    return this.fetcher.get<
      OperationResponse<"get_drop_metadata_ipfs_progress">
    >(
      `/api/v2/drops/${segment(slug)}/metadata/ipfs/${segment(workflowExecutionId)}`,
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

  /**
   * `UploadContext.fields` is an opaque signed multipart field map that the
   * caller must submit unchanged, so the response is not camelized. Otherwise a
   * legitimate field name such as S3's `success_action_status` comes back as
   * `successActionStatus` and the form no longer matches the signed policy.
   */
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
   * `placement` is one of hero_desktop, hero_mobile, about_preview,
   * about_section, overview, overview_background or team. The response is not
   * camelized, for the `UploadContext.fields` reason on
   * `createCollectionImageUpload`.
   */
  createCollectionPageMediaUpload(
    slug: string,
    placement: string,
    contentType: WalletAuthQuery<"upload_collection_page_media">["contentType"],
  ) {
    const query = new URLSearchParams({ content_type: contentType })
    return this.fetcher.request<
      OperationResponse<"upload_collection_page_media">
    >(
      "POST",
      `/api/v2/collections/${segment(slug)}/media/${segment(placement)}?${query}`,
      undefined,
      undefined,
      { camelizeResponse: false },
    )
  }

  getCollectionMetadata(slug: string) {
    return this.fetcher.get<OperationResponse<"get_collection_metadata">>(
      `/api/v2/collections/${segment(slug)}/metadata`,
    )
  }

  setCollectionPricingCurrency(
    slug: string,
    body: WalletAuthRequest<"set_collection_pricing_currency">,
  ) {
    return this.fetcher.request<
      OperationResponse<"set_collection_pricing_currency">
    >("POST", `/api/v2/collections/${segment(slug)}/pricing_currency`, body)
  }

  /**
   * Send the returned transactions in order from each one's `from`, the
   * contract's onchain owner. The list is empty when the contract is already
   * in the requested state.
   */
  buildCreatorFeeEnforcementTransactions(
    slug: string,
    body: WalletAuthRequest<"build_creator_fee_enforcement_transactions">,
  ) {
    return this.fetcher.request<
      OperationResponse<"build_creator_fee_enforcement_transactions">
    >(
      "POST",
      `/api/v2/collections/${segment(slug)}/creator_fee_enforcement`,
      body,
    )
  }

  refreshCollectionMetadata(slug: string) {
    return this.fetcher.request<
      OperationResponse<"refresh_collection_metadata">
    >("POST", `/api/v2/collections/${segment(slug)}/refresh`)
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
   * call fail validation every time. Sent verbatim. The response is not
   * camelized either, for the `UploadContext.fields` reason above.
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

  /**
   * Public read: an API key alone is enough, and the wallet token is sent only
   * when one is configured.
   */
  getProfileShelves(address: string) {
    return this.fetcher.get<OperationResponse<"get_profile_shelves">>(
      "/api/v2/profile/shelves",
      { address },
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
   * Issue a single-use nonce for linking a wallet to the authenticated account,
   * with the statement to sign. Build the SIWX message with both verbatim and
   * submit it to `linkWallet` within 10 minutes; the nonce only works for this
   * account.
   */
  getWalletLinkNonce() {
    return this.fetcher.request<OperationResponse<"get_wallet_link_nonce">>(
      "POST",
      "/api/v2/accounts/wallets/siwx/nonce",
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
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(snakeizeKeysDeep(query))) {
      if (value != null) params.set(key, String(value))
    }
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
