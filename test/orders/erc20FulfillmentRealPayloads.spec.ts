import { describe, expect, test } from "vitest"
import {
  getErc20Payment,
  getFulfillerConduitKey,
} from "../../src/orders/erc20Fulfillment"
import { camelizeKeysDeep } from "../../src/utils/case"
import {
  payloadNamed,
  preflightInput,
  REAL_PAYLOADS,
} from "./erc20FulfillmentFixtures"

/**
 * The ERC20 preflight against captured `POST /api/v2/listings/fulfillment_data`
 * responses.
 *
 * opensea-sdk#1997 and monorepo #638 were both reported by a member of the
 * public: the preflight looked for `basicOrderParameters` while the API sends
 * `inputData.parameters`, and the hand-written unit fixture used the same wrong
 * name. Code and tests agreed with each other and disagreed with the wire, so
 * the guard was inert in production for months while its suite stayed green.
 *
 * These four fixtures are response bodies verbatim, covering both call shapes
 * the endpoint returns for a single listing (`fulfillBasicOrder_efficient_6GL6yc`
 * and `fulfillAdvancedOrder`) in both an ERC20-priced and a native-priced form.
 * Each one is run through `camelizeKeysDeep` first, which is the transform the
 * fetcher applies before the SDK touches the response, so the path under test
 * starts at the bytes the API sent.
 *
 * The expected total comes from the listing price reported by a different
 * endpoint, `GET /api/v2/orders/chain/{chain}/protocol/{addr}/{hash}`, recorded
 * in each fixture's `_capture.listing_price`. Asserting against a number
 * re-derived from the same struct the preflight parses would prove nothing.
 */
describe("getErc20Payment: captured fulfillment_data responses", () => {
  for (const {
    name,
    fixture,
    expectedToken,
    expectedCurrency,
  } of REAL_PAYLOADS) {
    const price = fixture._capture.listing_price.current

    test(`${name}: the price oracle and the fixture agree on the currency`, () => {
      // Pins the premise of the payment assertion below: if the fixture is ever
      // recaptured against a differently priced listing, this fails first and
      // says so, rather than the payment test failing for an opaque reason.
      expect(price.currency).toBe(expectedCurrency)
      expect(price.value).toMatch(/^\d+$/)
    })

    test(`${name}: reads the payment the listing price says is owed`, () => {
      const payment = getErc20Payment(preflightInput(fixture))

      if (expectedToken === null) {
        // Native-priced: Seaport is paid with transaction.value, so there is no
        // allowance to check and the preflight must skip.
        expect(payment).toBe(null)
        expect(fixture.response.fulfillment_data.transaction.value).toBe(
          price.value,
        )
      } else {
        expect(payment).toEqual({
          token: expectedToken,
          amount: BigInt(price.value),
        })
        // The mirror image: an ERC20-priced fill sends no native value, which
        // is why an unapproved spender reverts with a bare "execution reverted".
        expect(fixture.response.fulfillment_data.transaction.value).toBe("0")
      }
    })

    test(`${name}: reads the fulfiller conduit key`, () => {
      // Whichever shape the response uses, the key decides who the buyer has to
      // have approved. Missing it resolves the spender to Seaport for an order
      // the buyer approved the conduit for, reporting a working purchase as
      // unapproved.
      const conduitKey = getFulfillerConduitKey(preflightInput(fixture))
      expect(
        conduitKey,
        `${name}: no fulfiller conduit key found in the captured response, ` +
          "so the preflight would resolve the spender to Seaport",
      ).toBeTypeOf("string")
      expect(conduitKey).toMatch(/^0x[0-9a-f]{64}$/)
    })
  }

  test("the captured set covers each call shape in both pricings", () => {
    const shapes = REAL_PAYLOADS.map(
      ({ fixture, expectedToken }) =>
        `${fixture.response.fulfillment_data.transaction.function.split("(")[0]}:${
          expectedToken === null ? "native" : "erc20"
        }`,
    ).sort()

    expect(shapes).toEqual([
      "fulfillAdvancedOrder:erc20",
      "fulfillAdvancedOrder:native",
      "fulfillBasicOrder_efficient_6GL6yc:erc20",
      "fulfillBasicOrder_efficient_6GL6yc:native",
    ])
  })

  test("camelizing the response leaves the Seaport struct keys alone", () => {
    // The fetcher camelizes every response. The Seaport structs inside
    // `input_data` are already camelCase, so the transform has to be a no-op
    // there: the SDK re-ABI-encodes the call from exactly these keys.
    for (const { name, fixture } of REAL_PAYLOADS) {
      const raw = fixture.response.fulfillment_data.transaction.input_data
      const camelized = preflightInput(fixture) as Record<string, unknown>
      expect(Object.keys(camelized).sort(), name).toEqual(
        Object.keys(raw).sort(),
      )
      expect(camelized, name).toEqual(raw)
    }
  })
})

