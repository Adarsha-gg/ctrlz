// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { CtrlZEscrow } from "../src/CtrlZEscrow.sol";

interface Vm {
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract DeployCtrlZEscrow {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (CtrlZEscrow escrow) {
        vm.startBroadcast();
        escrow = new CtrlZEscrow();
        vm.stopBroadcast();
    }
}
