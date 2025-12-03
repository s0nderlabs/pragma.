/**
 * Seaport ABI Encoder
 *
 * Encodes Seaport fulfillment calls using viem's encodeFunctionData.
 * Used to transform OpenSea API responses into executable calldata.
 */

import { encodeFunctionData, type Hex, type Address } from "viem";

// ============================================================================
// Seaport ABI (minimal - only fulfillment functions)
// ============================================================================

/**
 * Minimal Seaport ABI for fulfillment functions
 * @see https://docs.opensea.io/docs/seaport-interface
 */
export const SEAPORT_ABI = [
  {
    name: "fulfillAdvancedOrder",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "advancedOrder",
        type: "tuple",
        components: [
          {
            name: "parameters",
            type: "tuple",
            components: [
              { name: "offerer", type: "address" },
              { name: "zone", type: "address" },
              {
                name: "offer",
                type: "tuple[]",
                components: [
                  { name: "itemType", type: "uint8" },
                  { name: "token", type: "address" },
                  { name: "identifierOrCriteria", type: "uint256" },
                  { name: "startAmount", type: "uint256" },
                  { name: "endAmount", type: "uint256" },
                ],
              },
              {
                name: "consideration",
                type: "tuple[]",
                components: [
                  { name: "itemType", type: "uint8" },
                  { name: "token", type: "address" },
                  { name: "identifierOrCriteria", type: "uint256" },
                  { name: "startAmount", type: "uint256" },
                  { name: "endAmount", type: "uint256" },
                  { name: "recipient", type: "address" },
                ],
              },
              { name: "orderType", type: "uint8" },
              { name: "startTime", type: "uint256" },
              { name: "endTime", type: "uint256" },
              { name: "zoneHash", type: "bytes32" },
              { name: "salt", type: "uint256" },
              { name: "conduitKey", type: "bytes32" },
              { name: "totalOriginalConsiderationItems", type: "uint256" },
            ],
          },
          { name: "numerator", type: "uint120" },
          { name: "denominator", type: "uint120" },
          { name: "signature", type: "bytes" },
          { name: "extraData", type: "bytes" },
        ],
      },
      {
        name: "criteriaResolvers",
        type: "tuple[]",
        components: [
          { name: "orderIndex", type: "uint256" },
          { name: "side", type: "uint8" },
          { name: "index", type: "uint256" },
          { name: "identifier", type: "uint256" },
          { name: "criteriaProof", type: "bytes32[]" },
        ],
      },
      { name: "fulfillerConduitKey", type: "bytes32" },
      { name: "recipient", type: "address" },
    ],
    outputs: [{ name: "fulfilled", type: "bool" }],
  },
  {
    name: "fulfillBasicOrder",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "parameters",
        type: "tuple",
        components: [
          { name: "considerationToken", type: "address" },
          { name: "considerationIdentifier", type: "uint256" },
          { name: "considerationAmount", type: "uint256" },
          { name: "offerer", type: "address" },
          { name: "zone", type: "address" },
          { name: "offerToken", type: "address" },
          { name: "offerIdentifier", type: "uint256" },
          { name: "offerAmount", type: "uint256" },
          { name: "basicOrderType", type: "uint8" },
          { name: "startTime", type: "uint256" },
          { name: "endTime", type: "uint256" },
          { name: "zoneHash", type: "bytes32" },
          { name: "salt", type: "uint256" },
          { name: "offererConduitKey", type: "bytes32" },
          { name: "fulfillerConduitKey", type: "bytes32" },
          { name: "totalOriginalAdditionalRecipients", type: "uint256" },
          {
            name: "additionalRecipients",
            type: "tuple[]",
            components: [
              { name: "amount", type: "uint256" },
              { name: "recipient", type: "address" },
            ],
          },
          { name: "signature", type: "bytes" },
        ],
      },
    ],
    outputs: [{ name: "fulfilled", type: "bool" }],
  },
  // fulfillBasicOrder_efficient variants (optimized gas)
  {
    name: "fulfillBasicOrder_efficient_6GL6yc",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "parameters",
        type: "tuple",
        components: [
          { name: "considerationToken", type: "address" },
          { name: "considerationIdentifier", type: "uint256" },
          { name: "considerationAmount", type: "uint256" },
          { name: "offerer", type: "address" },
          { name: "zone", type: "address" },
          { name: "offerToken", type: "address" },
          { name: "offerIdentifier", type: "uint256" },
          { name: "offerAmount", type: "uint256" },
          { name: "basicOrderType", type: "uint8" },
          { name: "startTime", type: "uint256" },
          { name: "endTime", type: "uint256" },
          { name: "zoneHash", type: "bytes32" },
          { name: "salt", type: "uint256" },
          { name: "offererConduitKey", type: "bytes32" },
          { name: "fulfillerConduitKey", type: "bytes32" },
          { name: "totalOriginalAdditionalRecipients", type: "uint256" },
          {
            name: "additionalRecipients",
            type: "tuple[]",
            components: [
              { name: "amount", type: "uint256" },
              { name: "recipient", type: "address" },
            ],
          },
          { name: "signature", type: "bytes" },
        ],
      },
    ],
    outputs: [{ name: "fulfilled", type: "bool" }],
  },
] as const;

