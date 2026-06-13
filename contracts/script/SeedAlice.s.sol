// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { CtrlZEscrow } from "../src/CtrlZEscrow.sol";

interface Vm {
    function addr(uint256 privateKey) external returns (address);
    function envOr(string calldata name, address defaultValue) external returns (address);
    function envOr(string calldata name, uint256 defaultValue) external returns (uint256);
    function envUint(string calldata name) external returns (uint256);
    function sign(uint256 privateKey, bytes32 digest)
        external
        returns (uint8 v, bytes32 r, bytes32 s);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract SeedAlice {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address public constant DEFAULT_ESCROW = 0x2f2B5C26de74aA7307A5b946B025ce1A13255f45;
    address public constant ALICE = 0xa11CE0000000000000000000000000000000a5e1;
    uint256 public constant DEFAULT_AMOUNT = 1e13; // 0.00001 native Arc USDC-as-gas.
    uint256 public constant DEFAULT_CREATE_COUNT = 3;
    uint256 public constant MIN_UNDO_WINDOW = 5 minutes;

    error AliceKeyMismatch(address expected, address actual);
    error InvalidClaimRange();
    error NothingToDo();

    function run() external {
        uint256 payerKey = vm.envUint("PAYER_PRIVATE_KEY");
        uint256 aliceKey = vm.envUint("ALICE_PRIVATE_KEY");
        address aliceFromKey = vm.addr(aliceKey);
        if (aliceFromKey != ALICE) revert AliceKeyMismatch(ALICE, aliceFromKey);

        CtrlZEscrow escrow = CtrlZEscrow(vm.envOr("ESCROW_ADDRESS", DEFAULT_ESCROW));
        uint256 amount = vm.envOr("SEED_AMOUNT_WEI", DEFAULT_AMOUNT);
        uint256 createCount = vm.envOr("SEED_CREATE_COUNT", DEFAULT_CREATE_COUNT);
        uint256 claimFrom = vm.envOr("SEED_CLAIM_FROM", uint256(0));
        uint256 claimTo = vm.envOr("SEED_CLAIM_TO", uint256(0));
        if (createCount == 0 && claimFrom == 0 && claimTo == 0) revert NothingToDo();
        if ((claimFrom == 0) != (claimTo == 0) || claimFrom > claimTo) {
            revert InvalidClaimRange();
        }

        vm.startBroadcast(payerKey);

        for (uint256 i = 0; i < createCount; i++) {
            escrow.send{ value: amount }(ALICE, amount, MIN_UNDO_WINDOW);
        }

        if (claimFrom != 0 || claimTo != 0) {
            for (uint256 id = claimFrom; id <= claimTo; id++) {
                bytes32 digest = escrow.claimForDigest(id);
                (uint8 v, bytes32 r, bytes32 s) = vm.sign(aliceKey, digest);
                escrow.claimFor(id, abi.encodePacked(r, s, v));
            }
        }

        vm.stopBroadcast();
    }
}
