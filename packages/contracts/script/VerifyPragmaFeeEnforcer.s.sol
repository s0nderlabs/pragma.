// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {PragmaFeeEnforcer} from "../src/enforcers/PragmaFeeEnforcer.sol";
import {IDelegationManager} from "../lib/delegation-framework/src/interfaces/IDelegationManager.sol";

/**
 * @title VerifyPragmaFeeEnforcer
 * @notice Post-deployment verification script for PragmaFeeEnforcer
 * @dev Validates contract configuration and state
 *
 * Usage:
 *   1. Set PRAGMA_TREASURY_ADDRESS environment variable
 *   2. Set PRAGMA_FEE_ENFORCER_ADDRESS environment variable (deployed address)
 *   3. Run: forge script script/VerifyPragmaFeeEnforcer.s.sol:VerifyPragmaFeeEnforcer --rpc-url $MONAD_RPC_URL
 *
 * Verification Checks:
 *   - Contract is deployed at expected address
 *   - Version matches expected version
 *   - DelegationManager configured correctly
 *   - ArgsEqualityCheckEnforcer configured correctly
 *   - Treasury configured correctly
 *   - Treasury is EOA (no code)
 *   - MAX_FEE_AMOUNT is correct
 */
contract VerifyPragmaFeeEnforcer is Script {
    // Expected configuration
    address internal constant EXPECTED_DELEGATION_MANAGER = 0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3;
    address internal constant EXPECTED_ARGS_EQUALITY_CHECK_ENFORCER = 0x44B8C6ae3C304213c3e298495e12497Ed3E56E41;
    uint256 internal constant EXPECTED_MAX_FEE_AMOUNT = 1000 ether;
    string internal constant EXPECTED_VERSION = "1.0.0";

    // Deployment addresses
    address internal immutable DEPLOYED_ADDRESS;
    address internal immutable EXPECTED_TREASURY;

    constructor() {
        DEPLOYED_ADDRESS = vm.envOr("PRAGMA_FEE_ENFORCER_ADDRESS", address(0));
        EXPECTED_TREASURY = vm.envOr("PRAGMA_TREASURY_ADDRESS", address(0));

        require(DEPLOYED_ADDRESS != address(0), "VerifyPragmaFeeEnforcer: PRAGMA_FEE_ENFORCER_ADDRESS not set");
        require(EXPECTED_TREASURY != address(0), "VerifyPragmaFeeEnforcer: PRAGMA_TREASURY_ADDRESS not set");
    }

    /**
     * @notice Main verification function
     * @dev Runs all verification checks and reports results
     */
    function run() external view {
        console2.log("==========================================");
        console2.log("PragmaFeeEnforcer Verification");
        console2.log("==========================================");
        console2.log("");
        console2.log("Contract Address:", DEPLOYED_ADDRESS);
        console2.log("");

        bool allChecksPassed = true;

        // Check 1: Contract is deployed
        allChecksPassed = _checkDeployment() && allChecksPassed;

        // Check 2: Version
        allChecksPassed = _checkVersion() && allChecksPassed;

        // Check 3: DelegationManager
        allChecksPassed = _checkDelegationManager() && allChecksPassed;

        // Check 4: ArgsEqualityCheckEnforcer
        allChecksPassed = _checkArgsEqualityCheckEnforcer() && allChecksPassed;

        // Check 5: Treasury
        allChecksPassed = _checkTreasury() && allChecksPassed;

        // Check 6: Treasury is EOA
        allChecksPassed = _checkTreasuryIsEOA() && allChecksPassed;

        // Check 7: MAX_FEE_AMOUNT
        allChecksPassed = _checkMaxFeeAmount() && allChecksPassed;

        console2.log("");
        console2.log("==========================================");
        console2.log("Verification Result:", allChecksPassed ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED");
        console2.log("==========================================");

        if (!allChecksPassed) {
            console2.log("");
            console2.log("Please review failed checks above and investigate discrepancies.");
        }
    }

    function _checkDeployment() internal view returns (bool) {
        bool passed = DEPLOYED_ADDRESS.code.length > 0;
        _logCheck("Contract Deployment", passed, passed ? "Contract deployed" : "No code at address");
        return passed;
    }

    function _checkVersion() internal view returns (bool) {
        try PragmaFeeEnforcer(DEPLOYED_ADDRESS).VERSION() returns (string memory version) {
            bool passed = keccak256(bytes(version)) == keccak256(bytes(EXPECTED_VERSION));
            _logCheck(
                "Version",
                passed,
                passed
                    ? string.concat("Correct (", version, ")")
                    : string.concat("Mismatch (expected: ", EXPECTED_VERSION, ", got: ", version, ")")
            );
            return passed;
        } catch {
            _logCheck("Version", false, "Failed to read VERSION constant");
            return false;
        }
    }

    function _checkDelegationManager() internal view returns (bool) {
        try PragmaFeeEnforcer(DEPLOYED_ADDRESS).delegationManager() returns (IDelegationManager dm) {
            bool passed = address(dm) == EXPECTED_DELEGATION_MANAGER;
            _logCheck(
                "DelegationManager",
                passed,
                passed
                    ? "Correct"
                    : string.concat(
                        "Mismatch (expected: ",
                        vm.toString(EXPECTED_DELEGATION_MANAGER),
                        ", got: ",
                        vm.toString(address(dm)),
                        ")"
                    )
            );
            return passed;
        } catch {
            _logCheck("DelegationManager", false, "Failed to read delegationManager");
            return false;
        }
    }

    function _checkArgsEqualityCheckEnforcer() internal view returns (bool) {
        try PragmaFeeEnforcer(DEPLOYED_ADDRESS).argsEqualityCheckEnforcer() returns (address enforcer) {
            bool passed = enforcer == EXPECTED_ARGS_EQUALITY_CHECK_ENFORCER;
            _logCheck(
                "ArgsEqualityCheckEnforcer",
                passed,
                passed
                    ? "Correct"
                    : string.concat(
                        "Mismatch (expected: ",
                        vm.toString(EXPECTED_ARGS_EQUALITY_CHECK_ENFORCER),
                        ", got: ",
                        vm.toString(enforcer),
                        ")"
                    )
            );
            return passed;
        } catch {
            _logCheck("ArgsEqualityCheckEnforcer", false, "Failed to read argsEqualityCheckEnforcer");
            return false;
        }
    }

    function _checkTreasury() internal view returns (bool) {
        try PragmaFeeEnforcer(DEPLOYED_ADDRESS).TREASURY() returns (address treasury) {
            bool passed = treasury == EXPECTED_TREASURY;
            _logCheck(
                "Treasury Address",
                passed,
                passed
                    ? "Correct"
                    : string.concat(
                        "Mismatch (expected: ",
                        vm.toString(EXPECTED_TREASURY),
                        ", got: ",
                        vm.toString(treasury),
                        ")"
                    )
            );
            return passed;
        } catch {
            _logCheck("Treasury Address", false, "Failed to read TREASURY");
            return false;
        }
    }

    function _checkTreasuryIsEOA() internal view returns (bool) {
        try PragmaFeeEnforcer(DEPLOYED_ADDRESS).TREASURY() returns (address treasury) {
            bool passed = treasury.code.length == 0;
            _logCheck(
                "Treasury is EOA",
                passed,
                passed ? "Correct (no code)" : "Failed (treasury has code - should be EOA)"
            );
            return passed;
        } catch {
            _logCheck("Treasury is EOA", false, "Failed to read TREASURY");
            return false;
        }
    }

    function _checkMaxFeeAmount() internal view returns (bool) {
        try PragmaFeeEnforcer(DEPLOYED_ADDRESS).MAX_FEE_AMOUNT() returns (uint256 maxFee) {
            bool passed = maxFee == EXPECTED_MAX_FEE_AMOUNT;
            _logCheck(
                "MAX_FEE_AMOUNT",
                passed,
                passed
                    ? string.concat("Correct (", vm.toString(maxFee), " wei)")
                    : string.concat(
                        "Mismatch (expected: ",
                        vm.toString(EXPECTED_MAX_FEE_AMOUNT),
                        ", got: ",
                        vm.toString(maxFee),
                        ")"
                    )
            );
            return passed;
        } catch {
            _logCheck("MAX_FEE_AMOUNT", false, "Failed to read MAX_FEE_AMOUNT");
            return false;
        }
    }

    function _logCheck(string memory name, bool passed, string memory message) internal pure {
        string memory status = passed ? "PASS" : "FAIL";
        console2.log(string.concat("[", status, "] ", name, ": ", message));
    }
}