// ============================================================================
// Types
// ============================================================================

/** OpenSea fulfillment transaction input_data structure */
export interface OpenSeaInputData {
  advancedOrder?: {
    parameters: {
      offerer: string;
      zone: string;
      offer: Array<{
        itemType: number;
        token: string;
        identifierOrCriteria: string;
        startAmount: string;
        endAmount: string;
      }>;
      consideration: Array<{
        itemType: number;
        token: string;
        identifierOrCriteria: string;
        startAmount: string;
        endAmount: string;
        recipient: string;
      }>;
      orderType: number;
      startTime: string | number;
      endTime: string | number;
      zoneHash: string;
      salt: string | number;
      conduitKey: string;
      totalOriginalConsiderationItems: number;
    };
    numerator: number;
    denominator: number;
    signature: string;
    extraData: string;
  };
  criteriaResolvers?: Array<{
    orderIndex: number;
    side: number;
    index: number;
    identifier: number | string;
    criteriaProof: string[];
  }>;
  fulfillerConduitKey?: string;
  recipient?: {
    value: string;
  };
  // For basic orders
  parameters?: any;
}

/** OpenSea fulfillment transaction structure */
export interface OpenSeaTransaction {
  function: string;
  chain: number;
  to: string;
  value: string;
  input_data: OpenSeaInputData;
}

// ============================================================================
// Encoder Functions
// ============================================================================

/**
 * Encode OpenSea fulfillment data into calldata
 *
 * @param transaction - OpenSea fulfillment transaction data
 * @returns Encoded calldata hex string
 */
export function encodeSeaportFulfillment(transaction: OpenSeaTransaction): Hex {
  const { function: fnName, input_data } = transaction;

  // Handle fulfillAdvancedOrder
  if (fnName === "fulfillAdvancedOrder" && input_data.advancedOrder) {
    return encodeFulfillAdvancedOrder(input_data);
  }

  // Handle fulfillBasicOrder variants
  if (fnName.startsWith("fulfillBasicOrder") && input_data.parameters) {
    return encodeFulfillBasicOrder(fnName, input_data.parameters);
  }

  throw new Error(`Unsupported Seaport function: ${fnName}`);
}

/**
 * Encode fulfillAdvancedOrder call
 */
