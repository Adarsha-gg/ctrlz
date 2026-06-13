// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { CtrlZVerifyEscrow } from "../src/CtrlZVerifyEscrow.sol";

interface VerifyVm {
    function deal(address account, uint256 newBalance) external;
    function expectEmit(bool checkTopic1, bool checkTopic2, bool checkTopic3, bool checkData)
        external;
    function expectRevert(bytes4 selector) external;
    function prank(address sender) external;
}

contract CtrlZVerifyEscrowTest {
    VerifyVm private constant vm =
        VerifyVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    event TaskLocked(
        uint256 indexed id,
        address indexed buyer,
        address indexed worker,
        address resolver,
        uint256 amount,
        bytes32 specHash
    );
    event TaskAccepted(uint256 indexed id, address indexed worker, bytes32 specHash);
    event OutputSubmitted(uint256 indexed id, address indexed worker, bytes32 evidenceHash);
    event TaskResolved(
        uint256 indexed id,
        CtrlZVerifyEscrow.VerificationResult result,
        bytes32 evidenceHash,
        uint16 scoreBps,
        bytes32 recommendationHash
    );
    event TaskPaid(uint256 indexed id, address indexed worker, uint256 amount);
    event TaskRefunded(uint256 indexed id, address indexed buyer, uint256 amount);

    CtrlZVerifyEscrow private escrow;
    address private buyer = address(0xB0A);
    address private worker = address(0xA6E17);
    address private resolver = address(0xC4EC);
    address private stranger = address(0xBAD);
    bytes32 private specHash = keccak256("gpu-intent-spec");
    bytes32 private evidenceHash = keccak256("walrus-evidence-blob");
    bytes32 private recommendationHash = keccak256("proceed");

    function setUp() public {
        escrow = new CtrlZVerifyEscrow();
        vm.deal(buyer, 100 ether);
        vm.deal(worker, 1 ether);
        vm.deal(resolver, 1 ether);
        vm.deal(stranger, 1 ether);
    }

    function testLockTaskStoresSpecAndFunds() public {
        vm.expectEmit(true, true, true, true);
        emit TaskLocked(1, buyer, worker, resolver, 5 ether, specHash);

        uint256 id = _lock(5 ether);

        (
            address taskBuyer,
            address taskWorker,
            address taskResolver,
            uint256 amount,
            bytes32 storedSpecHash,
            bytes32 storedEvidenceHash,
            CtrlZVerifyEscrow.State state,
            uint16 scoreBps,
            bytes32 storedRecommendationHash
        ) = escrow.tasks(id);

        _assertEq(id, 1, "id");
        _assertEq(taskBuyer, buyer, "buyer");
        _assertEq(taskWorker, worker, "worker");
        _assertEq(taskResolver, resolver, "resolver");
        _assertEq(amount, 5 ether, "amount");
        _assertEq(storedSpecHash, specHash, "specHash");
        _assertEq(storedEvidenceHash, bytes32(0), "evidenceHash");
        _assertEq(uint256(state), uint256(CtrlZVerifyEscrow.State.LOCKED), "state");
        _assertEq(uint256(scoreBps), 0, "scoreBps");
        _assertEq(storedRecommendationHash, bytes32(0), "recommendationHash");
        _assertEq(address(escrow).balance, 5 ether, "escrow balance");
    }

    function testWorkerMustAcceptBeforeSubmit() public {
        uint256 id = _lock(1 ether);

        vm.prank(stranger);
        vm.expectRevert(CtrlZVerifyEscrow.NotWorker.selector);
        escrow.acceptTask(id);

        vm.expectEmit(true, true, true, true);
        emit TaskAccepted(id, worker, specHash);

        vm.prank(worker);
        escrow.acceptTask(id);

        vm.expectEmit(true, true, true, true);
        emit OutputSubmitted(id, worker, evidenceHash);

        vm.prank(worker);
        escrow.submitOutput(id, evidenceHash);

        (,,,,, bytes32 storedEvidenceHash, CtrlZVerifyEscrow.State state,,) = escrow.tasks(id);
        _assertEq(storedEvidenceHash, evidenceHash, "evidenceHash");
        _assertEq(uint256(state), uint256(CtrlZVerifyEscrow.State.SUBMITTED), "state");
    }

    function testPassResolutionPaysWorker() public {
        uint256 id = _submittedTask(5 ether);
        uint256 workerBefore = worker.balance;

        vm.expectEmit(true, false, false, true);
        emit TaskResolved(
            id, CtrlZVerifyEscrow.VerificationResult.PASS, evidenceHash, 9_200, recommendationHash
        );
        vm.expectEmit(true, true, false, true);
        emit TaskPaid(id, worker, 5 ether);

        vm.prank(resolver);
        escrow.resolve(
            id, CtrlZVerifyEscrow.VerificationResult.PASS, evidenceHash, 9_200, recommendationHash
        );

        (,,, uint256 amount,,, CtrlZVerifyEscrow.State state,,) = escrow.tasks(id);
        _assertEq(uint256(state), uint256(CtrlZVerifyEscrow.State.PAID), "state");
        _assertEq(amount, 0, "amount zeroed");
        _assertEq(worker.balance, workerBefore + 5 ether, "worker paid");
    }

    function testObjectiveFailResolutionRefundsBuyer() public {
        uint256 id = _submittedTask(3 ether);
        uint256 buyerBefore = buyer.balance;

        vm.expectEmit(true, false, false, true);
        emit TaskResolved(
            id, CtrlZVerifyEscrow.VerificationResult.FAIL, evidenceHash, 1_200, keccak256("reject")
        );
        vm.expectEmit(true, true, false, true);
        emit TaskRefunded(id, buyer, 3 ether);

        vm.prank(resolver);
        escrow.resolve(
            id, CtrlZVerifyEscrow.VerificationResult.FAIL, evidenceHash, 1_200, keccak256("reject")
        );

        (,,, uint256 amount,,, CtrlZVerifyEscrow.State state,,) = escrow.tasks(id);
        _assertEq(uint256(state), uint256(CtrlZVerifyEscrow.State.REFUNDED), "state");
        _assertEq(amount, 0, "amount zeroed");
        _assertEq(buyer.balance, buyerBefore + 3 ether, "buyer refunded");
    }

    function testUncertainPausesForBuyerDecision() public {
        uint256 id = _submittedTask(2 ether);

        vm.prank(resolver);
        escrow.resolve(
            id,
            CtrlZVerifyEscrow.VerificationResult.UNCERTAIN,
            evidenceHash,
            5_100,
            keccak256("pause")
        );

        (,,,,,, CtrlZVerifyEscrow.State state,, bytes32 storedRecommendationHash) = escrow.tasks(id);
        _assertEq(uint256(state), uint256(CtrlZVerifyEscrow.State.PAUSED), "paused");
        _assertEq(storedRecommendationHash, keccak256("pause"), "recommendation");

        uint256 workerBefore = worker.balance;
        vm.prank(stranger);
        vm.expectRevert(CtrlZVerifyEscrow.NotBuyer.selector);
        escrow.buyerAcceptPaused(id, recommendationHash);

        vm.prank(buyer);
        escrow.buyerAcceptPaused(id, recommendationHash);

        (,,, uint256 amountAfter,,, CtrlZVerifyEscrow.State finalState,,) = escrow.tasks(id);
        _assertEq(uint256(finalState), uint256(CtrlZVerifyEscrow.State.PAID), "paid");
        _assertEq(amountAfter, 0, "amount zeroed");
        _assertEq(worker.balance, workerBefore + 2 ether, "worker paid");
    }

    function testOnlyResolverCanResolveAndScoreIsBounded() public {
        uint256 id = _submittedTask(1 ether);

        vm.prank(stranger);
        vm.expectRevert(CtrlZVerifyEscrow.NotResolver.selector);
        escrow.resolve(
            id, CtrlZVerifyEscrow.VerificationResult.PASS, evidenceHash, 9_000, recommendationHash
        );

        vm.prank(resolver);
        vm.expectRevert(CtrlZVerifyEscrow.InvalidScore.selector);
        escrow.resolve(
            id, CtrlZVerifyEscrow.VerificationResult.PASS, evidenceHash, 10_001, recommendationHash
        );
    }

    function _submittedTask(uint256 amount) private returns (uint256 id) {
        id = _lock(amount);
        vm.prank(worker);
        escrow.acceptTask(id);
        vm.prank(worker);
        escrow.submitOutput(id, evidenceHash);
    }

    function _lock(uint256 amount) private returns (uint256 id) {
        vm.prank(buyer);
        id = escrow.lockTask{ value: amount }(worker, resolver, specHash);
    }

    function _assertEq(uint256 actual, uint256 expected, string memory label) private pure {
        if (actual != expected) revert(string.concat(label, " mismatch"));
    }

    function _assertEq(address actual, address expected, string memory label) private pure {
        if (actual != expected) revert(string.concat(label, " mismatch"));
    }

    function _assertEq(bytes32 actual, bytes32 expected, string memory label) private pure {
        if (actual != expected) revert(string.concat(label, " mismatch"));
    }
}
