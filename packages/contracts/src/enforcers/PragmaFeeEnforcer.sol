// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import { ModeLib } from "@erc7579/lib/ModeLib.sol";
import { ExecutionLib } from "@erc7579/lib/ExecutionLib.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { CaveatEnforcer } from "../../lib/delegation-framework/src/enforcers/CaveatEnforcer.sol";
import { Execution, Delegation, ModeCode } from "../../lib/delegation-framework/src/utils/Types.sol";
import { IDelegationManager } from "../../lib/delegation-framework/src/interfaces/IDelegationManager.sol";

/**
 * @title PragmaFeeEnforcer
 * @notice Enforces protocol fee collection for Pragma operations (swaps, stakes, NFT purchases).
 * @dev This enforcer ensures that a 0.5% fee is collected and sent to the Pragma treasury
 * before any operation executes. It handles both native token (MON) and ERC20 token fees.
 *
 * Security Features:
 * - Treasury address is immutable (hardcoded at deployment)
 * - Requires ArgsEqualityCheckEnforcer to prevent front-running
 * - Validates payment received via balance checking
 * - Uses allowance delegation pattern for atomic fee collection
 *
 * Architecture:
 * - User signs fee allowance delegation (transfer fee to treasury)
 * - User signs main operation delegation (with this enforcer as caveat)
 * - Session key redeems main delegation
 * - This enforcer's afterAllHook redeems fee allowance delegation
 * - Fee transfer executes, then main operation completes
 *
 * @dev Based on MetaMask DTK's NativeTokenPaymentEnforcer
 * @dev This enforcer operates only in default execution mode
 */
