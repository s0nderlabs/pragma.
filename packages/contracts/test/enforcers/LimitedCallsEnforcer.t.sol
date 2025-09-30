// SPDX-License-Identifier: MIT AND Apache-2.0
pragma solidity 0.8.23;

import { Test } from "forge-std/Test.sol";
import { ModeCode, ModeLib } from "@erc7579/lib/ModeLib.sol";

import { LimitedCallsEnforcer } from "../../src/enforcers/LimitedCallsEnforcer.sol";

contract LimitedCallsEnforcerTest is Test {
    LimitedCallsEnforcer internal enforcer;
    ModeCode internal defaultMode;
    bytes32 internal constant DELEGATION_HASH = keccak256("delegation");
    address internal redeemer = address(0xCAFE);

    function setUp() public {
        enforcer = new LimitedCallsEnforcer();
        defaultMode = ModeLib.encodeSimpleSingle();
    }

    function testBeforeHookAllowsWithinLimit() public {
        bytes memory terms = abi.encodePacked(uint256(2));

        enforcer.beforeHook(terms, bytes(""), defaultMode, bytes(""), DELEGATION_HASH, address(0), redeemer);
        enforcer.beforeHook(terms, bytes(""), defaultMode, bytes(""), DELEGATION_HASH, address(0), redeemer);
    }

    function testBeforeHookRevertsWhenLimitExceeded() public {
        bytes memory terms = abi.encodePacked(uint256(1));

        enforcer.beforeHook(terms, bytes(""), defaultMode, bytes(""), DELEGATION_HASH, address(0), redeemer);

        vm.expectRevert("LimitedCallsEnforcer:limit-exceeded");
        enforcer.beforeHook(terms, bytes(""), defaultMode, bytes(""), DELEGATION_HASH, address(0), redeemer);
    }
}
