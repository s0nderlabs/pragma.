// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ModeLib } from "@erc7579/lib/ModeLib.sol";
import { ExecutionLib } from "@erc7579/lib/ExecutionLib.sol";

import { PragmaFeeEnforcer } from "../src/enforcers/PragmaFeeEnforcer.sol";
import { Delegation, Caveat, ModeCode } from "../lib/delegation-framework/src/utils/Types.sol";
import { IDelegationManager } from "../lib/delegation-framework/src/interfaces/IDelegationManager.sol";

/**
 * @title PragmaFeeEnforcerTest
 * @notice Comprehensive test suite for PragmaFeeEnforcer
 * @dev Aims for 100% code coverage
 */
contract PragmaFeeEnforcerTest is Test {
    using ModeLib for ModeCode;

    PragmaFeeEnforcer public enforcer;
    MockDelegationManager public delegationManager;

    address public argsEqualityCheckEnforcer;
    address public treasury;
    address public user;
    address public sessionKey;
    address public erc20Token;

    bytes32 public constant DELEGATION_HASH = keccak256("test-delegation");

    function setUp() public {
        // Setup test accounts
        argsEqualityCheckEnforcer = makeAddr("argsEqualityCheckEnforcer");
        treasury = makeAddr("treasury");
        user = makeAddr("user");
        sessionKey = makeAddr("sessionKey");
        erc20Token = address(new MockERC20("Test Token", "TEST"));

        // Deploy mock delegation manager
        delegationManager = new MockDelegationManager(payable(treasury));

        // Deploy enforcer
        enforcer = new PragmaFeeEnforcer(
            IDelegationManager(address(delegationManager)),
            argsEqualityCheckEnforcer,
            treasury
        );

        // Fund user with native tokens and ERC20
        vm.deal(user, 100 ether);
        MockERC20(erc20Token).mint(user, 1000e18);
    }

    ////////////////////////////// Constructor Tests //////////////////////////////

    function test_Constructor_SetsImmutablesCorrectly() public view {
        assertEq(address(enforcer.delegationManager()), address(delegationManager));
        assertEq(enforcer.argsEqualityCheckEnforcer(), argsEqualityCheckEnforcer);
        assertEq(enforcer.TREASURY(), treasury);
    }

    function test_Constructor_RevertsIfDelegationManagerIsZero() public {
        vm.expectRevert("PragmaFeeEnforcer:invalid-delegation-manager");
        new PragmaFeeEnforcer(
            IDelegationManager(address(0)),
            argsEqualityCheckEnforcer,
            treasury
        );
    }

    function test_Constructor_RevertsIfArgsEnforcerIsZero() public {
        vm.expectRevert("PragmaFeeEnforcer:invalid-args-enforcer");
        new PragmaFeeEnforcer(
            IDelegationManager(address(delegationManager)),
            address(0),
            treasury
        );
    }

    function test_Constructor_RevertsIfTreasuryIsZero() public {
        vm.expectRevert("PragmaFeeEnforcer:invalid-treasury");
        new PragmaFeeEnforcer(
            IDelegationManager(address(delegationManager)),
            argsEqualityCheckEnforcer,
            address(0)
        );
    }

    ////////////////////////////// getTermsInfo Tests //////////////////////////////

    function test_GetTermsInfo_DecodesNativeTokenTermsCorrectly() public {
        // Encode terms: isNative=true, token=address(0), amount=1 ether
        bytes memory terms = abi.encodePacked(
            uint8(1),              // isNative = true
            address(0),            // token (ignored for native)
            uint256(1 ether)       // amount
        );

        (bool isNative, address token, uint256 amount) = enforcer.getTermsInfo(terms);

        assertTrue(isNative);
        assertEq(token, address(0));
        assertEq(amount, 1 ether);
    }

    function test_GetTermsInfo_DecodesERC20TermsCorrectly() public {
        // Encode terms: isNative=false, token=erc20Token, amount=100e18
        bytes memory terms = abi.encodePacked(
            uint8(0),              // isNative = false
            erc20Token,            // token address
            uint256(100e18)        // amount
        );

        (bool isNative, address token, uint256 amount) = enforcer.getTermsInfo(terms);

        assertFalse(isNative);
        assertEq(token, erc20Token);
        assertEq(amount, 100e18);
    }

    function test_GetTermsInfo_RevertsIfTermsLengthInvalid() public {
        bytes memory invalidTerms = abi.encodePacked(uint256(123)); // Only 32 bytes

        vm.expectRevert("PragmaFeeEnforcer:invalid-terms-length");
        enforcer.getTermsInfo(invalidTerms);
    }

    ////////////////////////////// afterAllHook Tests - Native Token //////////////////////////////

    function test_AfterAllHook_CollectsNativeTokenFee() public {
        uint256 feeAmount = 0.5 ether;

        // Encode terms for native token fee
        bytes memory terms = abi.encodePacked(
            uint8(1),              // isNative = true
            address(0),            // token
            feeAmount              // amount
        );

        // Create allowance delegation
        Delegation memory allowanceDelegation = _createAllowanceDelegation(true, address(0), feeAmount);
        bytes memory args = abi.encode(_wrapDelegationArray(allowanceDelegation));

        uint256 treasuryBalanceBefore = treasury.balance;

        // Fund mock delegation manager and setup payment
        vm.deal(address(delegationManager), feeAmount);
        delegationManager.setupNativePayment(feeAmount);

        // Expect ValidatedPayment event
        vm.expectEmit(true, true, true, true);
        emit PragmaFeeEnforcer.ValidatedPayment(
            address(delegationManager),
            DELEGATION_HASH,
            true,
            address(0),
            user,
            sessionKey,
            feeAmount,
            feeAmount,  // actualAmount (same as expected for standard native token)
            treasuryBalanceBefore,
            treasuryBalanceBefore + feeAmount  // balanceAfter
        );

        vm.prank(address(delegationManager));
        enforcer.afterAllHook(
            terms,
            args,
            ModeLib.encodeSimpleSingle(),
            "",
            DELEGATION_HASH,
            user,
            sessionKey
        );

        // Verify treasury received the fee
        assertEq(treasury.balance, treasuryBalanceBefore + feeAmount);
    }

    function test_AfterAllHook_RevertsIfNativePaymentNotReceived() public {
        uint256 feeAmount = 0.5 ether;

        bytes memory terms = abi.encodePacked(uint8(1), address(0), feeAmount);
        Delegation memory allowanceDelegation = _createAllowanceDelegation(true, address(0), feeAmount);
        bytes memory args = abi.encode(_wrapDelegationArray(allowanceDelegation));

        // Don't setup payment - delegationManager.redeemDelegations won't send anything
        vm.prank(address(delegationManager));
        vm.expectRevert("PragmaFeeEnforcer:insufficient-payment");
        enforcer.afterAllHook(
            terms,
            args,
            ModeLib.encodeSimpleSingle(),
            "",
            DELEGATION_HASH,
            user,
            sessionKey
        );
    }

    ////////////////////////////// afterAllHook Tests - ERC20 Token //////////////////////////////

    function test_AfterAllHook_CollectsERC20Fee() public {
        uint256 feeAmount = 100e18;

        // Encode terms for ERC20 fee
        bytes memory terms = abi.encodePacked(
            uint8(0),              // isNative = false
            erc20Token,            // token
            feeAmount              // amount
        );

        // Create allowance delegation
        Delegation memory allowanceDelegation = _createAllowanceDelegation(false, erc20Token, feeAmount);
        bytes memory args = abi.encode(_wrapDelegationArray(allowanceDelegation));

        uint256 treasuryBalanceBefore = IERC20(erc20Token).balanceOf(treasury);

        // Fund mock delegation manager and setup ERC20 payment
        MockERC20(erc20Token).mint(address(delegationManager), feeAmount);
        delegationManager.setupERC20Payment(erc20Token, feeAmount);

        // Expect ValidatedPayment event
        vm.expectEmit(true, true, true, true);
        emit PragmaFeeEnforcer.ValidatedPayment(
            address(delegationManager),
            DELEGATION_HASH,
            false,
            erc20Token,
            user,
            sessionKey,
            feeAmount,
            feeAmount,  // actualAmount (same as expected for standard ERC20)
            treasuryBalanceBefore,
            treasuryBalanceBefore + feeAmount  // balanceAfter
        );

        vm.prank(address(delegationManager));
        enforcer.afterAllHook(
            terms,
            args,
            ModeLib.encodeSimpleSingle(),
            "",
            DELEGATION_HASH,
            user,
            sessionKey
        );

        // Verify treasury received the fee
        assertEq(IERC20(erc20Token).balanceOf(treasury), treasuryBalanceBefore + feeAmount);
    }

    function test_AfterAllHook_RevertsIfERC20PaymentNotReceived() public {
        uint256 feeAmount = 100e18;

        bytes memory terms = abi.encodePacked(uint8(0), erc20Token, feeAmount);
        Delegation memory allowanceDelegation = _createAllowanceDelegation(false, erc20Token, feeAmount);
        bytes memory args = abi.encode(_wrapDelegationArray(allowanceDelegation));

        // Don't setup payment - delegationManager.redeemDelegations won't send anything
        vm.prank(address(delegationManager));
        vm.expectRevert("PragmaFeeEnforcer:insufficient-payment");
        enforcer.afterAllHook(
            terms,
            args,
            ModeLib.encodeSimpleSingle(),
            "",
            DELEGATION_HASH,
            user,
            sessionKey
        );
    }

    ////////////////////////////// Security Tests //////////////////////////////

    function test_AfterAllHook_RevertsIfNotCalledByDelegationManager() public {
        bytes memory terms = abi.encodePacked(uint8(1), address(0), uint256(1 ether));
        Delegation memory allowanceDelegation = _createAllowanceDelegation(true, address(0), 1 ether);
        bytes memory args = abi.encode(_wrapDelegationArray(allowanceDelegation));

        vm.prank(user); // Not delegation manager
        vm.expectRevert("PragmaFeeEnforcer:only-delegation-manager");
        enforcer.afterAllHook(
            terms,
            args,
            ModeLib.encodeSimpleSingle(),
            "",
            DELEGATION_HASH,
            user,
            sessionKey
        );
    }

    function test_AfterAllHook_RevertsIfAllowanceDelegationsEmpty() public {
        bytes memory terms = abi.encodePacked(uint8(1), address(0), uint256(1 ether));
        Delegation[] memory emptyDelegations = new Delegation[](0);
        bytes memory args = abi.encode(emptyDelegations);

        vm.prank(address(delegationManager));
        vm.expectRevert("PragmaFeeEnforcer:must-have-single-allowance-delegation");
        enforcer.afterAllHook(
            terms,
            args,
            ModeLib.encodeSimpleSingle(),
            "",
            DELEGATION_HASH,
            user,
            sessionKey
        );
    }

    function test_AfterAllHook_RevertsIfArgsEqualityCheckEnforcerMissing() public {
        bytes memory terms = abi.encodePacked(uint8(1), address(0), uint256(1 ether));

        // Create delegation without ArgsEqualityCheckEnforcer
        Caveat[] memory caveats = new Caveat[](0);
        Delegation memory allowanceDelegation = Delegation({
            delegate: sessionKey,
            delegator: user,
            authority: hex"",
            caveats: caveats,
            salt: 0,
            signature: hex""
        });
        bytes memory args = abi.encode(_wrapDelegationArray(allowanceDelegation));

        vm.prank(address(delegationManager));
        vm.expectRevert("PragmaFeeEnforcer:missing-argsEqualityCheckEnforcer");
        enforcer.afterAllHook(
            terms,
            args,
            ModeLib.encodeSimpleSingle(),
            "",
            DELEGATION_HASH,
            user,
            sessionKey
        );
    }

    function test_AfterAllHook_RevertsIfArgsEnforcerNotFirst() public {
        bytes memory terms = abi.encodePacked(uint8(1), address(0), uint256(1 ether));

        // Create delegation with wrong enforcer as first caveat
        Caveat[] memory caveats = new Caveat[](1);
        caveats[0] = Caveat({
            args: hex"",
            enforcer: address(0x999), // Wrong enforcer
            terms: hex""
        });

        Delegation memory allowanceDelegation = Delegation({
            delegate: sessionKey,
            delegator: user,
            authority: hex"",
            caveats: caveats,
            salt: 0,
            signature: hex""
        });
        bytes memory args = abi.encode(_wrapDelegationArray(allowanceDelegation));

        vm.prank(address(delegationManager));
        vm.expectRevert("PragmaFeeEnforcer:missing-argsEqualityCheckEnforcer");
        enforcer.afterAllHook(
            terms,
            args,
            ModeLib.encodeSimpleSingle(),
            "",
            DELEGATION_HASH,
            user,
            sessionKey
        );
    }

    ////////////////////////////// Comprehensive Security Tests //////////////////////////////

    function test_AfterAllHook_SupportsFeeOnTransferToken_10PercentFee() public {
        uint256 feeAmount = 100e18;

        // Deploy fee-on-transfer token (10% fee)
        MockFeeOnTransferToken feeToken = new MockFeeOnTransferToken("Fee Token", "FEE", 10); // 10% fee

        bytes memory terms = abi.encodePacked(uint8(0), address(feeToken), feeAmount);
        Delegation memory allowanceDelegation = _createAllowanceDelegation(false, address(feeToken), feeAmount);
        bytes memory args = abi.encode(_wrapDelegationArray(allowanceDelegation));

        // Mint to delegation manager (will transfer 90e18 after 10% fee)
        feeToken.mint(address(delegationManager), feeAmount);
        delegationManager.setupERC20Payment(address(feeToken), feeAmount);

        uint256 treasuryBalanceBefore = feeToken.balanceOf(treasury);

        vm.prank(address(delegationManager));
        enforcer.afterAllHook(
            terms,
            args,
            ModeLib.encodeSimpleSingle(),
            "",
            DELEGATION_HASH,
            user,
            sessionKey
        );

        // Verify treasury received 90e18 (90% of 100e18)
        uint256 received = feeToken.balanceOf(treasury) - treasuryBalanceBefore;
        assertEq(received, 90e18);
    }

    function test_AfterAllHook_RejectsExcessiveFeeOnTransferToken_11PercentFee() public {
        uint256 feeAmount = 100e18;

        // Deploy fee-on-transfer token (11% fee - exceeds 90% threshold)
        MockFeeOnTransferToken feeToken = new MockFeeOnTransferToken("Fee Token", "FEE", 11); // 11% fee

        bytes memory terms = abi.encodePacked(uint8(0), address(feeToken), feeAmount);
        Delegation memory allowanceDelegation = _createAllowanceDelegation(false, address(feeToken), feeAmount);
        bytes memory args = abi.encode(_wrapDelegationArray(allowanceDelegation));

        // Mint to delegation manager (will transfer 89e18 after 11% fee)
        feeToken.mint(address(delegationManager), feeAmount);
        delegationManager.setupERC20Payment(address(feeToken), feeAmount);

        vm.prank(address(delegationManager));
        vm.expectRevert("PragmaFeeEnforcer:insufficient-payment");
        enforcer.afterAllHook(
            terms,
            args,
            ModeLib.encodeSimpleSingle(),
            "",
            DELEGATION_HASH,
            user,
            sessionKey
        );
    }

    function test_AfterAllHook_AcceptsExactly90PercentThreshold() public {
        uint256 feeAmount = 100e18;

        // Deploy fee-on-transfer token (exactly 10% fee)
        MockFeeOnTransferToken feeToken = new MockFeeOnTransferToken("Fee Token", "FEE", 10);

        bytes memory terms = abi.encodePacked(uint8(0), address(feeToken), feeAmount);
        Delegation memory allowanceDelegation = _createAllowanceDelegation(false, address(feeToken), feeAmount);
        bytes memory args = abi.encode(_wrapDelegationArray(allowanceDelegation));

        feeToken.mint(address(delegationManager), feeAmount);
        delegationManager.setupERC20Payment(address(feeToken), feeAmount);

        vm.prank(address(delegationManager));
        enforcer.afterAllHook(
            terms,
            args,
            ModeLib.encodeSimpleSingle(),
            "",
            DELEGATION_HASH,
            user,
            sessionKey
        );

        // Should succeed with exactly 90e18 received
        assertEq(feeToken.balanceOf(treasury), 90e18);
    }

    function test_AfterAllHook_EmitsFeeOnTransferEvent() public {
        uint256 feeAmount = 100e18;
        MockFeeOnTransferToken feeToken = new MockFeeOnTransferToken("Fee Token", "FEE", 10); // 10% fee

        bytes memory terms = abi.encodePacked(uint8(0), address(feeToken), feeAmount);
        Delegation memory allowanceDelegation = _createAllowanceDelegation(false, address(feeToken), feeAmount);
        bytes memory args = abi.encode(_wrapDelegationArray(allowanceDelegation));

        feeToken.mint(address(delegationManager), feeAmount);
        delegationManager.setupERC20Payment(address(feeToken), feeAmount);

        // Expect FeeOnTransferDetected event (10% fee = 1000 basis points)
        vm.expectEmit(true, true, false, true);
        emit PragmaFeeEnforcer.FeeOnTransferDetected(
            DELEGATION_HASH,
            address(feeToken),
            feeAmount,
            90e18, // 90% received
            1000   // 10% fee in basis points
        );

        vm.prank(address(delegationManager));
        enforcer.afterAllHook(
            terms,
            args,
            ModeLib.encodeSimpleSingle(),
            "",
            DELEGATION_HASH,
            user,
            sessionKey
        );
    }

    function test_GetTermsInfo_RevertsIfAmountIsZero() public {
        bytes memory terms = abi.encodePacked(uint8(1), address(0), uint256(0));

        vm.expectRevert("PragmaFeeEnforcer:amount-must-be-positive");
        enforcer.getTermsInfo(terms);
    }

    function test_GetTermsInfo_RevertsIfAmountTooSmall() public {
        bytes memory terms = abi.encodePacked(uint8(1), address(0), uint256(99)); // 99 wei

        vm.expectRevert("PragmaFeeEnforcer:amount-too-small");
        enforcer.getTermsInfo(terms);
    }

    function test_GetTermsInfo_AcceptsMinimumAmount() public view {
        bytes memory terms = abi.encodePacked(uint8(1), address(0), uint256(100)); // Exactly 100 wei

        (bool isNative, address token, uint256 amount) = enforcer.getTermsInfo(terms);

        assertTrue(isNative);
        assertEq(token, address(0));
        assertEq(amount, 100);
    }

    function test_AfterAllHook_RevertsIfBalanceDecreases() public {
        // Deploy malicious token that decreases treasury balance
        MockBalanceManipulationToken maliciousToken = new MockBalanceManipulationToken(treasury);

        uint256 feeAmount = 100e18;
        bytes memory terms = abi.encodePacked(uint8(0), address(maliciousToken), feeAmount);
        Delegation memory allowanceDelegation = _createAllowanceDelegation(false, address(maliciousToken), feeAmount);
        bytes memory args = abi.encode(_wrapDelegationArray(allowanceDelegation));

        // Setup: Give treasury some initial balance and enable manipulation
        maliciousToken.mint(treasury, 200e18); // Treasury starts with 200 tokens
        maliciousToken.mint(address(delegationManager), feeAmount);
        delegationManager.setupERC20Payment(address(maliciousToken), feeAmount);
        maliciousToken.enableBalanceManipulation(true); // Decreases balance during transfer

        vm.prank(address(delegationManager));
        vm.expectRevert("PragmaFeeEnforcer:balance-decreased");
        enforcer.afterAllHook(
            terms,
            args,
            ModeLib.encodeSimpleSingle(),
            "",
            DELEGATION_HASH,
            user,
            sessionKey
        );
    }

    function test_AfterAllHook_RevertsIfTokenIsNotContract() public {
        uint256 feeAmount = 100e18;
        address notAContract = makeAddr("notAContract");

        bytes memory terms = abi.encodePacked(uint8(0), notAContract, feeAmount);
        Delegation memory allowanceDelegation = _createAllowanceDelegation(false, notAContract, feeAmount);
        bytes memory args = abi.encode(_wrapDelegationArray(allowanceDelegation));

        vm.prank(address(delegationManager));
        vm.expectRevert("PragmaFeeEnforcer:token-must-be-contract");
        enforcer.afterAllHook(
            terms,
            args,
            ModeLib.encodeSimpleSingle(),
            "",
            DELEGATION_HASH,
            user,
            sessionKey
        );
    }

    function test_AfterAllHook_RevertsIfTokenAddressIsZeroForERC20() public {
        uint256 feeAmount = 100e18;

        bytes memory terms = abi.encodePacked(uint8(0), address(0), feeAmount); // ERC20 with zero address
        Delegation memory allowanceDelegation = _createAllowanceDelegation(false, address(0), feeAmount);
        bytes memory args = abi.encode(_wrapDelegationArray(allowanceDelegation));

        vm.prank(address(delegationManager));
        vm.expectRevert("PragmaFeeEnforcer:invalid-token-address");
        enforcer.afterAllHook(
            terms,
            args,
            ModeLib.encodeSimpleSingle(),
            "",
            DELEGATION_HASH,
            user,
            sessionKey
        );
    }

    function test_AfterAllHook_RevertsIfMultipleDelegations() public {
        bytes memory terms = abi.encodePacked(uint8(1), address(0), uint256(1 ether));

        // Create array with 2 delegations (only 1 allowed)
        Delegation[] memory twoDelegations = new Delegation[](2);
        twoDelegations[0] = _createAllowanceDelegation(true, address(0), 1 ether);
        twoDelegations[1] = _createAllowanceDelegation(true, address(0), 1 ether);
        bytes memory args = abi.encode(twoDelegations);

        vm.prank(address(delegationManager));
        vm.expectRevert("PragmaFeeEnforcer:must-have-single-allowance-delegation");
        enforcer.afterAllHook(
            terms,
            args,
            ModeLib.encodeSimpleSingle(),
            "",
            DELEGATION_HASH,
            user,
            sessionKey
        );
    }

    function test_Constructor_RevertsIfTreasuryIsContract() public {
        // Deploy a mock contract to use as treasury
        MockERC20 contractTreasury = new MockERC20("Treasury", "TRES");

        vm.expectRevert("PragmaFeeEnforcer:treasury-must-be-eoa");
        new PragmaFeeEnforcer(
            IDelegationManager(address(delegationManager)),
            argsEqualityCheckEnforcer,
            address(contractTreasury) // Contract address, not EOA
        );
    }

    function test_AfterAllHook_RevertsIfFeeExceedsMaximum() public {
        uint256 excessiveFee = 1001 ether; // Exceeds MAX_FEE_AMOUNT (1000 ether)

        bytes memory terms = abi.encodePacked(uint8(1), address(0), excessiveFee);
        Delegation memory allowanceDelegation = _createAllowanceDelegation(true, address(0), excessiveFee);
        bytes memory args = abi.encode(_wrapDelegationArray(allowanceDelegation));

        vm.prank(address(delegationManager));
        vm.expectRevert("PragmaFeeEnforcer:fee-exceeds-maximum");
        enforcer.afterAllHook(
            terms,
            args,
            ModeLib.encodeSimpleSingle(),
            "",
            DELEGATION_HASH,
            user,
            sessionKey
        );
    }

    function test_AfterAllHook_AcceptsMaximumFeeAmount() public {
        uint256 maxFee = 1000 ether; // Exactly MAX_FEE_AMOUNT

        bytes memory terms = abi.encodePacked(uint8(1), address(0), maxFee);
        Delegation memory allowanceDelegation = _createAllowanceDelegation(true, address(0), maxFee);
        bytes memory args = abi.encode(_wrapDelegationArray(allowanceDelegation));

        vm.deal(address(delegationManager), maxFee);
        delegationManager.setupNativePayment(maxFee);

        vm.prank(address(delegationManager));
        enforcer.afterAllHook(
            terms,
            args,
            ModeLib.encodeSimpleSingle(),
            "",
            DELEGATION_HASH,
            user,
            sessionKey
        );

        // Should succeed
        assertEq(treasury.balance, maxFee);
    }

    ////////////////////////////// Helper Functions //////////////////////////////

    function _createAllowanceDelegation(
        bool isNative,
        address token,
        uint256 amount
    ) internal view returns (Delegation memory) {
        Caveat[] memory caveats = new Caveat[](1);
        caveats[0] = Caveat({
            args: hex"", // Will be set by enforcer
            enforcer: argsEqualityCheckEnforcer,
            terms: hex""
        });

        return Delegation({
            delegate: sessionKey,
            delegator: user,
            authority: hex"",
            caveats: caveats,
            salt: 0,
            signature: hex""
        });
    }

    function _wrapDelegationArray(Delegation memory delegation) internal pure returns (Delegation[] memory) {
        Delegation[] memory delegations = new Delegation[](1);
        delegations[0] = delegation;
        return delegations;
    }
}

