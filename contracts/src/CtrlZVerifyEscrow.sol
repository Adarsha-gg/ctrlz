// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract CtrlZVerifyEscrow {
    string public constant NAME = "CTRL+Z Verify Escrow";
    uint16 public constant MAX_SCORE_BPS = 10_000;

    enum State {
        NONE,
        LOCKED,
        ACCEPTED,
        SUBMITTED,
        PAUSED,
        PAID,
        REFUNDED
    }

    enum VerificationResult {
        PASS,
        FAIL,
        UNCERTAIN
    }

    struct Task {
        address buyer;
        address worker;
        address resolver;
        uint256 amount;
        bytes32 specHash;
        bytes32 evidenceHash;
        State state;
        uint16 scoreBps;
        bytes32 recommendationHash;
    }

    uint256 public nextTaskId = 1;
    mapping(uint256 => Task) public tasks;

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
        VerificationResult result,
        bytes32 evidenceHash,
        uint16 scoreBps,
        bytes32 recommendationHash
    );
    event TaskPaid(uint256 indexed id, address indexed worker, uint256 amount);
    event TaskRefunded(uint256 indexed id, address indexed buyer, uint256 amount);

    error InvalidAddress();
    error InvalidAmount();
    error InvalidHash();
    error InvalidState();
    error InvalidScore();
    error NotBuyer();
    error NotWorker();
    error NotResolver();
    error TransferFailed();

    function lockTask(address worker, address resolver, bytes32 specHash)
        external
        payable
        returns (uint256 id)
    {
        if (worker == address(0) || resolver == address(0)) revert InvalidAddress();
        if (msg.value == 0) revert InvalidAmount();
        if (specHash == bytes32(0)) revert InvalidHash();

        id = nextTaskId++;
        tasks[id] = Task({
            buyer: msg.sender,
            worker: worker,
            resolver: resolver,
            amount: msg.value,
            specHash: specHash,
            evidenceHash: bytes32(0),
            state: State.LOCKED,
            scoreBps: 0,
            recommendationHash: bytes32(0)
        });

        emit TaskLocked(id, msg.sender, worker, resolver, msg.value, specHash);
    }

    function acceptTask(uint256 id) external {
        Task storage task = tasks[id];
        if (task.state != State.LOCKED) revert InvalidState();
        if (msg.sender != task.worker) revert NotWorker();

        task.state = State.ACCEPTED;

        emit TaskAccepted(id, msg.sender, task.specHash);
    }

    function submitOutput(uint256 id, bytes32 evidenceHash) external {
        Task storage task = tasks[id];
        if (task.state != State.ACCEPTED) revert InvalidState();
        if (msg.sender != task.worker) revert NotWorker();
        if (evidenceHash == bytes32(0)) revert InvalidHash();

        task.state = State.SUBMITTED;
        task.evidenceHash = evidenceHash;

        emit OutputSubmitted(id, msg.sender, evidenceHash);
    }

    function resolve(
        uint256 id,
        VerificationResult result,
        bytes32 evidenceHash,
        uint16 scoreBps,
        bytes32 recommendationHash
    ) external {
        Task storage task = tasks[id];
        if (task.state != State.SUBMITTED) revert InvalidState();
        if (msg.sender != task.resolver) revert NotResolver();
        if (evidenceHash == bytes32(0)) revert InvalidHash();
        if (scoreBps > MAX_SCORE_BPS) revert InvalidScore();

        task.evidenceHash = evidenceHash;
        task.scoreBps = scoreBps;
        task.recommendationHash = recommendationHash;

        emit TaskResolved(id, result, evidenceHash, scoreBps, recommendationHash);

        if (result == VerificationResult.PASS) {
            _payWorker(id, task);
        } else if (result == VerificationResult.FAIL) {
            _refundBuyer(id, task);
        } else {
            task.state = State.PAUSED;
        }
    }

    function buyerAcceptPaused(uint256 id, bytes32 recommendationHash) external {
        Task storage task = tasks[id];
        if (task.state != State.PAUSED) revert InvalidState();
        if (msg.sender != task.buyer) revert NotBuyer();

        task.recommendationHash = recommendationHash;
        _payWorker(id, task);
    }

    function buyerRefundPaused(uint256 id, bytes32 recommendationHash) external {
        Task storage task = tasks[id];
        if (task.state != State.PAUSED) revert InvalidState();
        if (msg.sender != task.buyer) revert NotBuyer();

        task.recommendationHash = recommendationHash;
        _refundBuyer(id, task);
    }

    function _payWorker(uint256 id, Task storage task) private {
        uint256 amount = task.amount;
        address worker = task.worker;
        task.state = State.PAID;
        task.amount = 0;

        emit TaskPaid(id, worker, amount);
        _sendValue(worker, amount);
    }

    function _refundBuyer(uint256 id, Task storage task) private {
        uint256 amount = task.amount;
        address buyer = task.buyer;
        task.state = State.REFUNDED;
        task.amount = 0;

        emit TaskRefunded(id, buyer, amount);
        _sendValue(buyer, amount);
    }

    function _sendValue(address to, uint256 amount) private {
        (bool ok,) = payable(to).call{ value: amount }("");
        if (!ok) revert TransferFailed();
    }
}
