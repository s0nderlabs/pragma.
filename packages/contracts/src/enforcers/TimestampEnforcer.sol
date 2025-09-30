// SPDX-License-Identifier: MIT AND Apache-2.0
pragma solidity 0.8.23;

import { TimestampEnforcer as DtkTimestampEnforcer } from "@delegation-framework/enforcers/TimestampEnforcer.sol";

/// @title Pragma Timestamp Enforcer
/// @notice Thin wrapper around MetaMask DTK TimestampEnforcer reused within Pragma contracts.
contract TimestampEnforcer is DtkTimestampEnforcer {}

