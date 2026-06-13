// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract CtrlZEscrow {
    string public constant NAME = "CTRL+Z Escrow";
    bytes32 public constant CLAIM_FOR_TYPEHASH = keccak256(
        "CtrlZEscrowClaimFor(uint256 paymentId,address recipient,uint256 chainId,address verifyingContract)"
    );

    uint256 public constant MIN_UNDO_WINDOW = 5 minutes;
    uint256 public constant MAX_UNDO_WINDOW = 24 hours;
    uint256 public constant EXPIRY_WINDOW = 72 hours;
    uint256 public constant UNKNOWN_HOLD = 30 minutes;
    uint256 public constant FIRST_SEAL_HOLD = 15 minutes;
    uint256 public constant FLAGGED_HOLD = 24 hours;
    uint256 public constant FLAG_WINDOW = 30 days;

    enum State {
        NONE,
        PENDING,
        REFUNDED,
        SEALED
    }

    enum RecallReason {
        WRONG_ADDRESS,
        WRONG_AMOUNT,
        FRAUD_SUSPECTED,
        OTHER
    }

    struct Payment {
        address sender;
        address recipient;
        uint256 amount;
        uint64 claimableAt;
        uint64 expiresAt;
        address refundTo;
        State state;
        uint64 sealedAt;
    }

    uint256 public nextPaymentId = 1;
    mapping(uint256 => Payment) public payments;
    mapping(bytes32 => bool) public claimForHashUsed;
    mapping(address => uint256) public sealedCount;
    mapping(address => uint256) public distinctSenderCount;
    mapping(address => uint256) public flagCount;
    mapping(address => uint64) public firstSeen;
    mapping(address => mapping(address => bool)) public hasSealedFrom;
    mapping(uint256 => bool) public paymentFlagged;
    mapping(uint256 => bytes32) public proofHash;

    event Sent(
        uint256 indexed id,
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        uint64 claimableAt,
        uint64 expiresAt
    );
    event Recalled(
        uint256 indexed id,
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        RecallReason reason
    );
    event Rejected(
        uint256 indexed id, address indexed sender, address indexed recipient, uint256 amount
    );
    event Sealed(
        uint256 indexed id, address indexed sender, address indexed recipient, uint256 amount
    );
    event Expired(
        uint256 indexed id, address indexed sender, address indexed recipient, uint256 amount
    );
    event Flagged(uint256 indexed id, address indexed sender, address indexed recipient);
    event ProofAttached(
        uint256 indexed id, address indexed sender, address indexed recipient, bytes32 proofHash
    );

    error InvalidRecipient();
    error InvalidAmount();
    error InvalidState();
    error NotSender();
    error NotRecipient();
    error ClaimTooEarly();
    error ExpireTooEarly();
    error AlreadyFlagged();
    error FlagTooLate();
    error SignatureAlreadyUsed();
    error InvalidSignature();
    error TransferFailed();

    function send(address recipient, uint256 amount, uint256 undoWin)
        external
        payable
        returns (uint256 id)
    {
        if (recipient == address(0)) revert InvalidRecipient();
        if (amount == 0 || msg.value != amount) revert InvalidAmount();

        uint256 undoWindow = _clampUndoWindow(undoWin);
        uint256 riskHold = hold(recipient);
        uint64 claimableAt = uint64(block.timestamp + _max(undoWindow, riskHold));
        uint64 expiresAt = uint64(block.timestamp + EXPIRY_WINDOW);

        id = nextPaymentId++;
        payments[id] = Payment({
            sender: msg.sender,
            recipient: recipient,
            amount: amount,
            claimableAt: claimableAt,
            expiresAt: expiresAt,
            refundTo: msg.sender,
            state: State.PENDING,
            sealedAt: 0
        });

        emit Sent(id, msg.sender, recipient, amount, claimableAt, expiresAt);
    }

    function recall(uint256 id, RecallReason reason) external {
        Payment storage payment = payments[id];
        if (payment.state != State.PENDING) revert InvalidState();
        if (msg.sender != payment.sender) revert NotSender();

        uint256 amount = payment.amount;
        address refundTo = payment.refundTo;
        payment.state = State.REFUNDED;

        emit Recalled(id, payment.sender, payment.recipient, amount, reason);
        _sendValue(refundTo, amount);
    }

    function reject(uint256 id) external {
        Payment storage payment = payments[id];
        if (payment.state != State.PENDING) revert InvalidState();
        if (msg.sender != payment.recipient) revert NotRecipient();

        uint256 amount = payment.amount;
        address refundTo = payment.refundTo;
        payment.state = State.REFUNDED;

        emit Rejected(id, payment.sender, payment.recipient, amount);
        _sendValue(refundTo, amount);
    }

    function claim(uint256 id) external {
        Payment storage payment = payments[id];
        if (payment.state != State.PENDING) revert InvalidState();
        if (msg.sender != payment.recipient) revert NotRecipient();
        if (block.timestamp < payment.claimableAt) revert ClaimTooEarly();

        uint256 amount = payment.amount;
        address recipient = payment.recipient;
        address sender = payment.sender;
        payment.state = State.SEALED;
        payment.sealedAt = uint64(block.timestamp);
        _recordSealed(sender, recipient);

        emit Sealed(id, sender, recipient, amount);
        _sendValue(recipient, amount);
    }

    function claimFor(uint256 id, bytes calldata recipientSig) external {
        Payment storage payment = payments[id];
        bytes32 digest = claimForDigest(id);
        if (claimForHashUsed[digest]) revert SignatureAlreadyUsed();
        if (payment.state != State.PENDING) revert InvalidState();
        if (block.timestamp < payment.claimableAt) revert ClaimTooEarly();
        if (_recoverSigner(digest, recipientSig) != payment.recipient) revert InvalidSignature();

        uint256 amount = payment.amount;
        address recipient = payment.recipient;
        address sender = payment.sender;
        claimForHashUsed[digest] = true;
        payment.state = State.SEALED;
        payment.sealedAt = uint64(block.timestamp);
        _recordSealed(sender, recipient);

        emit Sealed(id, sender, recipient, amount);
        _sendValue(recipient, amount);
    }

    function expire(uint256 id) external {
        Payment storage payment = payments[id];
        if (payment.state != State.PENDING) revert InvalidState();
        if (block.timestamp < payment.expiresAt) revert ExpireTooEarly();

        uint256 amount = payment.amount;
        address refundTo = payment.refundTo;
        payment.state = State.REFUNDED;

        emit Expired(id, payment.sender, payment.recipient, amount);
        _sendValue(refundTo, amount);
    }

    function flag(uint256 id) external {
        Payment storage payment = payments[id];
        if (payment.state != State.SEALED) revert InvalidState();
        if (msg.sender != payment.sender) revert NotSender();
        if (paymentFlagged[id]) revert AlreadyFlagged();
        if (block.timestamp > payment.sealedAt + FLAG_WINDOW) revert FlagTooLate();

        paymentFlagged[id] = true;
        flagCount[payment.recipient]++;

        emit Flagged(id, payment.sender, payment.recipient);
    }

    function attachProof(uint256 id, bytes32 hash) external {
        Payment storage payment = payments[id];
        if (payment.state != State.SEALED) revert InvalidState();
        if (msg.sender != payment.recipient) revert NotRecipient();

        proofHash[id] = hash;

        emit ProofAttached(id, payment.sender, payment.recipient, hash);
    }

    function claimForDigest(uint256 id) public view returns (bytes32) {
        Payment storage payment = payments[id];
        bytes32 structHash = keccak256(
            abi.encode(CLAIM_FOR_TYPEHASH, id, payment.recipient, block.chainid, address(this))
        );
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", structHash));
    }

    function hold(address recipient) public view returns (uint256) {
        uint256 sealedPayments = sealedCount[recipient];
        uint256 flags = flagCount[recipient];
        uint256 distinctSenders = distinctSenderCount[recipient];
        uint64 seenAt = firstSeen[recipient];

        if (flags > 0 && flags >= sealedPayments) return FLAGGED_HOLD;
        if (seenAt == 0) return UNKNOWN_HOLD;
        if (sealedPayments >= 2 && distinctSenders >= 1) return 0;
        return FIRST_SEAL_HOLD;
    }

    function _recordSealed(address sender, address recipient) private {
        if (firstSeen[recipient] == 0) firstSeen[recipient] = uint64(block.timestamp);

        sealedCount[recipient]++;
        if (!hasSealedFrom[recipient][sender]) {
            hasSealedFrom[recipient][sender] = true;
            distinctSenderCount[recipient]++;
        }
    }

    function _clampUndoWindow(uint256 undoWin) private pure returns (uint256) {
        if (undoWin < MIN_UNDO_WINDOW) return MIN_UNDO_WINDOW;
        if (undoWin > MAX_UNDO_WINDOW) return MAX_UNDO_WINDOW;
        return undoWin;
    }

    function _max(uint256 a, uint256 b) private pure returns (uint256) {
        return a >= b ? a : b;
    }

    function _recoverSigner(bytes32 digest, bytes calldata signature)
        private
        pure
        returns (address)
    {
        if (signature.length != 65) revert InvalidSignature();

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 0x20))
            v := byte(0, calldataload(add(signature.offset, 0x40)))
        }

        if (v != 27 && v != 28) revert InvalidSignature();

        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
        return signer;
    }

    function _sendValue(address to, uint256 amount) private {
        (bool ok,) = payable(to).call{ value: amount }("");
        if (!ok) revert TransferFailed();
    }
}
