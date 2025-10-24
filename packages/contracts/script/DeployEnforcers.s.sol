// SPDX-License-Identifier: MIT AND Apache-2.0
pragma solidity 0.8.23;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {TimestampEnforcer} from "../src/enforcers/TimestampEnforcer.sol";
import {LimitedCallsEnforcer} from "../src/enforcers/LimitedCallsEnforcer.sol";
import {NonceEnforcer} from "../src/enforcers/NonceEnforcer.sol";
import {ERC20TransferAmountEnforcer} from "../src/enforcers/ERC20TransferAmountEnforcer.sol";
import {NativeTokenTransferAmountEnforcer} from "../src/enforcers/NativeTokenTransferAmountEnforcer.sol";

contract DeployEnforcers is Script {
    bytes32 internal constant TIMESTAMP_SALT = keccak256("PRAGMA_TIMESTAMP_ENFORCER_v1");
    bytes32 internal constant LIMITED_CALLS_SALT = keccak256("PRAGMA_LIMITED_CALLS_ENFORCER_v1");
    bytes32 internal constant NONCE_SALT = keccak256("PRAGMA_NONCE_ENFORCER_v1");
    bytes32 internal constant ERC20_AMOUNT_SALT = keccak256("PRAGMA_ERC20_TRANSFER_AMOUNT_ENFORCER_v1");
    bytes32 internal constant NATIVE_AMOUNT_SALT = keccak256("PRAGMA_NATIVE_TRANSFER_AMOUNT_ENFORCER_v1");

    function run() external {
        vm.startBroadcast();

        address deployer = tx.origin;

        address timestamp = _deployTimestamp(deployer);
        address limitedCalls = _deployLimitedCalls(deployer);
        address nonce = _deployNonce(deployer);
        address erc20Amount = _deployErc20Amount(deployer);
        address nativeAmount = _deployNativeAmount(deployer);

        vm.stopBroadcast();

        console2.log("TimestampEnforcer:", timestamp);
        console2.log("LimitedCallsEnforcer:", limitedCalls);
        console2.log("NonceEnforcer:", nonce);
        console2.log("ERC20TransferAmountEnforcer:", erc20Amount);
        console2.log("NativeTokenTransferAmountEnforcer:", nativeAmount);
    }

    function _deployTimestamp(address deployer) internal returns (address) {
        bytes32 salt = TIMESTAMP_SALT;
        bytes memory creationCode = type(TimestampEnforcer).creationCode;
        address predicted = vm.computeCreate2Address(salt, keccak256(creationCode), deployer);

        if (predicted.code.length == 0) {
            TimestampEnforcer instance = new TimestampEnforcer{salt: salt}();
            require(address(instance) == predicted, "TimestampEnforcer: address mismatch");
            return address(instance);
        }

        return predicted;
    }

    function _deployLimitedCalls(address deployer) internal returns (address) {
        bytes32 salt = LIMITED_CALLS_SALT;
        bytes memory creationCode = type(LimitedCallsEnforcer).creationCode;
        address predicted = vm.computeCreate2Address(salt, keccak256(creationCode), deployer);

        if (predicted.code.length == 0) {
            LimitedCallsEnforcer instance = new LimitedCallsEnforcer{salt: salt}();
            require(address(instance) == predicted, "LimitedCallsEnforcer: address mismatch");
            return address(instance);
        }

        return predicted;
    }

    function _deployNonce(address deployer) internal returns (address) {
        bytes32 salt = NONCE_SALT;
        bytes memory creationCode = type(NonceEnforcer).creationCode;
        address predicted = vm.computeCreate2Address(salt, keccak256(creationCode), deployer);

        if (predicted.code.length == 0) {
            NonceEnforcer instance = new NonceEnforcer{salt: salt}();
            require(address(instance) == predicted, "NonceEnforcer: address mismatch");
            return address(instance);
        }

        return predicted;
    }

    function _deployErc20Amount(address deployer) internal returns (address) {
        bytes32 salt = ERC20_AMOUNT_SALT;
        bytes memory creationCode = type(ERC20TransferAmountEnforcer).creationCode;
        address predicted = vm.computeCreate2Address(salt, keccak256(creationCode), deployer);

        if (predicted.code.length == 0) {
            ERC20TransferAmountEnforcer instance = new ERC20TransferAmountEnforcer{salt: salt}();
            require(address(instance) == predicted, "ERC20TransferAmountEnforcer: address mismatch");
            return address(instance);
        }

        return predicted;
    }

    function _deployNativeAmount(address deployer) internal returns (address) {
        bytes32 salt = NATIVE_AMOUNT_SALT;
        bytes memory creationCode = type(NativeTokenTransferAmountEnforcer).creationCode;
        address predicted = vm.computeCreate2Address(salt, keccak256(creationCode), deployer);

        if (predicted.code.length == 0) {
            NativeTokenTransferAmountEnforcer instance = new NativeTokenTransferAmountEnforcer{salt: salt}();
            require(address(instance) == predicted, "NativeTokenTransferAmountEnforcer: address mismatch");
            return address(instance);
        }

        return predicted;
    }
}
