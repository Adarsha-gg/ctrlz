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
    address private sender2 = address(0xBEEF);
    uint256 private recipientKey = 0xB0B;
    address private recipient;
    address private stranger = address(0xCAFE);
    uint256 private strangerKey = 0xCAFE;
    address private relayer = address(0xD00D);

    function setUp() public {
        escrow = new CtrlZEscrow();
        recipient = vm.addr(recipientKey);
        vm.deal(sender, 100 ether);
        vm.deal(sender2, 100 ether);
        vm.deal(recipient, 1 ether);
        vm.deal(relayer, 1 ether);
        vm.warp(1_000);
    }

    function testSendCreatesPendingPaymentReadableById() public {
        uint256 id = _send(2 ether, 1 hours);

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
        _assertEq(claimableAt, uint64(block.timestamp + 1 hours), "claimableAt");
        _assertEq(expiresAt, uint64(block.timestamp + 72 hours), "expiresAt");
        _assertEq(refundTo, sender, "refundTo");
        _assertEq(uint256(state), uint256(CtrlZEscrow.State.PENDING), "state");
        _assertEq(sealedAt, 0, "sealedAt");
    }

    function testSendUsesRiskHoldWhenLongerThanUndoFloor() public {
        uint256 id = _send(1 ether, 1 seconds);
        (,,, uint64 claimableAt,,,,) = escrow.payments(id);

        _assertEq(claimableAt, uint64(block.timestamp + 30 minutes), "unknown hold");
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

        _claimAsRecipient(id);

        (,,,,,, CtrlZEscrow.State state, uint64 sealedAt) = escrow.payments(id);
        _assertEq(uint256(state), uint256(CtrlZEscrow.State.SEALED), "state");
        _assertEq(sealedAt, uint64(block.timestamp), "sealedAt");
        _assertEq(recipient.balance, recipientBefore + 5 ether, "recipient paid");
    }

    function testRecallAfterClaimRevertsOnState() public {
        uint256 id = _send(1 ether, 5 minutes);

        _claimAsRecipient(id);

        vm.prank(sender);
        vm.expectRevert(CtrlZEscrow.InvalidState.selector);
        escrow.recall(id, CtrlZEscrow.RecallReason.FRAUD_SUSPECTED);
    }

    function testClaimForLetsRelayerClaimForRecipient() public {
        uint256 id = _send(2 ether, 5 minutes);
        bytes memory sig = _signClaimFor(recipientKey, id);
        uint256 recipientBefore = recipient.balance;
        uint256 relayerBefore = relayer.balance;

        _warpToClaimable(id);
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

        _warpToClaimable(id);
        vm.prank(relayer);
        escrow.claimFor(id, sig);

        vm.prank(relayer);
        vm.expectRevert(CtrlZEscrow.SignatureAlreadyUsed.selector);
        escrow.claimFor(id, sig);
    }

    function testClaimForWrongSignerReverts() public {
        uint256 id = _send(1 ether, 5 minutes);
        bytes memory sig = _signClaimFor(strangerKey, id);

        _warpToClaimable(id);
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

        _warpToClaimable(id);
        vm.prank(relayer);
        escrow.claimFor(id, sig);

        _assertEq(recipient.balance, recipientBefore + 3 ether, "recipient paid");
        _assertEq(relayer.balance, relayerBefore, "relayer unpaid");
    }

    function testAnyoneCanExpireAfterSeventyTwoHours() public {
        uint256 id = _send(2 ether, 5 minutes);
        uint256 senderBefore = sender.balance;

        vm.warp(block.timestamp + 72 hours);
        vm.prank(stranger);
        escrow.expire(id);

        (,,,,,, CtrlZEscrow.State state,) = escrow.payments(id);
        _assertEq(uint256(state), uint256(CtrlZEscrow.State.REFUNDED), "state");
        _assertEq(sender.balance, senderBefore + 2 ether, "sender refund");
    }

    function testExpireTooEarlyReverts() public {
        uint256 id = _send(1 ether, 5 minutes);

        vm.warp(block.timestamp + 72 hours - 1 seconds);
        vm.prank(stranger);
        vm.expectRevert(CtrlZEscrow.ExpireTooEarly.selector);
        escrow.expire(id);
    }

    function testExpireAfterClaimRejectedOrRecalledRevertsByState() public {
        uint256 claimedId = _send(1 ether, 5 minutes);
        _claimAsRecipient(claimedId);
        vm.warp(block.timestamp + 72 hours);
        vm.expectRevert(CtrlZEscrow.InvalidState.selector);
        escrow.expire(claimedId);

        uint256 rejectedId = _send(1 ether, 5 minutes);
        vm.prank(recipient);
        escrow.reject(rejectedId);
        vm.warp(block.timestamp + 72 hours);
        vm.expectRevert(CtrlZEscrow.InvalidState.selector);
        escrow.expire(rejectedId);

        uint256 recalledId = _send(1 ether, 5 minutes);
        vm.prank(sender);
        escrow.recall(recalledId, CtrlZEscrow.RecallReason.OTHER);
        vm.warp(block.timestamp + 72 hours);
        vm.expectRevert(CtrlZEscrow.InvalidState.selector);
        escrow.expire(recalledId);
    }

    function testExpireRefundAlwaysGoesToRefundToSender() public {
        uint256 id = _send(3 ether, 5 minutes);
        uint256 senderBefore = sender.balance;
        uint256 recipientBefore = recipient.balance;
        uint256 strangerBefore = stranger.balance;

        vm.warp(block.timestamp + 72 hours);
        vm.prank(stranger);
        escrow.expire(id);

        _assertEq(sender.balance, senderBefore + 3 ether, "sender refund");
        _assertEq(recipient.balance, recipientBefore, "recipient unchanged");
        _assertEq(stranger.balance, strangerBefore, "expirer unchanged");
    }

    function testPendingDoesNotUpdateRecipientCounters() public {
        _send(1 ether, 5 minutes);

        _assertRecipientCounters(recipient, 0, 0, 0, 0, "pending");
        _assertEq(escrow.hold(recipient), 30 minutes, "pending hold");
    }

    function testRecallRejectAndExpireDoNotUpdateRecipientCounters() public {
        uint256 recalledId = _send(1 ether, 5 minutes);
        vm.prank(sender);
        escrow.recall(recalledId, CtrlZEscrow.RecallReason.OTHER);

        uint256 rejectedId = _send(1 ether, 5 minutes);
        vm.prank(recipient);
        escrow.reject(rejectedId);

        uint256 expiredId = _send(1 ether, 5 minutes);
        vm.warp(block.timestamp + 72 hours);
        vm.prank(stranger);
        escrow.expire(expiredId);

        _assertRecipientCounters(recipient, 0, 0, 0, 0, "refunded");
        _assertEq(escrow.hold(recipient), 30 minutes, "refunded hold");
    }

    function testClaimUpdatesFirstSeenSealedCountAndDistinctSenderOnce() public {
        uint256 id = _send(1 ether, 5 minutes);

        _claimAsRecipient(id);

        _assertRecipientCounters(recipient, 1, 1, 0, uint64(block.timestamp), "claimed counters");
        _assertTrue(escrow.hasSealedFrom(recipient, sender), "sender seen");
        _assertEq(escrow.hold(recipient), 15 minutes, "first seal hold");
    }

    function testRepeatedClaimsFromSameSenderDoNotInflateDistinctSender() public {
        uint256 firstId = _send(1 ether, 5 minutes);
        _claimAsRecipient(firstId);
        uint64 firstSeen = uint64(block.timestamp);

        uint256 secondId = _send(1 ether, 5 minutes);
        _claimAsRecipient(secondId);

        _assertRecipientCounters(recipient, 2, 1, 0, firstSeen, "repeat sender");
    }

    function testTwoSendClaimsToSameRecipientShortenComputedHold() public {
        _assertEq(escrow.hold(recipient), 30 minutes, "unknown");

        uint256 firstId = _send(1 ether, 5 minutes);
        _claimAsRecipient(firstId);
        _assertEq(escrow.hold(recipient), 15 minutes, "first seal");

        uint256 secondId = _send(1 ether, 5 minutes);
        _claimAsRecipient(secondId);
        _assertEq(escrow.hold(recipient), 0, "two seals");
    }

    function testDistinctSenderCountsSenderOncePerRecipient() public {
        uint256 firstId = _send(1 ether, 5 minutes);
        _claimAsRecipient(firstId);

        uint256 secondId = _sendFrom(sender2, recipient, 1 ether, 5 minutes);
        _claimAsRecipient(secondId);

        _assertRecipientCounters(recipient, 2, 2, 0, escrow.firstSeen(recipient), "two senders");
        _assertTrue(escrow.hasSealedFrom(recipient, sender2), "sender2 seen");
    }

    function testFiveMinuteFloorRemainsUnbuyableThroughSendClaimableAt() public {
        uint256 firstId = _send(1 ether, 5 minutes);
        _claimAsRecipient(firstId);
        uint256 secondId = _send(1 ether, 5 minutes);
        _claimAsRecipient(secondId);

        uint256 id = _send(1 ether, 1 seconds);
        (,,, uint64 claimableAt,,,,) = escrow.payments(id);

        _assertEq(claimableAt, uint64(block.timestamp + 5 minutes), "floor");
    }

    function _send(uint256 amount, uint256 undoWin) private returns (uint256 id) {
        return _sendFrom(sender, recipient, amount, undoWin);
    }

    function _sendFrom(
        address paymentSender,
        address paymentRecipient,
        uint256 amount,
        uint256 undoWin
    ) private returns (uint256 id) {
        vm.prank(paymentSender);
        return escrow.send{ value: amount }(paymentRecipient, amount, undoWin);
    }

    function _claimAsRecipient(uint256 id) private {
        _warpToClaimable(id);
        vm.prank(recipient);
        escrow.claim(id);
    }

    function _warpToClaimable(uint256 id) private {
        (,,, uint64 claimableAt,,,,) = escrow.payments(id);
        vm.warp(claimableAt);
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

    function _assertRecipientCounters(
        address account,
        uint256 expectedSealed,
        uint256 expectedDistinct,
        uint256 expectedFlags,
        uint64 expectedFirstSeen,
        string memory label
    ) private view {
        _assertEq(escrow.sealedCount(account), expectedSealed, label);
        _assertEq(escrow.distinctSenderCount(account), expectedDistinct, label);
        _assertEq(escrow.flagCount(account), expectedFlags, label);
        _assertEq(escrow.firstSeen(account), expectedFirstSeen, label);
    }

    function _assertTrue(bool value, string memory label) private pure {
        if (!value) revert(string.concat(label, " false"));
    }
}
