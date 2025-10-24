// SPDX-License-Identifier: MIT AND Apache-2.0
pragma solidity 0.8.23;

import {ERC20TransferAmountEnforcer as DtkERC20TransferAmountEnforcer} from
    "@delegation-framework/enforcers/ERC20TransferAmountEnforcer.sol";

/// @title Pragma ERC20 Transfer Amount Enforcer
/// @notice Thin wrapper around MetaMask DTK ERC20TransferAmountEnforcer reused within Pragma contracts.
contract ERC20TransferAmountEnforcer is DtkERC20TransferAmountEnforcer {}
