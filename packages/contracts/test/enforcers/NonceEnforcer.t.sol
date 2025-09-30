// SPDX-License-Identifier: MIT AND Apache-2.0
pragma solidity 0.8.23;

import { Test } from "forge-std/Test.sol";
import { ModeCode, ModeLib } from "@erc7579/lib/ModeLib.sol";

import { NonceEnforcer } from "../../src/enforcers/NonceEnforcer.sol";

contract NonceEnforcerTest is Test {
    NonceEnforcer internal enforcer;
    ModeCode internal defaultMode;
    address internal delegator = address(0xBEEF);

    function setUp() public {
        enforcer = new NonceEnforcer();
        defaultMode = ModeLib.encodeSimpleSingle();
    }

    function testBeforeHookPassesWhenNonceMatches() public view {
        bytes memory terms = abi.encodePacked(uint256(0));

        enforcer.beforeHook(terms, bytes(""), defaultMode, bytes(""), bytes32(0), delegator, address(0));
    }

    function testBeforeHookRevertsWhenNonceMismatch() public {
        vm.prank(delegator);
        enforcer.incrementNonce(address(this));

        bytes memory terms = abi.encodePacked(uint256(0));

        vm.expectRevert("NonceEnforcer:invalid-nonce");
        enforcer.beforeHook(terms, bytes(""), defaultMode, bytes(""), bytes32(0), delegator, address(0));
    }

    function testBeforeHookPassesAfterNonceIncrement() public {
        vm.prank(delegator);
        enforcer.incrementNonce(address(this));

        bytes memory terms = abi.encodePacked(uint256(1));

        enforcer.beforeHook(terms, bytes(""), defaultMode, bytes(""), bytes32(0), delegator, address(0));
    }
}
