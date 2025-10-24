// SPDX-License-Identifier: MIT AND Apache-2.0
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {ModeCode, ModeLib} from "@erc7579/lib/ModeLib.sol";
import {ExecutionLib} from "@erc7579/lib/ExecutionLib.sol";

import {NativeTokenTransferAmountEnforcer} from "../../src/enforcers/NativeTokenTransferAmountEnforcer.sol";

contract NativeTokenTransferAmountEnforcerTest is Test {
    NativeTokenTransferAmountEnforcer internal enforcer;
    ModeCode internal defaultMode;
    bytes32 internal constant DELEGATION_HASH = keccak256("native-delegation");
    address internal constant TARGET = address(0xFEE1);

    function setUp() public {
        enforcer = new NativeTokenTransferAmountEnforcer();
        defaultMode = ModeLib.encodeSimpleSingle();
    }

    function testBeforeHookAllowsWithinAllowance() public {
        bytes memory terms = abi.encode(uint256(2 ether));
        bytes memory callData = ExecutionLib.encodeSingle(TARGET, 1 ether, bytes(""));

        enforcer.beforeHook(terms, bytes(""), defaultMode, callData, DELEGATION_HASH, address(0), address(this));

        callData = ExecutionLib.encodeSingle(TARGET, 1 ether, bytes(""));
        enforcer.beforeHook(terms, bytes(""), defaultMode, callData, DELEGATION_HASH, address(0), address(this));
    }

    function testBeforeHookRevertsWhenAllowanceExceeded() public {
        bytes memory terms = abi.encode(uint256(1 ether));
        bytes memory callData = ExecutionLib.encodeSingle(TARGET, 0.6 ether, bytes(""));

        enforcer.beforeHook(terms, bytes(""), defaultMode, callData, DELEGATION_HASH, address(0), address(this));

        callData = ExecutionLib.encodeSingle(TARGET, 0.5 ether, bytes(""));

        vm.expectRevert("NativeTokenTransferAmountEnforcer:allowance-exceeded");
        enforcer.beforeHook(terms, bytes(""), defaultMode, callData, DELEGATION_HASH, address(0), address(this));
    }
}
