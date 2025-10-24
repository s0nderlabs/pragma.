// SPDX-License-Identifier: MIT AND Apache-2.0
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {ModeCode, ModeLib} from "@erc7579/lib/ModeLib.sol";

import {TimestampEnforcer} from "../../src/enforcers/TimestampEnforcer.sol";

contract TimestampEnforcerTest is Test {
    TimestampEnforcer internal enforcer;
    ModeCode internal defaultMode;

    function setUp() public {
        enforcer = new TimestampEnforcer();
        defaultMode = ModeLib.encodeSimpleSingle();
    }

    function testBeforeHookWithinWindow() public view {
        bytes memory terms = abi.encodePacked(uint128(0), uint128(block.timestamp + 1 hours));

        enforcer.beforeHook(terms, bytes(""), defaultMode, bytes(""), bytes32(0), address(this), address(0));
    }

    function testBeforeHookRevertsBeforeThreshold() public {
        bytes memory terms = abi.encodePacked(uint128(block.timestamp + 1 hours), uint128(0));

        vm.expectRevert("TimestampEnforcer:early-delegation");
        enforcer.beforeHook(terms, bytes(""), defaultMode, bytes(""), bytes32(0), address(this), address(0));
    }

    function testBeforeHookRevertsAfterThreshold() public {
        bytes memory terms = abi.encodePacked(uint128(0), uint128(block.timestamp + 1 hours));

        vm.warp(block.timestamp + 2 hours);
        vm.expectRevert("TimestampEnforcer:expired-delegation");
        enforcer.beforeHook(terms, bytes(""), defaultMode, bytes(""), bytes32(0), address(this), address(0));
    }
}
