// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title EazeeEscrow
 * @notice Escrow contract for Eazee WhatsApp product payments on Celo
 * @dev Accepts cUSD, cEUR, and cREAL stablecoin payments with time-locked escrow
 */
contract EazeeEscrow {
    address public owner;
    uint256 public escrowTimeout = 7 days;
    uint256 private _nextEscrowId;

    struct Escrow {
        uint256 id;
        address buyer;
        address seller;
        address token;
        uint256 amount;
        string productId;
        string productName;
        EscrowStatus status;
        uint256 createdAt;
        uint256 releasedAt;
    }

    enum EscrowStatus { Pending, Confirmed, Refunded }

    mapping(uint256 => Escrow) public escrows;
    mapping(address => bool) public supportedTokens;
    mapping(address => bool) public agents; // trusted agent addresses

    event PaymentDeposited(
        uint256 indexed escrowId,
        address indexed buyer,
        address indexed seller,
        address token,
        uint256 amount,
        string productId,
        string productName
    );

    event PaymentReleased(uint256 indexed escrowId, address indexed seller, uint256 amount);
    event PaymentRefunded(uint256 indexed escrowId, address indexed buyer, uint256 amount);
    event AgentUpdated(address indexed agent, bool trusted);
    event TokenSupportUpdated(address indexed token, bool supported);

    modifier onlyOwner() {
        require(msg.sender == owner, "EazeeEscrow: not owner");
        _;
    }

    modifier onlyAgent() {
        require(agents[msg.sender] || msg.sender == owner, "EazeeEscrow: not agent");
        _;
    }

    constructor() {
        owner = msg.sender;
        agents[msg.sender] = true;
    }

    /**
     * @notice Deposit payment into escrow for a product
     * @param seller The seller's address who will receive funds on release
     * @param token The ERC20 stablecoin address (cUSD, cEUR, cREAL)
     * @param amount The amount to escrow (in token's smallest unit)
     * @param productId Off-chain product ID from Eazee post
     * @param productName Human-readable product name
     */
    function deposit(
        address seller,
        address token,
        uint256 amount,
        string calldata productId,
        string calldata productName
    ) external returns (uint256 escrowId) {
        require(supportedTokens[token], "EazeeEscrow: token not supported");
        require(amount > 0, "EazeeEscrow: zero amount");
        require(seller != address(0), "EazeeEscrow: zero seller");
        require(seller != msg.sender, "EazeeEscrow: buyer is seller");

        IERC20(token).transferFrom(msg.sender, address(this), amount);

        escrowId = ++_nextEscrowId;

        escrows[escrowId] = Escrow({
            id: escrowId,
            buyer: msg.sender,
            seller: seller,
            token: token,
            amount: amount,
            productId: productId,
            productName: productName,
            status: EscrowStatus.Pending,
            createdAt: block.timestamp,
            releasedAt: 0
        });

        emit PaymentDeposited(escrowId, msg.sender, seller, token, amount, productId, productName);
    }

    /**
     * @notice Release escrowed funds to seller (called by agent after delivery confirmation)
     * @param escrowId The ID of the escrow to release
     */
    function release(uint256 escrowId) external onlyAgent {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.status == EscrowStatus.Pending, "EazeeEscrow: not pending");

        escrow.status = EscrowStatus.Confirmed;
        escrow.releasedAt = block.timestamp;

        IERC20(escrow.token).transfer(escrow.seller, escrow.amount);

        emit PaymentReleased(escrowId, escrow.seller, escrow.amount);
    }

    /**
     * @notice Refund buyer if escrow times out or delivery fails
     * @param escrowId The ID of the escrow to refund
     */
    function refund(uint256 escrowId) external {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.status == EscrowStatus.Pending, "EazeeEscrow: not pending");
        require(
            msg.sender == escrow.buyer ||
            agents[msg.sender] ||
            block.timestamp > escrow.createdAt + escrowTimeout,
            "EazeeEscrow: refund not allowed"
        );

        escrow.status = EscrowStatus.Refunded;

        IERC20(escrow.token).transfer(escrow.buyer, escrow.amount);

        emit PaymentRefunded(escrowId, escrow.buyer, escrow.amount);
    }

    // ── Admin Functions ──────────────────────────────────────────

    function setAgent(address agent, bool trusted) external onlyOwner {
        agents[agent] = trusted;
        emit AgentUpdated(agent, trusted);
    }

    function setTokenSupport(address token, bool supported) external onlyOwner {
        require(token != address(0), "EazeeEscrow: zero token");
        supportedTokens[token] = supported;
        emit TokenSupportUpdated(token, supported);
    }

    function setSupportedTokens(address[] calldata tokens, bool supported) external onlyOwner {
        uint256 tokenCount = tokens.length;
        for (uint256 i = 0; i < tokenCount; i++) {
            address token = tokens[i];
            require(token != address(0), "EazeeEscrow: zero token");
            supportedTokens[token] = supported;
            emit TokenSupportUpdated(token, supported);
        }
    }

    function setEscrowTimeout(uint256 timeoutSeconds) external onlyOwner {
        escrowTimeout = timeoutSeconds;
    }

    function getEscrow(uint256 escrowId) external view returns (Escrow memory) {
        return escrows[escrowId];
    }
}