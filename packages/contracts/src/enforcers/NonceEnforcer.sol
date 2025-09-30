// SPDX-License-Identifier: MIT AND Apache-2.0
pragma solidity 0.8.23;

import { NonceEnforcer as DtkNonceEnforcer } from "@delegation-framework/enforcers/NonceEnforcer.sol";

/// @title Pragma Nonce Enforcer
/// @notice Thin wrapper around MetaMask DTK NonceEnforcer reused within Pragma contracts.
contract NonceEnforcer is DtkNonceEnforcer {}