function encodeFulfillAdvancedOrder(inputData: OpenSeaInputData): Hex {
  const { advancedOrder, criteriaResolvers, fulfillerConduitKey, recipient } = inputData;

  if (!advancedOrder) {
    throw new Error("advancedOrder is required for fulfillAdvancedOrder");
  }

  // Transform advancedOrder to match ABI types
  const transformedOrder = {
    parameters: {
      offerer: advancedOrder.parameters.offerer as Address,
      zone: advancedOrder.parameters.zone as Address,
      offer: advancedOrder.parameters.offer.map((item) => ({
        itemType: item.itemType,
        token: item.token as Address,
        identifierOrCriteria: BigInt(item.identifierOrCriteria),
        startAmount: BigInt(item.startAmount),
        endAmount: BigInt(item.endAmount),
      })),
      consideration: advancedOrder.parameters.consideration.map((item) => ({
        itemType: item.itemType,
        token: item.token as Address,
        identifierOrCriteria: BigInt(item.identifierOrCriteria),
        startAmount: BigInt(item.startAmount),
        endAmount: BigInt(item.endAmount),
        recipient: item.recipient as Address,
      })),
      orderType: advancedOrder.parameters.orderType,
      startTime: BigInt(advancedOrder.parameters.startTime),
      endTime: BigInt(advancedOrder.parameters.endTime),
      zoneHash: advancedOrder.parameters.zoneHash as Hex,
      salt: BigInt(advancedOrder.parameters.salt),
      conduitKey: advancedOrder.parameters.conduitKey as Hex,
      totalOriginalConsiderationItems: BigInt(advancedOrder.parameters.totalOriginalConsiderationItems),
    },
    numerator: BigInt(advancedOrder.numerator),
    denominator: BigInt(advancedOrder.denominator),
    signature: advancedOrder.signature as Hex,
    extraData: (advancedOrder.extraData || "0x") as Hex,
  };

  // Transform criteriaResolvers
  const transformedResolvers = (criteriaResolvers || []).map((resolver) => ({
    orderIndex: BigInt(resolver.orderIndex),
    side: resolver.side,
    index: BigInt(resolver.index),
    identifier: BigInt(resolver.identifier),
    criteriaProof: resolver.criteriaProof as Hex[],
  }));

  // Get recipient address
  const recipientAddress = (recipient?.value || "0x0000000000000000000000000000000000000000") as Address;

  // Get conduit key
  const conduitKey = (fulfillerConduitKey || "0x0000000000000000000000000000000000000000000000000000000000000000") as Hex;

  return encodeFunctionData({
    abi: SEAPORT_ABI,
    functionName: "fulfillAdvancedOrder",
    args: [transformedOrder, transformedResolvers, conduitKey, recipientAddress],
  });
}

/**
 * Encode fulfillBasicOrder call (including efficient variants)
 */
function encodeFulfillBasicOrder(fnName: string, parameters: any): Hex {
  // Transform parameters to match ABI types
  const transformedParams = {
    considerationToken: parameters.considerationToken as Address,
    considerationIdentifier: BigInt(parameters.considerationIdentifier || 0),
    considerationAmount: BigInt(parameters.considerationAmount),
    offerer: parameters.offerer as Address,
    zone: parameters.zone as Address,
    offerToken: parameters.offerToken as Address,
    offerIdentifier: BigInt(parameters.offerIdentifier || 0),
    offerAmount: BigInt(parameters.offerAmount),
    basicOrderType: parameters.basicOrderType,
    startTime: BigInt(parameters.startTime),
    endTime: BigInt(parameters.endTime),
    zoneHash: parameters.zoneHash as Hex,
    salt: BigInt(parameters.salt),
    offererConduitKey: parameters.offererConduitKey as Hex,
    fulfillerConduitKey: parameters.fulfillerConduitKey as Hex,
    totalOriginalAdditionalRecipients: BigInt(parameters.totalOriginalAdditionalRecipients || 0),
    additionalRecipients: (parameters.additionalRecipients || []).map((r: any) => ({
      amount: BigInt(r.amount),
      recipient: r.recipient as Address,
    })),
    signature: parameters.signature as Hex,
  };

  // Use the appropriate function name (handles efficient variants)
  const functionName = fnName === "fulfillBasicOrder_efficient_6GL6yc"
    ? "fulfillBasicOrder_efficient_6GL6yc"
    : "fulfillBasicOrder";

  return encodeFunctionData({
    abi: SEAPORT_ABI,
    functionName: functionName as any,
    args: [transformedParams],
  });
}

/**
 * Transform OpenSea fulfillment response to executable transaction data
 *
 * @param fulfillmentData - OpenSea fulfillment_data response
 * @returns Transaction-ready calldata and value
 */
export function transformFulfillmentResponse(fulfillmentData: {
  transaction: OpenSeaTransaction;
}): { calldata: Hex; value: string } {
  const { transaction } = fulfillmentData;

  const calldata = encodeSeaportFulfillment(transaction);
  const value = transaction.value;

  return { calldata, value };
}
