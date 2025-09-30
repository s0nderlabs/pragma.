// SPDX-License-Identifier: MIT AND Apache-2.0
pragma solidity 0.8.23;

import { LimitedCallsEnforcer as DtkLimitedCallsEnforcer } from "@delegation-framework/enforcers/LimitedCallsEnforcer.sol";

/// @title Pragma Limited Calls Enforcer
/// @notice Thin wrapper around MetaMask DTK LimitedCallsEnforcer reused within Pragma contracts.
contract LimitedCallsEnforcer is DtkLimitedCallsEnforcer {}

