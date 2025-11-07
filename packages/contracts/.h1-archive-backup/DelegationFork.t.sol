// SPDX-License-Identifier: MIT AND Apache-2.0
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {DelegationManager} from "@delegation-framework/DelegationManager.sol";
import {Delegation, Caveat} from "@delegation-framework/utils/Types.sol";
import {ModeCode, ModeLib} from "@erc7579/lib/ModeLib.sol";
import {ExecutionLib} from "@erc7579/lib/ExecutionLib.sol";

interface INonceEnforcer {
    function incrementNonce(address delegationManager) external;
}

interface ILimitedCallsEnforcer {
    function callCounts(address delegationManager, bytes32 delegationHash) external view returns (uint256);
}

interface IQuoterV2 {
    function quoteExactInputSingle(address, address, uint24, uint256, uint160) external returns (uint256);
}

interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

contract DelegationForkTest is Test {
    address internal constant DELEGATION_MANAGER = 0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3;
    address internal constant TIMESTAMP_ENFORCER = 0x1046bb45C8d673d4ea75321280DB34899413c069;
    address internal constant LIMITED_CALLS_ENFORCER = 0x04658B29F6b82ed55274221a06Fc97D318E25416;
    address internal constant NONCE_ENFORCER = 0xDE4f2FAC4B3D87A1d9953Ca5FC09FCa7F366254f;
    address internal constant ERC20_TRANSFER_AMOUNT_ENFORCER = 0xf100b0819427117EcF76Ed94B358B1A5b5C6D2Fc;
    address internal constant NATIVE_TRANSFER_AMOUNT_ENFORCER = 0xF71af580b9c3078fbc2BBF16FbB8EEd82b330320;
    address internal constant ALLOWED_TARGETS_ENFORCER = 0x7F20f61b1f09b08D970938F6fa563634d65c4EeB;
    address internal constant ALLOWED_METHODS_ENFORCER = 0x2c21fD0Cb9DC8445CB3fb0DC5E7Bb0Aca01842B5;
    address internal constant ALLOWED_CALLDATA_ENFORCER = 0xc2b0d624c1c4319760C96503BA27C347F3260f55;

    address internal constant QUOTER_V2 = 0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3;
    address internal constant SWAP_ROUTER = 0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E;
    address internal constant WETH_SEPOLIA = 0xDd13e55209f9BFD90c7f839f57F2cBeAf5f5144F;

    uint24 internal constant POOL_FEE = 500;

    DelegationManager internal manager = DelegationManager(DELEGATION_MANAGER);
    INonceEnforcer internal nonceEnforcer = INonceEnforcer(NONCE_ENFORCER);
    ILimitedCallsEnforcer internal limitedCalls = ILimitedCallsEnforcer(LIMITED_CALLS_ENFORCER);
    IQuoterV2 internal quoter = IQuoterV2(QUOTER_V2);

    MockERC20 internal safeTokenIn;
    MockERC20 internal safeTokenOut;
    MockERC20 internal normalTokenIn;
    MockERC20 internal normalTokenOut;

    MockDelegator internal delegator;

    bytes4 internal constant EXACT_INPUT_SINGLE_SELECTOR = ISwapRouter.exactInputSingle.selector;

    uint256 internal constant SAFE_TTL = 1 hours;
    uint256 internal constant NORMAL_TTL = 1 days;

    ModeCode internal defaultMode;

    function setUp() public {
        vm.createSelectFork(vm.envString("SEPOLIA_RPC_URL"));

        defaultMode = ModeLib.encodeSimpleSingle();

        delegator = new MockDelegator();

        safeTokenIn = new MockERC20("SafeIn", "SAFIN", 18);
        safeTokenOut = new MockERC20("SafeOut", "SAFOUT", 18);
        normalTokenIn = new MockERC20("NormalIn", "NRMIN", 18);
        normalTokenOut = new MockERC20("NormalOut", "NRMOUT", 18);

        safeTokenIn.mint(address(delegator), 1_000 ether);
        normalTokenIn.mint(address(delegator), 1_000 ether);

        vm.prank(address(delegator));
        safeTokenIn.approve(SWAP_ROUTER, type(uint256).max);

        vm.prank(address(delegator));
        normalTokenIn.approve(SWAP_ROUTER, type(uint256).max);
    }

    /*//////////////////////////////////////////////////////////////
                             SAFE MODE TESTS
    //////////////////////////////////////////////////////////////*/

    function testSafeMode_SwapExactInputSingle_PairPinned() public {
        bytes memory swapCalldata =
            _prepareSwap(address(safeTokenIn), address(safeTokenOut), 10 ether, 9 ether, block.timestamp + 15 minutes);

        uint256 quoted =
            quoter.quoteExactInputSingle(address(safeTokenIn), address(safeTokenOut), POOL_FEE, 10 ether, 0);
        assertEq(quoted, 9 ether, "quote mismatch");

        Caveat[] memory caveats = _safeModeCaveats(address(safeTokenIn), address(safeTokenOut));

        vm.expectCall(SWAP_ROUTER, swapCalldata);
        bytes32 hash = _executeDelegation(caveats, _routerExecution(swapCalldata));

        assertEq(limitedCalls.callCounts(DELEGATION_MANAGER, hash), 1, "safe limited calls");
    }

    function testSafeMode_SwapExactInputSingle_WethOut() public {
        bytes memory swapCalldata =
            _prepareSwap(address(safeTokenIn), WETH_SEPOLIA, 5 ether, 4 ether, block.timestamp + 10 minutes);

        Caveat[] memory caveats = _safeModeCaveats(address(safeTokenIn), WETH_SEPOLIA);

        vm.expectCall(SWAP_ROUTER, swapCalldata);
        _executeDelegation(caveats, _routerExecution(swapCalldata));
    }

    function testSafeMode_Erc20TransferWithinCap() public {
        Caveat[] memory caveats = _erc20TransferCaveats(address(safeTokenIn), 20 ether);
        bytes memory execution = ExecutionLib.encodeSingle(
            address(safeTokenIn), 0, abi.encodeWithSelector(IERC20.transfer.selector, address(0xBEEF), 10 ether)
        );

        vm.expectCall(address(safeTokenIn), abi.encodeWithSelector(IERC20.transfer.selector, address(0xBEEF), 10 ether));
        _executeDelegation(caveats, execution);

        assertEq(safeTokenIn.balanceOf(address(0xBEEF)), 10 ether, "transfer succeeded");
    }

    function testSafeMode_Erc20TransferAboveCapReverts() public {
        Caveat[] memory caveats = _erc20TransferCaveats(address(safeTokenIn), 5 ether);
        bytes memory execution = ExecutionLib.encodeSingle(
            address(safeTokenIn), 0, abi.encodeWithSelector(IERC20.transfer.selector, address(0xBEEF), 6 ether)
        );

        _expectDelegationRevert(caveats, execution);
    }

    function testSafeMode_RevertTTLExpired() public {
        Caveat[] memory caveats = _safeModeCaveats(address(safeTokenIn), address(safeTokenOut));
        bytes memory swapCalldata = _routerCalldata(
            address(safeTokenIn), address(safeTokenOut), 1 ether, 0.9 ether, block.timestamp + 5 minutes
        );

        vm.warp(block.timestamp + SAFE_TTL + 1);
        _expectDelegationRevert(caveats, _routerExecution(swapCalldata));
    }

    function testSafeMode_RevertLimitedCallsExceeded() public {
        Caveat[] memory caveats = _safeModeCaveats(address(safeTokenIn), address(safeTokenOut));
        bytes memory swapCalldata =
            _prepareSwap(address(safeTokenIn), address(safeTokenOut), 1 ether, 0.9 ether, block.timestamp + 30 minutes);
        bytes32 hash = _executeDelegation(caveats, _routerExecution(swapCalldata));
        assertEq(limitedCalls.callCounts(DELEGATION_MANAGER, hash), 1, "safe limit count");

        _expectDelegationRevert(caveats, _routerExecution(swapCalldata));
    }

    function testSafeMode_RevertNonceMismatch() public {
        Caveat[] memory caveats = _safeModeCaveats(address(safeTokenIn), address(safeTokenOut));
        bytes memory swapCalldata =
            _prepareSwap(address(safeTokenIn), address(safeTokenOut), 1 ether, 0.9 ether, block.timestamp + 30 minutes);
        vm.prank(address(delegator));
        nonceEnforcer.incrementNonce(DELEGATION_MANAGER);
        _expectDelegationRevert(caveats, _routerExecution(swapCalldata));
    }

    function testSafeMode_RevertNonRouterTarget() public {
        Caveat[] memory caveats = _safeModeCaveats(address(safeTokenIn), address(safeTokenOut));
        _expectDelegationRevert(caveats, ExecutionLib.encodeSingle(address(0xBEEF), 0, bytes("")));
    }

    /*//////////////////////////////////////////////////////////////
                           NORMAL MODE TESTS
    //////////////////////////////////////////////////////////////*/

    function testNormalMode_SwapExactInputSingle_PinsTokenOut() public {
        bytes memory swapCalldata =
            _prepareSwap(address(normalTokenIn), address(normalTokenOut), 8 ether, 7 ether, block.timestamp + 1 days);

        Caveat[] memory caveats = _normalModeCaveats(address(normalTokenOut));

        vm.expectCall(SWAP_ROUTER, swapCalldata);
        bytes32 hash = _executeDelegation(caveats, _routerExecution(swapCalldata));

        assertEq(limitedCalls.callCounts(DELEGATION_MANAGER, hash), 1, "normal limited calls");
    }

    function testNormalMode_SwapExactInputSingle_WethOut() public {
        bytes memory swapCalldata =
            _prepareSwap(address(normalTokenIn), WETH_SEPOLIA, 4 ether, 3 ether, block.timestamp + 12 hours);

        Caveat[] memory caveats = _normalModeCaveats(WETH_SEPOLIA);

        vm.expectCall(SWAP_ROUTER, swapCalldata);
        _executeDelegation(caveats, _routerExecution(swapCalldata));
    }

    function testNormalMode_Erc20TransferWithinCap() public {
        Caveat[] memory caveats = _erc20TransferCaveats(address(normalTokenIn), 40 ether);
        bytes memory execution = ExecutionLib.encodeSingle(
            address(normalTokenIn), 0, abi.encodeWithSelector(IERC20.transfer.selector, address(0xCAFE), 30 ether)
        );

        vm.expectCall(
            address(normalTokenIn), abi.encodeWithSelector(IERC20.transfer.selector, address(0xCAFE), 30 ether)
        );
        _executeDelegation(caveats, execution);
        assertEq(normalTokenIn.balanceOf(address(0xCAFE)), 30 ether, "normal transfer");
    }

    function testNormalMode_RevertTTLExpired() public {
        Caveat[] memory caveats = _normalModeCaveats(address(normalTokenOut));
        bytes memory swapCalldata = _routerCalldata(
            address(normalTokenIn), address(normalTokenOut), 1 ether, 0.8 ether, block.timestamp + 1 hours
        );

        vm.warp(block.timestamp + NORMAL_TTL + 1);
        _expectDelegationRevert(caveats, _routerExecution(swapCalldata));
    }

    function testNormalMode_RevertLimitedCallsExceeded() public {
        Caveat[] memory caveats = _normalModeCaveats(address(normalTokenOut));
        bytes memory swapCalldata =
            _prepareSwap(address(normalTokenIn), address(normalTokenOut), 1 ether, 0.8 ether, block.timestamp + 1 days);
        bytes32 hash = _executeDelegation(caveats, _routerExecution(swapCalldata));
        _executeDelegation(caveats, _routerExecution(swapCalldata));
        _executeDelegation(caveats, _routerExecution(swapCalldata));
        assertEq(limitedCalls.callCounts(DELEGATION_MANAGER, hash), 3, "normal limit count");

        _expectDelegationRevert(caveats, _routerExecution(swapCalldata));
    }

    function testNormalMode_RevertNonceMismatch() public {
        Caveat[] memory caveats = _normalModeCaveats(address(normalTokenOut));
        bytes memory swapCalldata =
            _prepareSwap(address(normalTokenIn), address(normalTokenOut), 1 ether, 0.8 ether, block.timestamp + 1 days);
        vm.prank(address(delegator));
        nonceEnforcer.incrementNonce(DELEGATION_MANAGER);
        _expectDelegationRevert(caveats, _routerExecution(swapCalldata));
    }

    function testNormalMode_RevertNonRouterTarget() public {
        Caveat[] memory caveats = _normalModeCaveats(address(normalTokenOut));
        _expectDelegationRevert(caveats, ExecutionLib.encodeSingle(address(0xF00D), 0, bytes("")));
    }

    /*//////////////////////////////////////////////////////////////
                      NATIVE TOKEN TRANSFER TESTS
    //////////////////////////////////////////////////////////////*/

    function testNativeTransferWithinCap() public {
        Caveat[] memory caveats = _nativeTransferCaveats(0.2 ether, 1);
        vm.deal(address(delegator), 1 ether);
        _executeDelegation(caveats, ExecutionLib.encodeSingle(address(0xABCD), 0.1 ether, bytes("")));
        assertEq(address(0xABCD).balance, 0.1 ether, "native transfer");
    }

    function testNativeTransferAboveCapReverts() public {
        Caveat[] memory caveats = _nativeTransferCaveats(0.1 ether, 1);
        vm.deal(address(delegator), 1 ether);
        _expectDelegationRevert(caveats, ExecutionLib.encodeSingle(address(0xABCD), 0.2 ether, bytes("")));
    }

    /*//////////////////////////////////////////////////////////////
                             HELPERS
    //////////////////////////////////////////////////////////////*/

    function _buildParams(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, uint256 deadline)
        internal
        view
        returns (ISwapRouter.ExactInputSingleParams memory params)
    {
        params = ISwapRouter.ExactInputSingleParams({
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: POOL_FEE,
            recipient: address(delegator),
            deadline: deadline,
            amountIn: amountIn,
            amountOutMinimum: minOut,
            sqrtPriceLimitX96: 0
        });
    }

    function _mockQuoteAndSwap(ISwapRouter.ExactInputSingleParams memory params, uint256 amountOut) internal {
        bytes memory quoteCall = abi.encodeWithSelector(
            IQuoterV2.quoteExactInputSingle.selector,
            params.tokenIn,
            params.tokenOut,
            POOL_FEE,
            params.amountIn,
            uint160(0)
        );
        vm.mockCall(QUOTER_V2, quoteCall, abi.encode(amountOut));

        bytes memory swapCalldata = abi.encodeWithSelector(EXACT_INPUT_SINGLE_SELECTOR, params);
        vm.mockCall(SWAP_ROUTER, swapCalldata, abi.encode(amountOut));
    }

    function _prepareSwap(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 deadline)
        internal
        returns (bytes memory swapCalldata)
    {
        ISwapRouter.ExactInputSingleParams memory params =
            _buildParams(tokenIn, tokenOut, amountIn, amountOut, deadline);
        _mockQuoteAndSwap(params, amountOut);
        swapCalldata = abi.encodeWithSelector(EXACT_INPUT_SINGLE_SELECTOR, params);
    }

    function _timestampCaveat(uint256 ttl) internal view returns (Caveat memory) {
        uint128 afterThreshold = 0;
        uint128 beforeThreshold = uint128(block.timestamp + ttl);
        return Caveat({
            enforcer: TIMESTAMP_ENFORCER,
            terms: abi.encodePacked(afterThreshold, beforeThreshold),
            args: bytes("")
        });
    }

    function _limitedCallsCaveat(uint256 limit) internal pure returns (Caveat memory) {
        return Caveat({enforcer: LIMITED_CALLS_ENFORCER, terms: abi.encodePacked(limit), args: bytes("")});
    }

    function _nonceCaveat(uint256 nonceValue) internal pure returns (Caveat memory) {
        return Caveat({enforcer: NONCE_ENFORCER, terms: abi.encodePacked(nonceValue), args: bytes("")});
    }

    function _allowedTargetCaveat() internal pure returns (Caveat memory) {
        return Caveat({enforcer: ALLOWED_TARGETS_ENFORCER, terms: abi.encodePacked(SWAP_ROUTER), args: bytes("")});
    }

    function _allowedMethodCaveat() internal pure returns (Caveat memory) {
        return Caveat({
            enforcer: ALLOWED_METHODS_ENFORCER,
            terms: abi.encodePacked(EXACT_INPUT_SINGLE_SELECTOR),
            args: bytes("")
        });
    }

    function _calldataPin(address value, uint256 wordIndex) internal pure returns (Caveat memory) {
        uint256 offset = 4 + wordIndex * 32;
        bytes memory expected = abi.encodePacked(bytes32(uint256(uint160(value))));
        bytes memory terms = abi.encodePacked(bytes32(offset), expected);
        return Caveat({enforcer: ALLOWED_CALLDATA_ENFORCER, terms: terms, args: bytes("")});
    }

    function _safeModeCaveats(address tokenIn, address tokenOut) internal view returns (Caveat[] memory caveats) {
        caveats = new Caveat[](7);
        caveats[0] = _timestampCaveat(SAFE_TTL);
        caveats[1] = _limitedCallsCaveat(1);
        caveats[2] = _nonceCaveat(0);
        caveats[3] = _allowedTargetCaveat();
        caveats[4] = _allowedMethodCaveat();
        caveats[5] = _calldataPin(tokenIn, 0);
        caveats[6] = _calldataPin(tokenOut, 1);
    }

    function _normalModeCaveats(address tokenOut) internal view returns (Caveat[] memory caveats) {
        caveats = new Caveat[](6);
        caveats[0] = _timestampCaveat(NORMAL_TTL);
        caveats[1] = _limitedCallsCaveat(3);
        caveats[2] = _nonceCaveat(0);
        caveats[3] = _allowedTargetCaveat();
        caveats[4] = _allowedMethodCaveat();
        caveats[5] = _calldataPin(tokenOut, 1);
    }

    function _erc20TransferCaveats(address token, uint256 cap) internal view returns (Caveat[] memory caveats) {
        caveats = new Caveat[](3);
        caveats[0] = _timestampCaveat(SAFE_TTL);
        caveats[1] = _limitedCallsCaveat(2);
        caveats[2] =
            Caveat({enforcer: ERC20_TRANSFER_AMOUNT_ENFORCER, terms: abi.encodePacked(token, cap), args: bytes("")});
    }

    function _nativeTransferCaveats(uint256 cap, uint256 callLimit) internal view returns (Caveat[] memory caveats) {
        caveats = new Caveat[](3);
        caveats[0] = _timestampCaveat(SAFE_TTL);
        caveats[1] = _limitedCallsCaveat(callLimit);
        caveats[2] = Caveat({enforcer: NATIVE_TRANSFER_AMOUNT_ENFORCER, terms: abi.encode(cap), args: bytes("")});
    }

    function _routerCalldata(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        ISwapRouter.ExactInputSingleParams memory params = _buildParams(tokenIn, tokenOut, amountIn, minOut, deadline);
        return abi.encodeWithSelector(EXACT_INPUT_SINGLE_SELECTOR, params);
    }

    function _routerExecution(bytes memory callData) internal pure returns (bytes memory) {
        return ExecutionLib.encodeSingle(SWAP_ROUTER, 0, callData);
    }

    function _buildDelegationPayload(Caveat[] memory caveats, bytes memory execution)
        internal
        view
        returns (bytes[] memory contexts, ModeCode[] memory modes, bytes[] memory executions, bytes32 delegationHash)
    {
        Delegation[] memory delegations = new Delegation[](1);
        delegations[0] = Delegation({
            delegate: address(this),
            delegator: address(delegator),
            authority: manager.ROOT_AUTHORITY(),
            caveats: caveats,
            salt: 0,
            signature: hex""
        });

        delegationHash = manager.getDelegationHash(delegations[0]);

        contexts = new bytes[](1);
        contexts[0] = abi.encode(delegations);

        modes = new ModeCode[](1);
        modes[0] = defaultMode;

        executions = new bytes[](1);
        executions[0] = execution;
    }

    function _executeDelegation(Caveat[] memory caveats, bytes memory execution)
        internal
        returns (bytes32 delegationHash)
    {
        bytes[] memory contexts;
        ModeCode[] memory modes;
        bytes[] memory executions;
        (contexts, modes, executions, delegationHash) = _buildDelegationPayload(caveats, execution);

        manager.redeemDelegations(contexts, modes, executions);
    }

    function _expectDelegationRevert(Caveat[] memory caveats, bytes memory execution) internal {
        (bytes[] memory contexts, ModeCode[] memory modes, bytes[] memory executions,) =
            _buildDelegationPayload(caveats, execution);
        try manager.redeemDelegations(contexts, modes, executions) {
            fail("expected delegation to revert");
        } catch {}
    }
}

contract MockERC20 is IERC20 {
    string public name;
    string public symbol;
    uint8 public immutable decimals;

    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    function totalSupply() external pure override returns (uint256) {
        return 0;
    }

    function transfer(address to, uint256 amount) external override returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function approve(address spender, uint256 amount) external override returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "MockERC20:allowance");
        allowance[from][msg.sender] = allowed - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }
}

contract MockDelegator {
    using ExecutionLib for bytes;

    function executeFromExecutor(ModeCode, bytes calldata executionCalldata)
        external
        payable
        returns (bytes[] memory returnData)
    {
        (address target, uint256 value, bytes memory data) = executionCalldata.decodeSingle();
        (bool success, bytes memory result) = target.call{value: value}(data);
        require(success, "MockDelegator:execution-failed");
        returnData = new bytes[](1);
        returnData[0] = result;
    }

    function isValidSignature(bytes32, bytes calldata) external pure returns (bytes4) {
        return 0x1626ba7e;
    }

    receive() external payable {}
}