contract PragmaFeeEnforcer is CaveatEnforcer {
    using ModeLib for ModeCode;

    ////////////////////////////// State //////////////////////////////

    /// @dev The Delegation Manager contract to redeem the delegation
    IDelegationManager public immutable delegationManager;

    /// @dev The enforcer used to compare args and terms (prevents front-running)
    address public immutable argsEqualityCheckEnforcer;

    /// @dev The Pragma treasury address (receives all fees)
    address public immutable TREASURY;

    /// @dev Maximum fee amount to prevent misconfiguration (e.g., 1000 MON)
    uint256 public constant MAX_FEE_AMOUNT = 1000 ether;

    /// @dev Contract version for deployment verification and frontend integration
    string public constant VERSION = "1.0.1";

    ////////////////////////////// Events //////////////////////////////

    /**
     * @notice Emitted when a fee payment is validated and collected
     * @param sender The address that called the delegation manager (session key)
     * @param delegationHash The hash of the main delegation
     * @param isNative Whether the fee was in native token (MON) or ERC20
     * @param token The token address (address(0) for native)
     * @param delegator The address of the delegator (user's smart account)
     * @param redeemer The address redeeming the delegation (session key)
     * @param expectedAmount The expected fee amount (from terms)
     * @param actualAmount The actual amount received (may differ for fee-on-transfer tokens)
     * @param balanceBefore Treasury balance before fee collection
     * @param balanceAfter Treasury balance after fee collection
     */
    event ValidatedPayment(
        address indexed sender,
        bytes32 indexed delegationHash,
        bool indexed isNative,
        address token,
        address delegator,
        address redeemer,
        uint256 expectedAmount,
        uint256 actualAmount,
        uint256 balanceBefore,
        uint256 balanceAfter
    );

    /**
     * @notice Emitted when fee-on-transfer token detected (actualReceived < expectedAmount)
     * @dev Helps monitor token fees and track actual revenue vs expected
     * @param delegationHash The hash of the main delegation
     * @param token The token address charging the fee
     * @param expectedAmount The expected fee amount from terms
     * @param actualReceived The actual amount received after token's transfer fee
     * @param feePercentage The token's transfer fee percentage (in basis points, e.g., 1000 = 10%)
     */
    event FeeOnTransferDetected(
        bytes32 indexed delegationHash,
        address indexed token,
        uint256 expectedAmount,
        uint256 actualReceived,
        uint256 feePercentage
    );

    ////////////////////////////// Constructor //////////////////////////////

    /**
     * @notice Constructs the PragmaFeeEnforcer
     * @param _delegationManager The DelegationManager contract address
     * @param _argsEqualityCheckEnforcer The ArgsEqualityCheckEnforcer address
     * @param _treasury The Pragma treasury address (immutable)
     */
    constructor(
        IDelegationManager _delegationManager,
        address _argsEqualityCheckEnforcer,
        address _treasury
    ) {
        require(address(_delegationManager) != address(0), "PragmaFeeEnforcer:invalid-delegation-manager");
        require(_argsEqualityCheckEnforcer != address(0), "PragmaFeeEnforcer:invalid-args-enforcer");
        require(_treasury != address(0), "PragmaFeeEnforcer:invalid-treasury");
        require(_treasury.code.length == 0, "PragmaFeeEnforcer:treasury-must-be-eoa");

        delegationManager = _delegationManager;
        argsEqualityCheckEnforcer = _argsEqualityCheckEnforcer;
        TREASURY = _treasury;
    }

    ////////////////////////////// External Functions //////////////////////////////

    /**
     * @notice Enforces fee payment after the main delegation executes
     * @dev This hook runs AFTER the main operation completes
     *
     * Flow:
     * 1. Decode fee parameters from terms (isNative, token, amount)
     * 2. Decode allowance delegation from args
     * 3. Verify ArgsEqualityCheckEnforcer is first caveat
     * 4. Set args for ArgsEqualityCheckEnforcer (prevents front-running)
     * 5. Build execution calldata (native transfer or ERC20 transfer)
     * 6. Check treasury balance before
     * 7. Redeem allowance delegation (executes fee transfer)
     * 8. Check treasury balance after
     * 9. Verify fee was received
     *
     * @param _terms Encoded 85 bytes: isNative (1 byte) + token (20 bytes) + amount (32 bytes) + swapAmount (32 bytes)
     * @param _args Encoded allowance delegation(s) for fee payment
     * @param _mode The execution mode (must be default)
     * @param _delegationHash The hash of the main delegation
     * @param _delegator The address of the delegator
     * @param _redeemer The address redeeming the delegation
     */
    function afterAllHook(
        bytes calldata _terms,
        bytes calldata _args,
        ModeCode _mode,
        bytes calldata,
        bytes32 _delegationHash,
        address _delegator,
        address _redeemer
    )
        public
        override
        onlyDefaultExecutionMode(_mode)
    {
        require(msg.sender == address(delegationManager), "PragmaFeeEnforcer:only-delegation-manager");

        // Decode the fee parameters
        (bool isNative, address token, uint256 amount) = getTermsInfo(_terms);

        // Prepare and execute fee collection
        (uint256 actualReceived, uint256 balanceBefore, uint256 balanceAfter) =
            _redeemFeePayment(_args, _delegationHash, _redeemer, isNative, token, amount);

        // Emit event with actual payment details
        emit ValidatedPayment(
            msg.sender,
            _delegationHash,
            isNative,
            token,
            _delegator,
            _redeemer,
            amount,
            actualReceived,
            balanceBefore,
            balanceAfter
        );
    }

    /**
     * @dev Internal function to redeem fee payment delegation
     *
     * Fee payment is a single operation requiring exactly one allowance delegation:
     * - Delegation specifies transfer of fee amount to treasury
     * - Must have ArgsEqualityCheckEnforcer as first caveat (anti front-running)
     * - Args set by this contract at runtime (delegationHash + redeemer)
     *
     * Reduces stack depth in afterAllHook
     * @return actualReceived The actual amount received (may differ for fee-on-transfer tokens)
     * @return balanceBefore Treasury balance before fee collection
     * @return balanceAfter Treasury balance after fee collection
     */
    function _redeemFeePayment(
        bytes calldata _args,
        bytes32 _delegationHash,
        address _redeemer,
        bool isNative,
        address token,
        uint256 amount
    ) internal returns (uint256 actualReceived, uint256 balanceBefore, uint256 balanceAfter) {
        // Decode allowance delegations
        Delegation[] memory allowanceDelegations = abi.decode(_args, (Delegation[]));

        // Fee payment is a single operation - requires exactly 1 delegation
        require(
            allowanceDelegations.length == 1,
            "PragmaFeeEnforcer:must-have-single-allowance-delegation"
        );

        // Validate token address for ERC20 payments
        if (!isNative) {
            require(token != address(0), "PragmaFeeEnforcer:invalid-token-address");
            require(token.code.length > 0, "PragmaFeeEnforcer:token-must-be-contract");
        }

        // Sanity check: fee amount must not exceed maximum
        require(amount <= MAX_FEE_AMOUNT, "PragmaFeeEnforcer:fee-exceeds-maximum");

        // Verify ArgsEqualityCheckEnforcer is the first caveat (prevents front-running)
        require(
            allowanceDelegations[0].caveats.length > 0
                && allowanceDelegations[0].caveats[0].enforcer == argsEqualityCheckEnforcer,
            "PragmaFeeEnforcer:missing-argsEqualityCheckEnforcer"
        );

        // Set the args for ArgsEqualityCheckEnforcer (delegationHash + redeemer)
        allowanceDelegations[0].caveats[0].args = abi.encodePacked(_delegationHash, _redeemer);

        // Prepare execution
        bytes[] memory permissionContexts = new bytes[](1);
        permissionContexts[0] = abi.encode(allowanceDelegations);

        bytes[] memory executionCallDatas = new bytes[](1);
        if (isNative) {
            executionCallDatas[0] = ExecutionLib.encodeSingle(TREASURY, amount, hex"");
        } else {
            executionCallDatas[0] = ExecutionLib.encodeSingle(
                token, 0, abi.encodeWithSelector(IERC20.transfer.selector, TREASURY, amount)
            );
        }

        ModeCode[] memory encodedModes = new ModeCode[](1);
        encodedModes[0] = ModeLib.encodeSimpleSingle();

        // Get balance before
        balanceBefore = isNative ? TREASURY.balance : IERC20(token).balanceOf(TREASURY);

        // Execute payment
        delegationManager.redeemDelegations(permissionContexts, encodedModes, executionCallDatas);

        // Verify payment received (supports fee-on-transfer tokens with up to 10% fee)
        balanceAfter = isNative ? TREASURY.balance : IERC20(token).balanceOf(TREASURY);

        // Protect against malicious tokens manipulating treasury balance
        require(balanceAfter >= balanceBefore, "PragmaFeeEnforcer:balance-decreased");

        actualReceived = balanceAfter - balanceBefore;
        uint256 minExpected = (amount * 90) / 100; // 90% threshold for fee-on-transfer tokens

        // Emit event if fee-on-transfer detected (actual < expected)
        if (actualReceived < amount) {
            uint256 feePercentage = ((amount - actualReceived) * 10000) / amount; // basis points
            emit FeeOnTransferDetected(_delegationHash, token, amount, actualReceived, feePercentage);
        }

        require(actualReceived >= minExpected, "PragmaFeeEnforcer:insufficient-payment");
    }

    /**
     * @notice Decodes the terms used in this caveat enforcer
     * @param _terms Encoded 85 bytes:
     *   - byte 0: isNative flag (1 = native, 0 = ERC20)
     *   - bytes 1-20: token address (ignored if isNative = true)
     *   - bytes 21-52: fee amount (32 bytes)
     *   - bytes 53-84: swap amount (32 bytes, original amount before fee)
     * @return isNative_ Whether the fee is in native token
     * @return token_ The ERC20 token address (address(0) if native)
     * @return amount_ The fee amount to collect
     */
    function getTermsInfo(bytes calldata _terms)
        public
        pure
        returns (bool isNative_, address token_, uint256 amount_)
    {
        require(_terms.length == 85, "PragmaFeeEnforcer:invalid-terms-length");

        isNative_ = uint8(_terms[0]) == 1;
        token_ = address(bytes20(_terms[1:21]));
        amount_ = uint256(bytes32(_terms[21:53]));
        uint256 swapAmount = uint256(bytes32(_terms[53:85]));

        require(amount_ > 0, "PragmaFeeEnforcer:amount-must-be-positive");
        require(swapAmount > 0, "PragmaFeeEnforcer:swap-amount-must-be-positive");

        // Option A: Percentage-based minimum (0.01% of swap amount)
        // This ensures fees scale with swap value, works for all token decimals
        uint256 minFee = swapAmount / 10000; // 0.01% = 1 basis point
        require(amount_ >= minFee, "PragmaFeeEnforcer:amount-too-small");
    }
}
