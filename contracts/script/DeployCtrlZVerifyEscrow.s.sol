// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { CtrlZVerifyEscrow } from "../src/CtrlZVerifyEscrow.sol";

interface VerifyDeployVm {
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract DeployCtrlZVerifyEscrow {
    VerifyDeployVm private constant vm =
        VerifyDeployVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (CtrlZVerifyEscrow escrow) {
        vm.startBroadcast();
        escrow = new CtrlZVerifyEscrow();
        vm.stopBroadcast();
    }
}
