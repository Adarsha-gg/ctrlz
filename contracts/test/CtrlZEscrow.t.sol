// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { CtrlZEscrow } from "../src/CtrlZEscrow.sol";

interface Vm {
    function addr(uint256 privateKey) external returns (address);
    function deal(address account, uint256 newBalance) external;
    function expectRevert(bytes4 selector) external;
    function prank(address sender) external;
    function sign(uint256 privateKey, bytes32 digest)
        external
        returns (uint8 v, bytes32 r, bytes32 s);
    function warp(uint256 newTimestamp) external;
}

contract CtrlZEscrowTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    CtrlZEscrow private escrow;
    address private sender = address(0xA11CE);
    uint256 private recipientKey = 0xB0B;
    address private recipient;
    address private stranger = address(0xCAFE);
    uint256 private strangerKey = 0xCAFE;
    address private relayer = address(0xD00D);

    function setUp() public {
        escrow = new CtrlZEscrow();
        recipient = vm.addr(recipientKey);
        vm.deal(sender, 100 ether);
        vm.deal(recipient, 1 ether);
        vm.deal(relayer, 1 ether);
        vm.warp(1_000);
    }

    function testSendCreatesPendingPaymentReadableById() public {
        uint256 id = _send(2 ether, 10 minutes);

        (
            address paymentSender,
            address paymentRecipient,
            uint256 amount,
            uint64 claimableAt,
            uint64 expiresAt,
            address refundTo,
            CtrlZEscrow.State state,
            uint64 sealedAt
        ) = escrow.payments(id);

        _assertEq(id, 1, "id");
        _assertEq(paymentSender, sender, "sender");
        _assertEq(paymentRecipient, recipient, "recipient");
        _assertEq(amount, 2 ether, "amount");
        _assertEq(claimableAt, uint64(block.timestamp + 10 minutes), "claimableAt");
        _assertEq(expiresAt, uint64(block.timestamp + 72 hours), "expiresAt");
        _assertEq(refundTo, sender, "refundTo");
        _assertEq(uint256(state), uint256(CtrlZEscrow.State.PENDING), "state");
        _assertEq(sealedAt, 0, "sealedAt");
    }

    function testSendClampsUndoWindowToFiveMinuteFloor() public {
        uint256 id = _send(1 ether, 1 seconds);
        (,,, uint64 claimableAt,,,,) = escrow.payments(id);

        _assertEq(claimableAt, uint64(block.timestamp + 5 minutes), "floor");
    }

    function testRecallIsSenderOnlyAndRefundsSender() public {
        uint256 id = _send(3 ether, 5 minutes);
        uint256 senderBefore = sender.balance;

        vm.prank(stranger);
        vm.expectRevert(CtrlZEscrow.NotSender.selector);
        escrow.recall(id, CtrlZEscrow.RecallReason.OTHER);

        vm.prank(sender);
        escrow.recall(id, CtrlZEscrow.RecallReason.WRONG_AMOUNT);

        (,,,,,, CtrlZEscrow.State state,) = escrow.payments(id);
        _assertEq(uint256(state), uint256(CtrlZEscrow.State.REFUNDED), "state");
        _assertEq(sender.balance, senderBefore + 3 ether, "sender refund");
    }

    function testRejectIsRecipientOnlyAndRefundsSender() public {
        uint256 id = _send(4 ether, 5 minutes);
        uint256 senderBefore = sender.balance;

        vm.prank(stranger);
        vm.expectRevert(CtrlZEscrow.NotRecipient.selector);
        escrow.reject(id);

        vm.prank(recipient);
        escrow.reject(id);

        (,,,,,, CtrlZEscrow.State state,) = escrow.payments(id);
        _assertEq(uint256(state), uint256(CtrlZEscrow.State.REFUNDED), "state");
        _assertEq(sender.balance, senderBefore + 4 ether, "sender refund");
    }

    function testClaimRequiresRecipientAndClaimableAtThenSeals() public {
        uint256 id = _send(5 ether, 5 minutes);
        uint256 recipientBefore = recipient.balance;

        vm.prank(stranger);
        vm.expectRevert(CtrlZEscrow.NotRecipient.selector);
        escrow.claim(id);

        vm.prank(recipient);
        vm.expectRevert(CtrlZEscrow.ClaimTooEarly.selector);
        escrow.claim(id);

        vm.warp(block.timestamp + 5 minutes);
        vm.prank(recipient);
        escrow.claim(id);

        (,,,,,, CtrlZEscrow.State state, uint64 sealedAt) = escrow.payments(id);
        _assertEq(uint256(state), uint256(CtrlZEscrow.State.SEALED), "state");
        _assertEq(sealedAt, uint64(block.timestamp), "sealedAt");
        _assertEq(recipient.balance, recipientBefore + 5 ether, "recipient paid");
    }

    function testRecallAfterClaimRevertsOnState() public {
        uint256 id = _send(1 ether, 5 minutes);

        vm.warp(block.timestamp + 5 minutes);
        vm.prank(recipient);
        escrow.claim(id);

        vm.prank(sender);
        vm.expectRevert(CtrlZEscrow.InvalidState.selector);
        escrow.recall(id, CtrlZEscrow.RecallReason.FRAUD_SUSPECTED);
    }

    function testClaimForLetsRelayerClaimForRecipient() public {
        uint256 id = _send(2 ether, 5 minutes);
        bytes memory sig = _signClaimFor(recipientKey, id);
        uint256 recipientBefore = recipient.balance;
        uint256 relayerBefore = relayer.balance;

        vm.warp(block.timestamp + 5 minutes);
        vm.prank(relayer);
        escrow.claimFor(id, sig);

        (,,,,,, CtrlZEscrow.State state, uint64 sealedAt) = escrow.payments(id);
        _assertEq(uint256(state), uint256(CtrlZEscrow.State.SEALED), "state");
        _assertEq(sealedAt, uint64(block.timestamp), "sealedAt");
        _assertEq(recipient.balance, recipientBefore + 2 ether, "recipient paid");
        _assertEq(relayer.balance, relayerBefore, "relayer unpaid");
    }

    function testClaimForReplayReverts() public {
        uint256 id = _send(1 ether, 5 minutes);
        bytes memory sig = _signClaimFor(recipientKey, id);

        vm.warp(block.timestamp + 5 minutes);
        vm.prank(relayer);
        escrow.claimFor(id, sig);

        vm.prank(relayer);
        vm.expectRevert(CtrlZEscrow.SignatureAlreadyUsed.selector);
        escrow.claimFor(id, sig);
    }

    function testClaimForWrongSignerReverts() public {
        uint256 id = _send(1 ether, 5 minutes);
        bytes memory sig = _signClaimFor(strangerKey, id);

        vm.warp(block.timestamp + 5 minutes);
        vm.prank(relayer);
        vm.expectRevert(CtrlZEscrow.InvalidSignature.selector);
        escrow.claimFor(id, sig);
    }

    function testClaimForTooEarlyReverts() public {
        uint256 id = _send(1 ether, 5 minutes);
        bytes memory sig = _signClaimFor(recipientKey, id);

        vm.prank(relayer);
        vm.expectRevert(CtrlZEscrow.ClaimTooEarly.selector);
        escrow.claimFor(id, sig);
    }

    function testClaimForFundsLandAtRecipientNotRelayer() public {
        uint256 id = _send(3 ether, 5 minutes);
        bytes memory sig = _signClaimFor(recipientKey, id);
        uint256 recipientBefore = recipient.balance;
        uint256 relayerBefore = relayer.balance;

        vm.warp(block.timestamp + 5 minutes);
        vm.prank(relayer);
        escrow.claimFor(id, sig);

        _assertEq(recipient.balance, recipientBefore + 3 ether, "recipient paid");
        _assertEq(relayer.balance, relayerBefore, "relayer unpaid");
    }

    function _send(uint256 amount, uint256 undoWin) private returns (uint256 id) {
        vm.prank(sender);
        return escrow.send{ value: amount }(recipient, amount, undoWin);
    }

    function _signClaimFor(uint256 privateKey, uint256 id) private returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, escrow.claimForDigest(id));
        return abi.encodePacked(r, s, v);
    }

    function _assertEq(address actual, address expected, string memory label) private pure {
        if (actual != expected) revert(string.concat(label, " address mismatch"));
    }

    function _assertEq(uint256 actual, uint256 expected, string memory label) private pure {
        if (actual != expected) revert(string.concat(label, " uint mismatch"));
    }
}