/**
 * @title MockDelegationManager
 * @notice Mock contract that simulates delegation manager payment execution
 */
contract MockDelegationManager {
    address payable public treasury;
    uint256 public nativeAmount;
    address public erc20Token;
    uint256 public erc20Amount;

    constructor(address payable _treasury) {
        treasury = _treasury;
    }

    function setupNativePayment(uint256 _amount) external {
        nativeAmount = _amount;
    }

    function setupERC20Payment(address _token, uint256 _amount) external {
        erc20Token = _token;
        erc20Amount = _amount;
    }

    function redeemDelegations(
        bytes[] calldata,
        ModeCode[] calldata,
        bytes[] calldata
    ) external {
        // Send native payment if configured
        if (nativeAmount > 0) {
            treasury.transfer(nativeAmount);
            nativeAmount = 0;
        }

        // Send ERC20 payment if configured
        if (erc20Amount > 0) {
            IERC20(erc20Token).transfer(treasury, erc20Amount);
            erc20Amount = 0;
        }
    }

    receive() external payable {}
}

/**
 * @title MockERC20
 * @notice Simple ERC20 mock for testing
 */
contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

/**
 * @title MockFeeOnTransferToken
 * @notice Mock ERC20 token that charges a fee on transfers (for testing fee-on-transfer support)
 */