describe("getErc20Payment: shapes derived from a captured response", () => {
  const basicErc20 = payloadNamed("basic-order-erc20")
  const realBasicInput = preflightInput(basicErc20.fixture) as Record<
    string,
    unknown
  >
  const expected = {
    token: basicErc20.expectedToken as string,
    amount: BigInt(basicErc20.fixture._capture.listing_price.current.value),
  }

  const item = (start: string, end = start) => ({
    itemType: 1,
    token: "0x1234567890123456789012345678901234567890",
    identifierOrCriteria: "0",
    startAmount: start,
    endAmount: end,
    recipient: "0xfba662e1a8e91a350702cf3b87d0c2d2fb4ba57f",
  })

  test("an OrderComponents-shaped `parameters` is not a basic order", () => {
    // No basicOrderType, so this must not be mistaken for the flattened struct.
    expect(
      getErc20Payment({
        parameters: { offer: [], consideration: [item("5")] },
      }),
    ).toBe(null)
  })

  test("a top-level `parameters` does not shadow a standard order", () => {
    expect(
      getErc20Payment({
        order: { parameters: { consideration: [item("100")] } },
      }),
    ).toEqual({
      token: "0x1234567890123456789012345678901234567890",
      amount: 100n,
    })
  })

  test("a basic-order struct wins when an `order` key is also present", () => {
    // Pins precedence: the flattened struct is the authoritative shape for a
    // basic order, so it is read and `order` is ignored rather than both being
    // summed or the standard path silently winning.
    expect(
      getErc20Payment({
        ...realBasicInput,
        order: { parameters: { consideration: [item("100")] } },
      }),
    ).toEqual(expected)
  })

  test("the tolerated `basicOrderParameters` alias reads the same struct", () => {
    // The name the API does not send. Kept working for a caller passing the
    // pre-#638 shape, and pinned here so the alias cannot quietly become the
    // only name the preflight understands again.
    expect(
      getErc20Payment({ basicOrderParameters: realBasicInput.parameters }),
    ).toEqual(expected)
  })

  test("a flat price stated as equal start and end amounts is still summed", () => {
    // The interpolation guard must accept a flat item that spells both fields
    // out, which is what every captured response does.
    expect(
      getErc20Payment({
        order: { parameters: { consideration: [item("500", "500")] } },
      }),
    ).toEqual({
      token: "0x1234567890123456789012345678901234567890",
      amount: 500n,
    })
  })
})

describe("getErc20Payment: time-interpolated prices", () => {
  const declining = {
    itemType: 1,
    token: "0x1234567890123456789012345678901234567890",
    identifierOrCriteria: "0",
    startAmount: "500000000",
    endAmount: "150000000",
    recipient: "0xfba662e1a8e91a350702cf3b87d0c2d2fb4ba57f",
  }

  test("skips a declining-price listing rather than charging the opening price", () => {
    // Seaport interpolates by time, so startAmount is only an upper bound. A
    // buyer holding enough for the current price must not be turned away.
    expect(
      getErc20Payment({
        order: { parameters: { consideration: [declining] } },
      }),
    ).toBe(null)
  })

  test("skips an ascending-price item too", () => {
    expect(
      getErc20Payment({
        order: {
          parameters: {
            consideration: [
              {
                ...declining,
                startAmount: "150000000",
                endAmount: "500000000",
              },
            ],
          },
        },
      }),
    ).toBe(null)
  })
})

describe("captured fixtures", () => {
  test("record the request that produced them", () => {
    // A fixture nobody can re-capture is a fixture nobody can check, which is
    // how a hand-written shape survives review.
    for (const { name, fixture } of REAL_PAYLOADS) {
      const capture = fixture._capture
      expect(capture.request.method, name).toBe("POST")
      expect(capture.request.path, name).toBe(
        "/api/v2/listings/fulfillment_data",
      )
      expect(capture.order_hash, name).toMatch(/^0x[0-9a-f]{64}$/)
      expect(capture.chain, name).toBeTruthy()
    }
  })

  test("camelizeKeysDeep is the transform the fetcher applies", () => {
    // Guards the premise of preflightInput: if the response envelope stops
    // being camelized, these suites would be testing a path production does
    // not take.
    expect(
      camelizeKeysDeep({
        fulfillment_data: { transaction: { input_data: 1 } },
      }),
    ).toEqual({ fulfillmentData: { transaction: { inputData: 1 } } })
  })
})
