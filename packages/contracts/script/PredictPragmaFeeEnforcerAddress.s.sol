// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {PragmaFeeEnforcer} from "../src/enforcers/PragmaFeeEnforcer.sol";
import {IDelegationManager} from "../lib/delegation-framework/src/interfaces/IDelegationManager.sol";

/**
 * @title PredictPragmaFeeEnforcerAddress
 * @notice Helper script to predict PragmaFeeEnforcer deployment address
 * @dev Uses CREATE2 to compute deterministic address before deployment
 *
 * Usage:
 *   1. Set PRAGMA_TREASURY_ADDRESS environment variable
 *   2. Run: forge script script/PredictPragmaFeeEnforcerAddress.s.sol:PredictPragmaFeeEnforcerAddress --rpc-url $MONAD_RPC_URL
 *
 * Features:
 *   - No broadcast (read-only)
 *   - Works with any deployer address
 *   - Validates treasury configuration
 *   - Shows deployment status
 */
contract PredictPragmaFeeEnforcerAddress is Script {
    // CREATE2 salt (must match deployment script)
    bytes32 internal constant SALT = keccak256("PRAGMA_FEE_ENFORCER_v1.0.0");

    // DelegationManager address (Monad testnet)
    address internal constant DELEGATION_MANAGER = 0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3;

    // ArgsEqualityCheckEnforcer address (deployed by delegation framework)
    address internal constant ARGS_EQUALITY_CHECK_ENFORCER = 0x44B8C6ae3C304213c3e298495e12497Ed3E56E41;

    // Treasury address - MUST be EOA
    address internal immutable TREASURY;

    constructor() {
        TREASURY = vm.envOr("PRAGMA_TREASURY_ADDRESS", address(0));
        require(TREASURY != address(0), "PredictPragmaFeeEnforcerAddress: PRAGMA_TREASURY_ADDRESS not set");
    }

    /**
     * @notice Main prediction function
     * @dev Computes and displays the predicted deployment address
     */
    function run() external view {
        address deployer = msg.sender;
        address predicted = predictAddress(deployer);
        bool isDeployed = predicted.code.length > 0;

        console2.log("==========================================");
        console2.log("PragmaFeeEnforcer Address Prediction");
        console2.log("==========================================");
        console2.log("");
        console2.log("Deployer:", deployer);
        console2.log("Treasury:", TREASURY);
        console2.log("Treasury is EOA:", TREASURY.code.length == 0 ? "YES" : "NO (INVALID)");
        console2.log("");
        console2.log("Predicted Address:", predicted);
        console2.log("Deployment Status:", isDeployed ? "ALREADY DEPLOYED" : "NOT YET DEPLOYED");
        console2.log("");

        if (TREASURY.code.length > 0) {
            console2.log("WARNING: Treasury address has code (must be EOA)");
            console2.log("         Deployment will fail with current configuration");
            console2.log("");
        }

        console2.log("Configuration:");
        console2.log("  DelegationManager:", DELEGATION_MANAGER);
        console2.log("  ArgsEqualityCheckEnforcer:", ARGS_EQUALITY_CHECK_ENFORCER);
        console2.log("");
        console2.log("CREATE2 Salt:", vm.toString(SALT));
        console2.log("");

        if (!isDeployed) {
            console2.log("To deploy to this address:");
            console2.log("  forge script script/DeployPragmaFeeEnforcer.s.sol:DeployPragmaFeeEnforcer \\");
            console2.log("    --rpc-url $MONAD_RPC_URL \\");
            console2.log("    --broadcast");
        } else {
            console2.log("Contract already deployed - no further action needed");

            // Verify VERSION
            try PragmaFeeEnforcer(predicted).VERSION() returns (string memory version) {
                console2.log("  Deployed Version:", version);
            } catch {
                console2.log("  Warning: Could not read VERSION (may not be this contract)");
            }
        }
        console2.log("");
        console2.log("==========================================");
    }

    /**
     * @notice Predicts the deployment address
     * @param deployer The address that will deploy the contract
     * @return The predicted contract address
     */
    function predictAddress(address deployer) public view returns (address) {
        bytes memory creationCode = abi.encodePacked(
            type(PragmaFeeEnforcer).creationCode,
            abi.encode(
                IDelegationManager(DELEGATION_MANAGER),
                ARGS_EQUALITY_CHECK_ENFORCER,
                TREASURY
            )
        );
        return vm.computeCreate2Address(SALT, keccak256(creationCode), deployer);
    }
}
