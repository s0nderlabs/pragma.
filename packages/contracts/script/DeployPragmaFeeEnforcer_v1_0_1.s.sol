// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Script.sol";
import "../src/enforcers/PragmaFeeEnforcer_v1_0_1.sol";

/**
 * @title DeployPragmaFeeEnforcer_v1_0_1
 * @notice Deployment script for PragmaFeeEnforcer v1.0.1
 * @dev Version 1.0.1 uses batch execution validation instead of nested delegations
 *
 * Usage:
 * source .env
 * forge script script/DeployPragmaFeeEnforcer_v1_0_1.s.sol:DeployPragmaFeeEnforcer_v1_0_1 \
 *   --rpc-url $MONAD_RPC_URL \
 *   --broadcast \
 *   --private-key $PRAGMA_ADMIN_TEST_PK
 */
contract DeployPragmaFeeEnforcer_v1_0_1 is Script {
    // Monad testnet configuration
    address constant PRAGMA_TREASURY = 0x0F7f2dc632ce4668574249961B79D8DaAF804bB9;

    function run() external {
        console.log("\n================================================");
        console.log("Deploying PragmaFeeEnforcer v1.0.1");
        console.log("================================================");
        console.log("Network:", block.chainid);
        console.log("Treasury:", PRAGMA_TREASURY);
        console.log("Deployer:", vm.addr(vm.envUint("PRAGMA_ADMIN_TEST_PK")));

        vm.startBroadcast();

        // Deploy PragmaFeeEnforcer v1.0.1
        PragmaFeeEnforcer_v1_0_1 enforcer = new PragmaFeeEnforcer_v1_0_1(PRAGMA_TREASURY);

        console.log("\n[SUCCESS] PragmaFeeEnforcer v1.0.1 deployed!");
        console.log("Address:", address(enforcer));
        console.log("Treasury:", enforcer.TREASURY());
        console.log("Max Fee Amount:", enforcer.MAX_FEE_AMOUNT());

        vm.stopBroadcast();

        console.log("\n================================================");
        console.log("Deployment Complete!");
        console.log("================================================\n");
    }
}
