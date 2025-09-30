// SPDX-License-Identifier: MIT AND Apache-2.0
pragma solidity 0.8.23;

import { NativeTokenTransferAmountEnforcer as DtkNativeTokenTransferAmountEnforcer } from "@delegation-framework/enforcers/NativeTokenTransferAmountEnforcer.sol";

/// @title Pragma Native Token Transfer Amount Enforcer
/// @notice Thin wrapper around MetaMask DTK NativeTokenTransferAmountEnforcer reused within Pragma contracts.
contract NativeTokenTransferAmountEnforcer is DtkNativeTokenTransferAmountEnforcer {}

