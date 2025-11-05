/**
 * aPriori aprMON Contract ABI
 *
 * Official ABI for aPriori liquid staking protocol on Monad.
 * Contract: 0xb2f82D0f38dc453D596Ad40A37799446Cc89274A (Monad Testnet)
 *
 * Features:
 * - ERC20 liquid staking token (aprMON)
 * - ERC4626 tokenized vault standard
 * - Two-step withdrawal with epoch-based delays
 * - Batch claiming support
 * - Comprehensive status API
 */

export const APRIORI_ADDRESS = "0xb2f82D0f38dc453D596Ad40A37799446Cc89274A" as const;

export const APRIORI_ABI = [
  { type: "constructor", inputs: [], stateMutability: "nonpayable" },
  { type: "receive", stateMutability: "payable" },
  {
    type: "function",
    name: "DOMAIN_SEPARATOR",
    inputs: [],
    outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "DUST_THRESHOLD",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "MAX_BASIS_POINTS",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "MAX_PERCENTAGE",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "MIN_SHARE_SUPPLY",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address", internalType: "address" },
      { name: "spender", type: "address", internalType: "address" }
    ],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address", internalType: "address" },
      { name: "value", type: "uint256", internalType: "uint256" }
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "asset",
    inputs: [],
    outputs: [{ name: "assetTokenAddress", type: "address", internalType: "address" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "burnableShares",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "claimAndRebalance",
    inputs: [
      { name: "_totalWithdrawalAmount", type: "uint256", internalType: "uint256" },
      { name: "_totalBurnableShares", type: "uint256", internalType: "uint256" },
      { name: "_nextRequestId", type: "uint256", internalType: "uint256" },
      { name: "_pendingDeposit", type: "uint256", internalType: "uint256" },
      { name: "_blockNumber", type: "uint256", internalType: "uint256" },
      { name: "_rebalanceNeeded", type: "bool", internalType: "bool" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  { type: "function", name: "claimProtocolFees", inputs: [], outputs: [], stateMutability: "nonpayable" },
  {
    type: "function",
    name: "claimRewards",
    inputs: [{ name: "validators", type: "uint64[]", internalType: "uint64[]" }],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "claimableRedeemRequest",
    inputs: [
      { name: "requestId", type: "uint256", internalType: "uint256" },
      { name: "controller", type: "address", internalType: "address" }
    ],
    outputs: [{ name: "shares", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "collectorManager",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "convertToAssets",
    inputs: [{ name: "shares", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "assets", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "convertToShares",
    inputs: [{ name: "assets", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "shares", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "currentWithdrawalBatchId",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  { type: "function", name: "decimals", inputs: [], outputs: [{ name: "", type: "uint8", internalType: "uint8" }], stateMutability: "view" },
  {
    type: "function",
    name: "deposit",
    inputs: [
      { name: "assets", type: "uint256", internalType: "uint256" },
      { name: "receiver", type: "address", internalType: "address" }
    ],
    outputs: [{ name: "shares", type: "uint256", internalType: "uint256" }],
    stateMutability: "payable"
  },
  {
    type: "function",
    name: "eip712Domain",
    inputs: [],
    outputs: [
      { name: "fields", type: "bytes1", internalType: "bytes1" },
      { name: "_name", type: "string", internalType: "string" },
      { name: "_version", type: "string", internalType: "string" },
      { name: "chainId", type: "uint256", internalType: "uint256" },
      { name: "verifyingContract", type: "address", internalType: "address" },
      { name: "salt", type: "bytes32", internalType: "bytes32" },
      { name: "extensions", type: "uint256[]", internalType: "uint256[]" }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "epochLength",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "feeVault",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getPendingWithdrawalAmounts",
    inputs: [{ name: "batchSize", type: "uint256", internalType: "uint256" }],
    outputs: [
      { name: "_totalWithdrawalAmount", type: "uint256", internalType: "uint256" },
      { name: "_totalBurnableShares", type: "uint256", internalType: "uint256" },
      { name: "_nextRequestId", type: "uint256", internalType: "uint256" },
      { name: "_pendingDeposit", type: "uint256", internalType: "uint256" },
      { name: "_blockNumber", type: "uint256", internalType: "uint256" }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getUserRequestData",
    inputs: [
      { name: "user", type: "address", internalType: "address" },
      { name: "startIndex", type: "uint256", internalType: "uint256" },
      { name: "pageSize", type: "uint256", internalType: "uint256" }
    ],
    outputs: [
      {
        name: "requestData",
        type: "tuple[]",
        internalType: "struct aprMON.RequestData[]",
        components: [
          { name: "id", type: "uint256", internalType: "uint256" },
          { name: "claimed", type: "bool", internalType: "bool" },
          { name: "claimable", type: "bool", internalType: "bool" },
          { name: "shares", type: "uint256", internalType: "uint256" },
          { name: "assets", type: "uint256", internalType: "uint256" },
          { name: "timestamp", type: "uint256", internalType: "uint256" },
          { name: "unlockEpoch", type: "uint64", internalType: "uint64" }
        ]
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getUserRequestDataCount",
    inputs: [{ name: "user", type: "address", internalType: "address" }],
    outputs: [{ name: "count", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "initialize",
    inputs: [
      { name: "_validatorsRegistry", type: "address", internalType: "address" },
      { name: "_collectorManager", type: "address", internalType: "address" },
      { name: "_stakePrecompile", type: "address", internalType: "address payable" },
      { name: "_feeVault", type: "address", internalType: "address" },
      { name: "_owner", type: "address", internalType: "address" },
      { name: "_minimumRedeem", type: "uint256", internalType: "uint256" },
      { name: "_withdrawalFee", type: "uint256", internalType: "uint256" },
      { name: "_rewardFee", type: "uint8", internalType: "uint8" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  { type: "function", name: "initializePermitV2", inputs: [], outputs: [], stateMutability: "nonpayable" },
  {
    type: "function",
    name: "isOperator",
    inputs: [
      { name: "controller", type: "address", internalType: "address" },
      { name: "operator", type: "address", internalType: "address" }
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "isSufficientBurnableShares",
    inputs: [],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "lastProcessedBlockNumber",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "lastProcessedRequestId",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "lastProcessedWithdrawalBatchId",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "latestUpdateBlockNumber",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "maxDeposit",
    inputs: [{ name: "receiver", type: "address", internalType: "address" }],
    outputs: [{ name: "maxAssets", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "maxMint",
    inputs: [{ name: "receiver", type: "address", internalType: "address" }],
    outputs: [{ name: "maxShares", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "maxRedeem",
    inputs: [{ name: "owner", type: "address", internalType: "address" }],
    outputs: [{ name: "maxShares", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "maxWithdraw",
    inputs: [{ name: "owner", type: "address", internalType: "address" }],
    outputs: [{ name: "maxAssets", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "migrationDeposit",
    inputs: [{ name: "assets", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "payable"
  },
  {
    type: "function",
    name: "minimumRedeem",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "mint",
    inputs: [
      { name: "shares", type: "uint256", internalType: "uint256" },
      { name: "receiver", type: "address", internalType: "address" }
    ],
    outputs: [{ name: "assets", type: "uint256", internalType: "uint256" }],
    stateMutability: "payable"
  },
  { type: "function", name: "name", inputs: [], outputs: [{ name: "", type: "string", internalType: "string" }], stateMutability: "view" },
  {
    type: "function",
    name: "nextRequestId",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "nonces",
    inputs: [{ name: "", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "oracleOperator",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view"
  },
  { type: "function", name: "owner", inputs: [], outputs: [{ name: "", type: "address", internalType: "address" }], stateMutability: "view" },
  { type: "function", name: "pause", inputs: [], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "paused", inputs: [], outputs: [{ name: "", type: "bool", internalType: "bool" }], stateMutability: "view" },
  {
    type: "function",
    name: "pendingRedeemRequest",
    inputs: [
      { name: "requestId", type: "uint256", internalType: "uint256" },
      { name: "controller", type: "address", internalType: "address" }
    ],
    outputs: [{ name: "shares", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "pendingWithdrawalValidators",
    inputs: [
      { name: "", type: "uint256", internalType: "uint256" },
      { name: "", type: "uint256", internalType: "uint256" }
    ],
    outputs: [{ name: "", type: "uint64", internalType: "uint64" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "permit",
    inputs: [
      { name: "owner", type: "address", internalType: "address" },
      { name: "spender", type: "address", internalType: "address" },
      { name: "value", type: "uint256", internalType: "uint256" },
      { name: "deadline", type: "uint256", internalType: "uint256" },
      { name: "v", type: "uint8", internalType: "uint8" },
      { name: "r", type: "bytes32", internalType: "bytes32" },
      { name: "s", type: "bytes32", internalType: "bytes32" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "precompilePendingWithdrawalIds",
    inputs: [
      { name: "", type: "uint256", internalType: "uint256" },
      { name: "", type: "uint64", internalType: "uint64" },
      { name: "", type: "uint256", internalType: "uint256" }
    ],
    outputs: [{ name: "", type: "uint8", internalType: "uint8" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "previewDeposit",
    inputs: [{ name: "assets", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "shares", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "previewMint",
    inputs: [{ name: "shares", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "assets", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "previewRedeem",
    inputs: [{ name: "shares", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "assets", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "previewWithdraw",
    inputs: [{ name: "assets", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "shares", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "rebalanceBatchId",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "rebalanceInProgress",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "redeem",
    inputs: [
      { name: "requestIDs", type: "uint256[]", internalType: "uint256[]" },
      { name: "receiver", type: "address", internalType: "address" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "redeem",
    inputs: [
      { name: "requestId", type: "uint256", internalType: "uint256" },
      { name: "receiver", type: "address", internalType: "address" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "redeemRequests",
    inputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    outputs: [
      { name: "shares", type: "uint256", internalType: "uint256" },
      { name: "controller", type: "address", internalType: "address" },
      { name: "assets", type: "uint256", internalType: "uint256" },
      { name: "claimed", type: "bool", internalType: "bool" },
      { name: "timestamp", type: "uint256", internalType: "uint256" }
    ],
    stateMutability: "view"
  },
  { type: "function", name: "renounceOwnership", inputs: [], outputs: [], stateMutability: "nonpayable" },
  {
    type: "function",
    name: "requestRedeem",
    inputs: [
      { name: "shares", type: "uint256", internalType: "uint256" },
      { name: "controller", type: "address", internalType: "address" },
      { name: "owner", type: "address", internalType: "address" }
    ],
    outputs: [{ name: "requestId", type: "uint256", internalType: "uint256" }],
    stateMutability: "nonpayable"
  },
  { type: "function", name: "rewardFee", inputs: [], outputs: [{ name: "", type: "uint8", internalType: "uint8" }], stateMutability: "view" },
  {
    type: "function",
    name: "rewardFeesAccumulated",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "rewardsDistributing",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "setEpochLength",
    inputs: [{ name: "_epochLength", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setFeeVault",
    inputs: [{ name: "_feeVault", type: "address", internalType: "address" }],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setMinimumRedeem",
    inputs: [{ name: "_minimumRedeem", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setOperator",
    inputs: [
      { name: "operator", type: "address", internalType: "address" },
      { name: "approved", type: "bool", internalType: "bool" }
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setOracleOperator",
    inputs: [{ name: "_oracleOperator", type: "address", internalType: "address" }],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setRewardFee",
    inputs: [{ name: "_rewardFee", type: "uint8", internalType: "uint8" }],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setStakePrecompile",
    inputs: [{ name: "_stakePrecompile", type: "address", internalType: "address payable" }],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setValidatorsRegistry",
    inputs: [{ name: "_validatorsRegistry", type: "address", internalType: "address" }],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setWithdrawalDelay",
    inputs: [{ name: "_withdrawalDelay", type: "uint64", internalType: "uint64" }],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setWithdrawalFee",
    inputs: [{ name: "_withdrawalFee", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "stakePrecompile",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address payable" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "sweep",
    inputs: [
      { name: "recipient", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  { type: "function", name: "symbol", inputs: [], outputs: [{ name: "", type: "string", internalType: "string" }], stateMutability: "view" },
  {
    type: "function",
    name: "totalAssets",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "totalPendingDeposit",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "totalStaked",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "totalSupply",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address", internalType: "address" },
      { name: "value", type: "uint256", internalType: "uint256" }
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "transferFrom",
    inputs: [
      { name: "from", type: "address", internalType: "address" },
      { name: "to", type: "address", internalType: "address" },
      { name: "value", type: "uint256", internalType: "uint256" }
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "transferOwnership",
    inputs: [{ name: "newOwner", type: "address", internalType: "address" }],
    outputs: [],
    stateMutability: "nonpayable"
  },
  { type: "function", name: "unpause", inputs: [], outputs: [], stateMutability: "nonpayable" },
  {
    type: "function",
    name: "updateOracleData",
    inputs: [
      { name: "_blockNumber", type: "uint256", internalType: "uint256" },
      { name: "_pendingDepositUtilisedForWithdrawals", type: "uint256", internalType: "uint256" },
      { name: "_rewardsAfterProcessingWithdrawals", type: "uint256", internalType: "uint256" },
      { name: "_totalStaked", type: "uint256", internalType: "uint256" },
      { name: "_burnableShares", type: "uint256", internalType: "uint256" },
      { name: "_lastProcessedRequestId", type: "uint256", internalType: "uint256" },
      { name: "_rewardFees", type: "uint256", internalType: "uint256" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "validatorsRegistry",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "withdrawalBatchIds",
    inputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "withdrawalBatchUnlockEpochs",
    inputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "uint64", internalType: "uint64" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "withdrawalDelay",
    inputs: [],
    outputs: [{ name: "", type: "uint64", internalType: "uint64" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "withdrawalFee",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "withdrawalFeesAccumulated",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "withdrawalWaitTime",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "event",
    name: "Approval",
    inputs: [
      { name: "owner", type: "address", indexed: true, internalType: "address" },
      { name: "spender", type: "address", indexed: true, internalType: "address" },
      { name: "value", type: "uint256", indexed: false, internalType: "uint256" }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "BurnableSharesUpdated",
    inputs: [{ name: "burnableShares", type: "uint256", indexed: false, internalType: "uint256" }],
    anonymous: false
  },
  {
    type: "event",
    name: "Deposit",
    inputs: [
      { name: "sender", type: "address", indexed: true, internalType: "address" },
      { name: "owner", type: "address", indexed: true, internalType: "address" },
      { name: "assets", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "shares", type: "uint256", indexed: false, internalType: "uint256" }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "EpochLengthUpdated",
    inputs: [{ name: "epochLength", type: "uint256", indexed: false, internalType: "uint256" }],
    anonymous: false
  },
  {
    type: "event",
    name: "EpochRewardsUpdated",
    inputs: [
      { name: "blockNumber", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "rewardsDistributing", type: "uint256", indexed: false, internalType: "uint256" }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "FeeVaultUpdated",
    inputs: [{ name: "protocolFeeVault", type: "address", indexed: false, internalType: "address" }],
    anonymous: false
  },
  {
    type: "event",
    name: "Initialized",
    inputs: [{ name: "version", type: "uint64", indexed: false, internalType: "uint64" }],
    anonymous: false
  },
  {
    type: "event",
    name: "LastProcessedBlockNumberUpdated",
    inputs: [{ name: "lastProcessedBlockNumber", type: "uint256", indexed: false, internalType: "uint256" }],
    anonymous: false
  },
  {
    type: "event",
    name: "LastProcessedRequestIdUpdated",
    inputs: [{ name: "lastProcessedRequestId", type: "uint256", indexed: false, internalType: "uint256" }],
    anonymous: false
  },
  {
    type: "event",
    name: "MigrationDeposit",
    inputs: [{ name: "assets", type: "uint256", indexed: false, internalType: "uint256" }],
    anonymous: false
  },
  {
    type: "event",
    name: "MinimumRedeemUpdated",
    inputs: [{ name: "minimumRedeem", type: "uint256", indexed: false, internalType: "uint256" }],
    anonymous: false
  },
  {
    type: "event",
    name: "NextRequestIdUpdated",
    inputs: [{ name: "nextRequestId", type: "uint256", indexed: false, internalType: "uint256" }],
    anonymous: false
  },
  {
    type: "event",
    name: "OperatorSet",
    inputs: [
      { name: "controller", type: "address", indexed: true, internalType: "address" },
      { name: "operator", type: "address", indexed: true, internalType: "address" },
      { name: "approved", type: "bool", indexed: false, internalType: "bool" }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "OracleDataUpdate",
    inputs: [
      { name: "blockNumber", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "totalPendingDeposit", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "totalStaked", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "burnableShares", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "lastProcessedRequestId", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "rewardFeesAccumulated", type: "uint256", indexed: false, internalType: "uint256" }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "OracleOperatorUpdated",
    inputs: [{ name: "oracle", type: "address", indexed: false, internalType: "address" }],
    anonymous: false
  },
  {
    type: "event",
    name: "OwnershipTransferred",
    inputs: [
      { name: "previousOwner", type: "address", indexed: true, internalType: "address" },
      { name: "newOwner", type: "address", indexed: true, internalType: "address" }
    ],
    anonymous: false
  },
  { type: "event", "name": "Paused", inputs: [{ name: "account", type: "address", indexed: false, internalType: "address" }], anonymous: false },
  {
    type: "event",
    name: "RebalanceStarted",
    inputs: [{ name: "rebalanceInProgress", type: "uint256", indexed: false, internalType: "uint256" }],
    anonymous: false
  },
  {
    type: "event",
    name: "Redeem",
    inputs: [
      { name: "controller", type: "address", indexed: true, internalType: "address" },
      { name: "receiver", type: "address", indexed: true, internalType: "address" },
      { name: "requestId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "shares", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "assets", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "fee", type: "uint256", indexed: false, internalType: "uint256" }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "RedeemRequest",
    inputs: [
      { name: "controller", type: "address", indexed: true, internalType: "address" },
      { name: "owner", type: "address", indexed: true, internalType: "address" },
      { name: "requestId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "sender", type: "address", indexed: false, internalType: "address" },
      { name: "shares", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "assets", type: "uint256", indexed: false, internalType: "uint256" }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "RedeemRequestUpdated",
    inputs: [
      { name: "requestId", type: "uint256", indexed: false, internalType: "uint256" },
      {
        name: "redeemData",
        type: "tuple",
        indexed: false,
        internalType: "struct aprMON.RedeemData",
        components: [
          { name: "shares", type: "uint256", internalType: "uint256" },
          { name: "controller", type: "address", internalType: "address" },
          { name: "assets", type: "uint256", internalType: "uint256" },
          { name: "claimed", type: "bool", internalType: "bool" },
          { name: "timestamp", type: "uint256", internalType: "uint256" }
        ]
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "RewardFeeUpdated",
    inputs: [{ name: "rewardFee", type: "uint8", indexed: false, internalType: "uint8" }],
    anonymous: false
  },
  {
    type: "event",
    name: "RewardFeesAccumulatedUpdated",
    inputs: [{ name: "rewardFeesAccumulated", type: "uint256", indexed: false, internalType: "uint256" }],
    anonymous: false
  },
  {
    type: "event",
    name: "StakePrecompileUpdated",
    inputs: [{ name: "stakePrecompile", type: "address", indexed: false, internalType: "address" }],
    anonymous: false
  },
  {
    type: "event",
    name: "Sweeped",
    inputs: [
      { name: "recipient", type: "address", indexed: false, internalType: "address" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "TotalPendingDepositUpdated",
    inputs: [{ name: "totalPendingDeposit", type: "uint256", indexed: false, internalType: "uint256" }],
    anonymous: false
  },
  {
    type: "event",
    name: "TotalStakedUpdated",
    inputs: [{ name: "totalStaked", type: "uint256", indexed: false, internalType: "uint256" }],
    anonymous: false
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true, internalType: "address" },
      { name: "to", type: "address", indexed: true, internalType: "address" },
      { name: "value", type: "uint256", indexed: false, internalType: "uint256" }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "Unpaused",
    inputs: [{ name: "account", type: "address", indexed: false, internalType: "address" }],
    anonymous: false
  },
  {
    type: "event",
    name: "ValidatorRebalance",
    inputs: [
      { name: "validatorId", type: "uint64", indexed: false, internalType: "uint64" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "isStaked", type: "bool", indexed: false, internalType: "bool" }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ValidatorsRegistryUpdated",
    inputs: [{ name: "validatorsRegistry", type: "address", indexed: false, internalType: "address" }],
    anonymous: false
  },
  {
    type: "event",
    name: "WithdrawalDelayUpdated",
    inputs: [{ name: "withdrawalDelay", type: "uint64", indexed: false, internalType: "uint64" }],
    anonymous: false
  },
  {
    type: "event",
    name: "WithdrawalFeeUpdated",
    inputs: [{ name: "withdrawalFee", type: "uint256", indexed: false, internalType: "uint256" }],
    anonymous: false
  },
  {
    type: "event",
    name: "WithdrawalFeesAccumulatedUpdated",
    inputs: [{ name: "withdrawalFeesAccumulated", type: "uint256", indexed: false, internalType: "uint256" }],
    anonymous: false
  },
  { type: "error", name: "AlreadyClaimed", inputs: [] },
  { type: "error", name: "BelowMinimumRedeemAmount", inputs: [] },
  { type: "error", name: "ECDSAInvalidSignature", inputs: [] },
  { type: "error", name: "ECDSAInvalidSignatureLength", inputs: [{ name: "length", type: "uint256", internalType: "uint256" }] },
  { type: "error", name: "ECDSAInvalidSignatureS", inputs: [{ name: "s", type: "bytes32", internalType: "bytes32" }] },
  {
    type: "error",
    name: "ERC20InsufficientAllowance",
    inputs: [
      { name: "spender", type: "address", internalType: "address" },
      { name: "allowance", type: "uint256", internalType: "uint256" },
      { name: "needed", type: "uint256", internalType: "uint256" }
    ]
  },
  {
    type: "error",
    name: "ERC20InsufficientBalance",
    inputs: [
      { name: "sender", type: "address", internalType: "address" },
      { name: "balance", type: "uint256", internalType: "uint256" },
      { name: "needed", type: "uint256", internalType: "uint256" }
    ]
  },
  { type: "error", name: "ERC20InvalidApprover", inputs: [{ name: "approver", type: "address", internalType: "address" }] },
  { type: "error", name: "ERC20InvalidReceiver", inputs: [{ name: "receiver", type: "address", internalType: "address" }] },
  { type: "error", name: "ERC20InvalidSender", inputs: [{ name: "sender", type: "address", internalType: "address" }] },
  { type: "error", name: "ERC20InvalidSpender", inputs: [{ name: "spender", type: "address", internalType: "address" }] },
  { type: "error", name: "ERC2612ExpiredSignature", inputs: [{ name: "deadline", type: "uint256", internalType: "uint256" }] },
  {
    type: "error",
    name: "ERC2612InvalidSigner",
    inputs: [
      { name: "signer", type: "address", internalType: "address" },
      { name: "owner", type: "address", internalType: "address" }
    ]
  },
  { type: "error", name: "EnforcedPause", inputs: [] },
  { type: "error", name: "ExpectedPause", inputs: [] },
  { type: "error", name: "InputLengthMismatch", inputs: [] },
  { type: "error", name: "InsufficientBalance", inputs: [] },
  { type: "error", name: "InvalidAmount", inputs: [] },
  { type: "error", name: "InvalidBlockNumber", inputs: [] },
  { type: "error", name: "InvalidBurnableShares", inputs: [] },
  { type: "error", name: "InvalidInitialization", inputs: [] },
  { type: "error", name: "InvalidLastProcessedRequestId", inputs: [] },
  { type: "error", name: "InvalidRange", inputs: [] },
  { type: "error", name: "InvalidRequestId", inputs: [] },
  { type: "error", name: "InvalidRewardFee", inputs: [] },
  { type: "error", name: "InvalidRewards", inputs: [] },
  { type: "error", name: "InvalidTotalStaked", inputs: [] },
  { type: "error", name: "InvalidUtilisedPendingDeposit", inputs: [] },
  { type: "error", name: "InvalidWithdrawalFee", inputs: [] },
  { type: "error", name: "NoActiveValidators", inputs: [] },
  { type: "error", name: "NoPendingWithdrawalRequests", inputs: [] },
  { type: "error", name: "NotInitializing", inputs: [] },
  { type: "error", name: "OnlyOracleOperatorAllowed", inputs: [] },
  { type: "error", name: "OwnableInvalidOwner", inputs: [{ name: "owner", type: "address", internalType: "address" }] },
  { type: "error", name: "OwnableUnauthorizedAccount", inputs: [{ name: "account", type: "address", internalType: "address" }] },
  { type: "error", name: "RebalanceInProgressAlready", inputs: [] },
  { type: "error", name: "RebalanceNotNeeded", inputs: [] },
  { type: "error", name: "RequestIdsArrayFull", inputs: [] },
  { type: "error", name: "StakePrecompileClaimRewardsFailed", inputs: [] },
  { type: "error", name: "StakePrecompileDelegateFailed", inputs: [] },
  { type: "error", name: "StakePrecompileUndelegateFailed", inputs: [] },
  { type: "error", name: "StakePrecompileWithdrawFailed", inputs: [] },
  { type: "error", name: "TotalAssetsIsZero", inputs: [] },
  { type: "error", name: "TransferFailed", inputs: [] },
  { type: "error", name: "UnauthorizedOperator", inputs: [] },
  { type: "error", name: "WaitMoreTime", inputs: [] }
] as const;

// ============================================================================
// TypeScript Types
// ============================================================================

/**
 * RequestData struct returned by getUserRequestData()
 */
export interface RequestData {
  id: bigint;           // Unique request ID
  claimed: boolean;     // Already claimed?
  claimable: boolean;   // Ready to claim now?
  shares: bigint;       // aprMON amount burned
  assets: bigint;       // MON amount to receive
  timestamp: bigint;    // Request creation time (Unix timestamp)
  unlockEpoch: bigint;  // Epoch when claimable
}

/**
 * Deposit event arguments
 */
export interface DepositEventArgs {
  sender: string;   // Who sent the transaction
  owner: string;    // Who received the aprMON
  assets: bigint;   // MON amount deposited
  shares: bigint;   // aprMON amount minted
}

/**
 * RedeemRequest event arguments
 */
export interface RedeemRequestEventArgs {
  controller: string;  // Who can claim the withdrawal
  owner: string;       // Who owned the aprMON
  requestId: bigint;   // Unique request ID (SAVE THIS!)
  sender: string;      // Who sent the transaction
  shares: bigint;      // aprMON amount burned
  assets: bigint;      // MON amount to receive (before fees)
}

/**
 * Redeem event arguments
 */
export interface RedeemEventArgs {
  controller: string;  // Who claimed
  receiver: string;    // Who received the MON
  requestId: bigint;   // Request ID that was claimed
  shares: bigint;      // aprMON amount that was burned
  assets: bigint;      // MON amount received (after fees)
  fee: bigint;         // Fee charged (0.1%)
}
