/**
 * Contract ABIs for on-chain delegation call tracking
 *
 * These ABIs are used to query the LimitedCallsEnforcer contract
 * to fetch the current call usage for delegations with call limits.
 */

/**
 * ABI for LimitedCallsEnforcer contract
 * Used to query how many calls have been used for a specific delegation
 */
export const LIMITED_CALLS_ABI = [
  {
    type: "function",
    name: "callCounts",
    stateMutability: "view",
    inputs: [
      { name: "delegationManager", type: "address" },
      { name: "delegationHash", type: "bytes32" },
    ],
    outputs: [{ name: "count", type: "uint256" }],
  },
] as const;

/**
 * ABI for DelegationManager contract
 * Used to compute the delegation hash from a delegation struct
 */
export const DELEGATION_MANAGER_ABI = [
  {
    type: "function",
    name: "getDelegationHash",
    stateMutability: "view",
    inputs: [
      {
        name: "delegation",
        type: "tuple",
        components: [
          { name: "delegate", type: "address" },
          { name: "delegator", type: "address" },
          { name: "authority", type: "bytes32" },
          {
            name: "caveats",
            type: "tuple[]",
            components: [
              { name: "enforcer", type: "address" },
              { name: "terms", type: "bytes" },
              { name: "args", type: "bytes" },
            ],
          },
          { name: "salt", type: "uint256" },
          { name: "signature", type: "bytes" },
        ],
      },
    ],
    outputs: [{ name: "delegationHash", type: "bytes32" }],
  },
] as const;
