// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import { ModeLib, CALLTYPE_BATCH } from "@erc7579/lib/ModeLib.sol";
import { ExecutionLib } from "@erc7579/lib/ExecutionLib.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { CaveatEnforcer } from "../../lib/delegation-framework/src/enforcers/CaveatEnforcer.sol";
import { Execution, ModeCode, CallType } from "../../lib/delegation-framework/src/utils/Types.sol";

/**
 * @title PragmaFeeEnforcer v1.0.1
 * @notice Enforces protocol fee collection for Pragma operations (swaps, stakes, NFT purchases).
 * @dev This enforcer ensures that a 0.5% fee is collected and sent to the Pragma treasury
 * as part of a batch execution. No nested delegation needed - fee is validated, not collected.
 *
 * ARCHITECTURE CHANGE (v1.0.1):
 * - User creates a BATCH execution with main operation + fee transfer
 * - Enforcer validates that fee transfer is included and correct
 * - No separate delegation needed for fee collection
 * - Simpler, cleaner, and actually works with all smart account implementations
 *
 * Security Features:
 * - Treasury address is immutable (hardcoded at deployment)
 * - Validates execution is batch mode with exactly 2 operations
 * - Validates second operation transfers correct fee to treasury
 * - Supports both native token (MON) and ERC20 fees
 *
 * Terms Encoding:
 * - bytes[0]: isNative (1 = native, 0 = ERC20)
 * - bytes[1-20]: token address (address(0) if native)
 * - bytes[21-52]: fee amount (uint256)
 *
 * Execution Requirements:
 * - Mode: MUST be batch mode
 * - Execution 0: Main operation (swap/stake/NFT purchase)
 * - Execution 1: Fee transfer to TREASURY
 *
 * @dev Version 1.0.1 - Simplified architecture without nested delegations
 */
contract PragmaFeeEnforcer_v1_0_1 is CaveatEnforcer {
    using ModeLib for ModeCode;

    ////////////////////////////// State //////////////////////////////

    /// @dev The Pragma treasury address (receives all fees)
    address public immutable TREASURY;

    /// @dev Maximum fee amount to prevent misconfiguration (e.g., 1000 MON)
    uint256 public constant MAX_FEE_AMOUNT = 1000 ether;

    ////////////////////////////// Events //////////////////////////////

    /**
     * @notice Emitted when a protocol fee is collected
     * @param delegator The address paying the fee
     * @param redeemer The address redeeming the delegation
     * @param isNative Whether the fee is in native token
     * @param token The token address (address(0) if native)
     * @param amount The fee amount collected
     */
    event FeeCollected(
        address indexed delegator,
        address indexed redeemer,
        bool isNative,
        address token,
        uint256 amount
    );

    ////////////////////////////// Constructor //////////////////////////////

    /**
     * @param _treasury Address of the Pragma treasury
     */
    constructor(address _treasury) {
        require(_treasury != address(0), "PragmaFeeEnforcer:invalid-treasury");
        TREASURY = _treasury;
    }

    ////////////////////////////// External Functions //////////////////////////////

    /**
     * @notice Validates fee payment AFTER execution completes
     * @dev This is called after the batch execution completes. We validate that:
     *      1. Execution mode is batch
     *      2. There are exactly 2 executions
     *      3. Second execution is fee transfer to treasury
     *
     * @param _terms Encoded fee requirements (isNative, token, amount)
     * @param _args Not used in this version
     * @param _mode Execution mode (MUST be batch)
     * @param _executionCalldata The batch execution calldata
     * @param _delegationHash Hash of the delegation being redeemed
     * @param _delegator The delegator address
     * @param _redeemer The redeemer address
     */
    function afterAllHook(
        bytes calldata _terms,
        bytes calldata _args,
        ModeCode _mode,
        bytes calldata _executionCalldata,
        bytes32 _delegationHash,
        address _delegator,
        address _redeemer
    ) public override {
        // Decode fee requirements from terms
        (bool isNative, address token, uint256 amount) = getTermsInfo(_terms);

        // Validate mode is batch
        require(_mode.getCallType() == CALLTYPE_BATCH, "PragmaFeeEnforcer:must-be-batch-mode");

        // Decode batch execution
        Execution[] memory executions = ExecutionLib.decodeBatch(_executionCalldata);

        // Must have exactly 2 executions: main operation + fee transfer
        require(executions.length == 2, "PragmaFeeEnforcer:must-have-two-executions");

        // Validate second execution is fee transfer to treasury
        Execution memory feeExecution = executions[1];

        if (isNative) {
            // Native token fee: transfer to treasury
            require(feeExecution.target == TREASURY, "PragmaFeeEnforcer:invalid-fee-target");
            require(feeExecution.value == amount, "PragmaFeeEnforcer:invalid-fee-amount");
            require(feeExecution.callData.length == 0, "PragmaFeeEnforcer:native-fee-must-have-empty-calldata");
        } else {
            // ERC20 fee: ERC20.transfer(treasury, amount)
            require(feeExecution.target == token, "PragmaFeeEnforcer:invalid-fee-token");
            require(feeExecution.value == 0, "PragmaFeeEnforcer:erc20-fee-must-have-zero-value");

            // Decode and validate ERC20.transfer call
            require(feeExecution.callData.length >= 68, "PragmaFeeEnforcer:invalid-calldata-length");

            bytes memory callData = feeExecution.callData;
            bytes4 selector;
            address to;
            uint256 transferAmount;

            // Use assembly to extract function selector and parameters from bytes memory
            assembly {
                // Load from callData (bytes memory structure: length at offset 0, data starts at offset 32)
                let dataPtr := add(callData, 32) // Skip length field

                // Load first 32 bytes and extract selector (first 4 bytes)
                selector := mload(dataPtr)

                // Load 'to' address (32-byte word at offset 4, right-aligned)
                to := mload(add(dataPtr, 4))

                // Load amount (32-byte word at offset 36)
                transferAmount := mload(add(dataPtr, 36))
            }

            require(selector == IERC20.transfer.selector, "PragmaFeeEnforcer:must-be-transfer");
            require(to == TREASURY, "PragmaFeeEnforcer:invalid-transfer-recipient");
            require(transferAmount == amount, "PragmaFeeEnforcer:invalid-transfer-amount");
        }

        emit FeeCollected(_delegator, _redeemer, isNative, token, amount);
    }

    ////////////////////////////// Public Functions //////////////////////////////

    /**
     * @notice Decode terms to extract fee requirements
     * @param _terms Encoded as: isNative (1 byte) || token (20 bytes) || amount (32 bytes)
     * @return isNative_ Whether the fee is in native token
     * @return token_ The ERC20 token address (address(0) if native)
     * @return amount_ The fee amount to collect
     */
    function getTermsInfo(bytes calldata _terms)
        public
        pure
        returns (bool isNative_, address token_, uint256 amount_)
    {
        require(_terms.length == 53, "PragmaFeeEnforcer:invalid-terms-length");

        // Decode terms
        isNative_ = uint8(_terms[0]) == 1;
        token_ = address(bytes20(_terms[1:21]));
        amount_ = uint256(bytes32(_terms[21:53]));

        // Validate token address
        if (isNative_) {
            require(token_ == address(0), "PragmaFeeEnforcer:native-must-use-zero-address");
        } else {
            require(token_ != address(0), "PragmaFeeEnforcer:erc20-must-have-valid-address");
        }

        // Validate amount is reasonable
        require(amount_ > 0 && amount_ <= MAX_FEE_AMOUNT, "PragmaFeeEnforcer:invalid-fee-amount");
    }
}
