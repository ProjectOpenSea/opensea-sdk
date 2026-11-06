import type { SignalResponse, SignalsResponse } from "@opensea/api-types"
import { getSignalPath, getSignalsPath } from "./apiPaths"
import type { Fetcher } from "./fetcher"
import type {
  GetSignalResponse,
  ListSignalsArgs,
  ListSignalsResponse,
} from "./types"

/**
 * Public OpenSea signals. Reads need only the API key. Creating and deleting a signal needs a
 * bearer token with the `write:posts` scope, so those live on `api.walletAuth` (`createSignal`,
 * `deleteSignal`).
 */
export class SignalsAPI {
  constructor(private fetcher: Fetcher) {}

  /**
   * Get one public signal. `signalId` is the opaque `sig_v1_...` reference the API returned; pass
   * it unchanged. Removed, private and pending signals return 404.
   */
  async getSignal(signalId: string): Promise<GetSignalResponse> {
    return this.fetcher.get<SignalResponse>(getSignalPath(signalId))
  }

  /**
   * List public signals about one subject, newest first. A page can be empty while `next` is
   * set, so keep passing `next` back as `cursor` until it is null.
   */
  async listSignals(args: ListSignalsArgs): Promise<ListSignalsResponse> {
    return this.fetcher.get<SignalsResponse>(getSignalsPath(), args)
  }
}
