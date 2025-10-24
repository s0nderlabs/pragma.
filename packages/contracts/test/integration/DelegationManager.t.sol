// SPDX-License-Identifier: MIT AND Apache-2.0
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {DelegationManager} from "@delegation-framework/DelegationManager.sol";
import {IDeleGatorCore} from "@delegation-framework/interfaces/IDeleGatorCore.sol";
import {Delegation, Caveat} from "@delegation-framework/utils/Types.sol";
import {ModeCode, ModeLib} from "@erc7579/lib/ModeLib.sol";
import {ExecutionLib} from "@erc7579/lib/ExecutionLib.sol";

import {TimestampEnforcer} from "../../src/enforcers/TimestampEnforcer.sol";
import {LimitedCallsEnforcer} from "../../src/enforcers/LimitedCallsEnforcer.sol";
import {NonceEnforcer} from "../../src/enforcers/NonceEnforcer.sol";
import {ERC20TransferAmountEnforcer} from "../../src/enforcers/ERC20TransferAmountEnforcer.sol";
import {NativeTokenTransferAmountEnforcer} from "../../src/enforcers/NativeTokenTransferAmountEnforcer.sol";

contract DelegationManagerIntegrationTest is Test {
    DelegationManager internal manager;
    MockDelegator internal delegator;
    TimestampEnforcer internal timestampEnforcer;
    LimitedCallsEnforcer internal limitedCallsEnforcer;
    NonceEnforcer internal nonceEnforcer;
    ERC20TransferAmountEnforcer internal erc20Enforcer;
    NativeTokenTransferAmountEnforcer internal nativeEnforcer;
    ModeCode internal defaultMode;

    address internal constant TOKEN = address(0x1234);
    address internal constant RECIPIENT = address(0xBEEF);

    function setUp() public {
        manager = new DelegationManager(address(this));
        delegator = new MockDelegator();
        timestampEnforcer = new TimestampEnforcer();
        limitedCallsEnforcer = new LimitedCallsEnforcer();
        nonceEnforcer = new NonceEnforcer();
        erc20Enforcer = new ERC20TransferAmountEnforcer();
        nativeEnforcer = new NativeTokenTransferAmountEnforcer();
        defaultMode = ModeLib.encodeSimpleSingle();
    }

    function testRedeemDelegationsExecutesWithAllEnforcers() public {
        uint256 erc20Limit = 200 ether;
        uint256 erc20Amount = 75 ether;
        uint256 nativeLimit = 1 ether;
        uint256 nativeSpend = 0.25 ether;

        bytes memory execution = ExecutionLib.encodeSingle(
            TOKEN, nativeSpend, abi.encodeWithSelector(IERC20.transfer.selector, RECIPIENT, erc20Amount)
        );

        (bytes[] memory contexts, ModeCode[] memory modes, bytes[] memory executions, bytes32 delegationHash) =
            _buildExecutionContext(1, erc20Limit, nativeLimit, execution);

        manager.redeemDelegations(contexts, modes, executions);

        assertEq(delegator.lastCaller(), address(manager), "executor should be manager");
        assertEq(ModeCode.unwrap(delegator.lastMode()), ModeCode.unwrap(defaultMode), "mode should match");
        assertEq(delegator.lastCallData(), execution, "execution calldata should match");
        assertEq(limitedCallsEnforcer.callCounts(address(manager), delegationHash), 1, "limited calls should increment");
        assertEq(
            erc20Enforcer.spentMap(address(manager), delegationHash),
            erc20Amount,
            "erc20 spent amount should reflect transfer"
        );
        assertEq(
            nativeEnforcer.spentMap(address(manager), delegationHash),
            nativeSpend,
            "native spent amount should reflect call value"
        );
    }

    function testRedeemDelegationsRespectsCallLimit() public {
        uint256 erc20Limit = 100 ether;
        uint256 erc20Amount = 10 ether;
        uint256 nativeLimit = 1 ether;
        uint256 nativeSpend = 0.1 ether;

        bytes memory execution = ExecutionLib.encodeSingle(
            TOKEN, nativeSpend, abi.encodeWithSelector(IERC20.transfer.selector, RECIPIENT, erc20Amount)
        );

        (bytes[] memory contexts, ModeCode[] memory modes, bytes[] memory executions, bytes32 delegationHash) =
            _buildExecutionContext(1, erc20Limit, nativeLimit, execution);

        manager.redeemDelegations(contexts, modes, executions);

        vm.expectRevert("LimitedCallsEnforcer:limit-exceeded");
        manager.redeemDelegations(contexts, modes, executions);

        assertEq(
            limitedCallsEnforcer.callCounts(address(manager), delegationHash), 1, "call count should remain capped"
        );
    }

    function _buildExecutionContext(uint256 callLimit, uint256 erc20Limit, uint256 nativeLimit, bytes memory execution)
        internal
        view
        returns (bytes[] memory contexts, ModeCode[] memory modes, bytes[] memory executions, bytes32 delegationHash)
    {
        Caveat[] memory caveats = new Caveat[](5);
        caveats[0] = Caveat({
            enforcer: address(timestampEnforcer),
            terms: abi.encodePacked(uint128(0), uint128(block.timestamp + 1 hours)),
            args: bytes("")
        });
        caveats[1] =
            Caveat({enforcer: address(limitedCallsEnforcer), terms: abi.encodePacked(callLimit), args: bytes("")});
        caveats[2] = Caveat({enforcer: address(nonceEnforcer), terms: abi.encodePacked(uint256(0)), args: bytes("")});
        caveats[3] =
            Caveat({enforcer: address(erc20Enforcer), terms: abi.encodePacked(TOKEN, erc20Limit), args: bytes("")});
        caveats[4] = Caveat({enforcer: address(nativeEnforcer), terms: abi.encode(nativeLimit), args: bytes("")});

        Delegation[] memory delegations = new Delegation[](1);
        delegations[0].delegate = address(this);
        delegations[0].delegator = address(delegator);
        delegations[0].authority = manager.ROOT_AUTHORITY();
        delegations[0].caveats = caveats;
        delegations[0].salt = 0;
        delegations[0].signature = hex"";

        delegationHash = manager.getDelegationHash(delegations[0]);

        contexts = new bytes[](1);
        contexts[0] = abi.encode(delegations);

        modes = new ModeCode[](1);
        modes[0] = defaultMode;

        executions = new bytes[](1);
        executions[0] = execution;
    }
}

contract MockDelegator is IDeleGatorCore {
    ModeCode private _lastMode;
    bytes private _lastCallData;
    address private _lastCaller;

    function executeFromExecutor(ModeCode mode, bytes calldata executionCalldata)
        external
        payable
        override
        returns (bytes[] memory)
    {
        _lastMode = mode;
        _lastCallData = executionCalldata;
        _lastCaller = msg.sender;
        return new bytes[](0);
    }

    function isValidSignature(bytes32, bytes calldata) external pure override returns (bytes4) {
        return 0x1626ba7e;
    }

    function lastMode() external view returns (ModeCode) {
        return _lastMode;
    }

    function lastCallData() external view returns (bytes memory) {
        return _lastCallData;
    }

    function lastCaller() external view returns (address) {
        return _lastCaller;
    }
}
