// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { CtrlZEscrow } from "../src/CtrlZEscrow.sol";

interface Vm {
    function deal(address account, uint256 newBalance) external;
    function expectRevert(bytes4 selector) external;
    function prank(address sender) external;
    function warp(uint256 newTimestamp) external;
}

contract CtrlZEscrowTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    CtrlZEscrow private escrow;
    address private sender = address(0xA11CE);
    address private recipient = address(0xB0B);
    address private stranger = address(0xCAFE);

    function setUp() public {
        escrow = new CtrlZEscrow();
        vm.deal(sender, 100 ether);
        vm.deal(recipient, 1 ether);
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

    function _send(uint256 amount, uint256 undoWin) private returns (uint256 id) {
        vm.prank(sender);
        return escrow.send{ value: amount }(recipient, amount, undoWin);
    }

    function _assertEq(address actual, address expected, string memory label) private pure {
        if (actual != expected) revert(string.concat(label, " address mismatch"));
    }

    function _assertEq(uint256 actual, uint256 expected, string memory label) private pure {
        if (actual != expected) revert(string.concat(label, " uint mismatch"));
    }
}