contract MockFeeOnTransferToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    uint256 public feePercentage; // Fee percentage (e.g., 10 = 10%)

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint256 _feePercentage) {
        name = _name;
        symbol = _symbol;
        feePercentage = _feePercentage;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        uint256 fee = (amount * feePercentage) / 100;
        uint256 amountAfterFee = amount - fee;

        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amountAfterFee;
        // Fee is burned (removed from total supply)

        emit Transfer(msg.sender, to, amountAfterFee);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 fee = (amount * feePercentage) / 100;
        uint256 amountAfterFee = amount - fee;

        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amountAfterFee;
        // Fee is burned (removed from total supply)

        emit Transfer(from, to, amountAfterFee);
        return true;
    }
}

/**
 * @title MockBalanceManipulationToken
 * @notice Malicious ERC20 token that can decrease treasury balance during transfer
 * @dev Used to test H-02 fix (balance decrease protection)
 */
contract MockBalanceManipulationToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;

    address public targetTreasury;
    bool public manipulationEnabled;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(address _treasury) {
        name = "Malicious Token";
        symbol = "MAL";
        targetTreasury = _treasury;
    }

    function enableBalanceManipulation(bool _enabled) external {
        manipulationEnabled = _enabled;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        if (manipulationEnabled && to == targetTreasury) {
            // Malicious: decrease treasury balance instead of increasing
            balanceOf[msg.sender] -= amount;
            if (balanceOf[to] >= amount) {
                balanceOf[to] -= amount; // DECREASE instead of increase
            }
            emit Transfer(msg.sender, to, amount);
            return true;
        }

        // Normal transfer
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (manipulationEnabled && to == targetTreasury) {
            // Malicious: decrease treasury balance instead of increasing
            allowance[from][msg.sender] -= amount;
            balanceOf[from] -= amount;
            if (balanceOf[to] >= amount) {
                balanceOf[to] -= amount; // DECREASE instead of increase
            }
            emit Transfer(from, to, amount);
            return true;
        }

        // Normal transfer
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}
