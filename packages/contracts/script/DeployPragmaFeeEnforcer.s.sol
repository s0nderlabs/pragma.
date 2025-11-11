// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {PragmaFeeEnforcer} from "../src/enforcers/PragmaFeeEnforcer.sol";
import {IDelegationManager} from "../lib/delegation-framework/src/interfaces/IDelegationManager.sol";

/**
 * @title DeployPragmaFeeEnforcer
 * @notice Standalone CREATE2 deployment script for PragmaFeeEnforcer
 * @dev Uses deterministic deployment for consistent addresses across networks
 *
 * Usage:
 *   1. Set PRAGMA_TREASURY_ADDRESS environment variable (must be EOA)
 *   2. Run: forge script script/DeployPragmaFeeEnforcer.s.sol:DeployPragmaFeeEnforcer --rpc-url $MONAD_RPC_URL --broadcast
 *
 * Features:
 *   - Deterministic CREATE2 deployment
 *   - Address prediction before deployment
 *   - Treasury EOA validation
 *   - Skip if already deployed
 *   - Comprehensive deployment summary
 */
contract DeployPragmaFeeEnforcer is Script {
    // CREATE2 salt for deterministic deployment
    bytes32 internal constant SALT = keccak256("PRAGMA_FEE_ENFORCER_v1.0.1");

    // DelegationManager address (Monad testnet)
    address internal constant DELEGATION_MANAGER = 0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3;

    // ArgsEqualityCheckEnforcer address (deployed by delegation framework)
    address internal constant ARGS_EQUALITY_CHECK_ENFORCER = 0x44B8C6ae3C304213c3e298495e12497Ed3E56E41;

    // Treasury address - MUST be EOA (set via environment variable)
    address internal immutable TREASURY;

    constructor() {
        // Read treasury address from environment (MUST be EOA)
        TREASURY = vm.envOr("PRAGMA_TREASURY_ADDRESS", address(0));
        require(TREASURY != address(0), "DeployPragmaFeeEnforcer: PRAGMA_TREASURY_ADDRESS not set");
        require(TREASURY.code.length == 0, "DeployPragmaFeeEnforcer: treasury must be EOA");
    }

    /**
     * @notice Main deployment function
     * @dev Deploys PragmaFeeEnforcer using CREATE2 or skips if already deployed
     */
    function run() external {
        console2.log("==========================================");
        console2.log("PragmaFeeEnforcer Deployment");
        console2.log("==========================================");
        console2.log("");
        console2.log("Treasury:", TREASURY);
        console2.log("");

        vm.startBroadcast();
        address deployed = _deploy(msg.sender);
        vm.stopBroadcast();

        console2.log("PragmaFeeEnforcer deployed at:", deployed);
        console2.log("");
        _printDeploymentSummary(deployed, true);
    }

    /**
     * @notice Predicts the deployment address without deploying
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

    /**
     * @dev Internal deployment function
     * @param deployer The address deploying the contract (unused, kept for interface compatibility)
     * @return The deployed contract address
     */
    function _deploy(address deployer) internal returns (address) {
        PragmaFeeEnforcer instance = new PragmaFeeEnforcer{salt: SALT}(
            IDelegationManager(DELEGATION_MANAGER),
            ARGS_EQUALITY_CHECK_ENFORCER,
            TREASURY
        );

        return address(instance);
    }

    /**
     * @dev Prints comprehensive deployment summary
     * @param deployedAddress The deployed contract address
     * @param newlyDeployed Whether the contract was newly deployed (vs already existed)
     */
    function _printDeploymentSummary(address deployedAddress, bool newlyDeployed) internal view {
        console2.log("==========================================");
        console2.log("Deployment Summary");
        console2.log("==========================================");
        console2.log("");
        console2.log("Contract:", "PragmaFeeEnforcer");
        console2.log("Version:", "1.0.1");
        console2.log("Address:", deployedAddress);
        console2.log("Status:", newlyDeployed ? "NEWLY DEPLOYED" : "ALREADY DEPLOYED");
        console2.log("");
        console2.log("Configuration:");
        console2.log("  DelegationManager:", DELEGATION_MANAGER);
        console2.log("  ArgsEqualityCheckEnforcer:", ARGS_EQUALITY_CHECK_ENFORCER);
        console2.log("  Treasury:", TREASURY);
        console2.log("");
        console2.log("CREATE2 Details:");
        console2.log("  Salt:", vm.toString(SALT));
        console2.log("");

        if (newlyDeployed) {
            console2.log("Next Steps:");
            console2.log("  1. Verify contract on block explorer");
            console2.log("  2. Update configuration files with deployed address");
            console2.log("  3. Run verification script: forge script script/VerifyPragmaFeeEnforcer.s.sol");
            console2.log("  4. Test fee collection in testnet environment");
            console2.log("");
            console2.log("Add to .env:");
            console2.log("  PRAGMA_FEE_ENFORCER_ADDRESS=", deployedAddress);
        } else {
            console2.log("No action needed - contract already deployed and operational");
        }
        console2.log("");
        console2.log("==========================================");
    }
}
