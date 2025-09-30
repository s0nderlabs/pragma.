// SPDX-License-Identifier: MIT AND Apache-2.0
pragma solidity 0.8.23;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ModeCode, ModeLib } from "@erc7579/lib/ModeLib.sol";
import { ExecutionLib } from "@erc7579/lib/ExecutionLib.sol";

import { ERC20TransferAmountEnforcer } from "../../src/enforcers/ERC20TransferAmountEnforcer.sol";

contract ERC20TransferAmountEnforcerTest is Test {
    ERC20TransferAmountEnforcer internal enforcer;
    ModeCode internal defaultMode;
    address internal constant TOKEN = address(0x1234);
    bytes32 internal constant DELEGATION_HASH = keccak256("erc20-delegation");
    address internal recipient = address(0xBEEF);

    function setUp() public {
        enforcer = new ERC20TransferAmountEnforcer();
        defaultMode = ModeLib.encodeSimpleSingle();
    }

    function _encodeTerms(uint256 limit) internal pure returns (bytes memory) {
        return abi.encodePacked(TOKEN, limit);
    }

    function testBeforeHookAllowsWithinAllowance() public {
        bytes memory terms = _encodeTerms(100 ether);
        bytes memory callData = ExecutionLib.encodeSingle(
            TOKEN,
            0,
            abi.encodeWithSelector(IERC20.transfer.selector, recipient, uint256(40 ether))
        );

        enforcer.beforeHook(terms, bytes(""), defaultMode, callData, DELEGATION_HASH, address(0), recipient);

        callData = ExecutionLib.encodeSingle(
            TOKEN,
            0,
            abi.encodeWithSelector(IERC20.transfer.selector, recipient, uint256(60 ether))
        );

        enforcer.beforeHook(terms, bytes(""), defaultMode, callData, DELEGATION_HASH, address(0), recipient);
    }

    function testBeforeHookRevertsWhenAllowanceExceeded() public {
        bytes memory terms = _encodeTerms(50 ether);
        bytes memory callData = ExecutionLib.encodeSingle(
            TOKEN,
            0,
            abi.encodeWithSelector(IERC20.transfer.selector, recipient, uint256(30 ether))
        );

        enforcer.beforeHook(terms, bytes(""), defaultMode, callData, DELEGATION_HASH, address(0), recipient);

        callData = ExecutionLib.encodeSingle(
            TOKEN,
            0,
            abi.encodeWithSelector(IERC20.transfer.selector, recipient, uint256(25 ether))
        );

        vm.expectRevert("ERC20TransferAmountEnforcer:allowance-exceeded");
        enforcer.beforeHook(terms, bytes(""), defaultMode, callData, DELEGATION_HASH, address(0), recipient);
    }
}
