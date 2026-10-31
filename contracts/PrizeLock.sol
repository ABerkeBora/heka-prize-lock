// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AirnodeV2Attestation} from "./oracle/AirnodeV2Attestation.sol";
import {ProjectedJson} from "./oracle/ProjectedJson.sol";
import {JSONParserLib} from "solady/utils/JSONParserLib.sol";

/// @title One pre-funded prize, released by a pinned PandaScore Airnode response
/// @notice A fresh attestation authenticates the source's observation. It does not guarantee the match result is true.
/// @dev No administrator can replace the match, request, signer, team wallets, or timing rules after deployment.
contract PrizeLock {
    using JSONParserLib for JSONParserLib.Item;
    enum State {
        Unfunded,
        Funded,
        Paid,
        Refunded
    }

    struct Policy {
        address airnode;
        bytes32 requestHash;
        uint256 matchId;
        uint256 teamA;
        uint256 teamB;
        address payable walletA;
        address payable walletB;
        address payable organizer;
        uint256 prizeWei;
        uint256 fundingClosesAt;
        uint256 settlementDeadline;
        uint256 refundGrace;
        uint256 maxEnvelopeAge;
        uint256 finalityDelay;
        uint256 sourceObservationMin;
        uint256 sourceObservationMax;
    }

    address public immutable airnode;
    bytes32 public immutable requestHash;
    uint256 public immutable matchId;
    uint256 public immutable teamA;
    uint256 public immutable teamB;
    address payable public immutable walletA;
    address payable public immutable walletB;
    address payable public immutable organizer;
    uint256 public immutable prizeWei;
    uint256 public immutable fundingClosesAt;
    uint256 public immutable settlementDeadline;
    uint256 public immutable refundAvailableAt;
    uint256 public immutable maxEnvelopeAge;
    uint256 public immutable finalityDelay;
    uint256 public immutable sourceObservationMin;
    uint256 public immutable sourceObservationMax;

    State public state;
    uint256 public winningTeam;
    address public paidTo;
    bytes32 public acceptedProofHash;

    error InvalidPolicy();
    error FundingClosed();
    error WrongFundingAmount();
    error AlreadyTerminalOrUnfunded();
    error SettlementClosed();
    error ResponseFromFuture();
    error ResponseTooOld();
    error WrongMatch();
    error ResultNotFinal();
    error UnknownWinner();
    error InvalidSourceTime();
    error RefundNotAvailable();
    error TransferFailed();

    event PrizeFunded(address indexed funder, uint256 amount);
    event PrizePaid(
        uint256 indexed matchId, uint256 indexed winner, address indexed recipient, uint256 amount, bytes32 proofHash
    );
    event PrizeRefunded(address indexed organizer, uint256 amount);

    constructor(Policy memory p) {
        if (
            p.airnode == address(0) || p.requestHash == bytes32(0) || p.matchId == 0 || p.teamA == 0 || p.teamB == 0
                || p.teamA == p.teamB || p.walletA == address(0) || p.walletB == address(0) || p.walletA == p.walletB
                || p.organizer == address(0) || p.walletA == p.organizer || p.walletB == p.organizer || p.prizeWei == 0
                || p.fundingClosesAt < block.timestamp || p.settlementDeadline < p.fundingClosesAt
                || p.maxEnvelopeAge == 0 || p.sourceObservationMin > p.sourceObservationMax
        ) revert InvalidPolicy();
        airnode = p.airnode;
        requestHash = p.requestHash;
        matchId = p.matchId;
        teamA = p.teamA;
        teamB = p.teamB;
        walletA = p.walletA;
        walletB = p.walletB;
        organizer = p.organizer;
        prizeWei = p.prizeWei;
        fundingClosesAt = p.fundingClosesAt;
        settlementDeadline = p.settlementDeadline;
        refundAvailableAt = p.settlementDeadline + p.refundGrace;
        maxEnvelopeAge = p.maxEnvelopeAge;
        finalityDelay = p.finalityDelay;
        sourceObservationMin = p.sourceObservationMin;
        sourceObservationMax = p.sourceObservationMax;
    }

    /// @notice Fund exactly the promised prize. No underfunded prize can become active.
    function fund() external payable {
        if (state != State.Unfunded) revert AlreadyTerminalOrUnfunded();
        if (block.timestamp > fundingClosesAt) revert FundingClosed();
        if (msg.value != prizeWei) revert WrongFundingAmount();
        state = State.Funded;
        emit PrizeFunded(msg.sender, msg.value);
    }

    /// @notice Verify independently of prize state so judges can test a proof even after payout.
    /// @dev Pass the exact UTF-8 bytes of the Airnode `data` string; do not parse and serialize it again.
    function validateResponse(uint256 timestamp, bytes calldata data, bytes calldata signature)
        public
        view
        returns (uint256 winner, address payable recipient)
    {
        AirnodeV2Attestation.verify(airnode, requestHash, timestamp, data, signature);
        if (timestamp > block.timestamp) revert ResponseFromFuture();
        if (block.timestamp - timestamp > maxEnvelopeAge) revert ResponseTooOld();
        if (readId(data, "id") != matchId) revert WrongMatch();
        if (keccak256(bytes(ProjectedJson.readString(data, "status"))) != keccak256("finished")) {
            revert ResultNotFinal();
        }
        if (
            ProjectedJson.isNull(data, "winnerId") || ProjectedJson.isNull(data, "endAt")
                || ProjectedJson.isNull(data, "modifiedAt")
        ) revert ResultNotFinal();
        winner = readId(data, "winnerId");
        if (winner != teamA && winner != teamB) revert UnknownWinner();
        uint256 endedAt = ProjectedJson.readTimestamp(data, "endAt");
        uint256 modifiedAt = ProjectedJson.readTimestamp(data, "modifiedAt");
        if (
            endedAt > timestamp || timestamp - endedAt < finalityDelay || modifiedAt < endedAt || modifiedAt > timestamp
                || modifiedAt < sourceObservationMin || modifiedAt > sourceObservationMax
        ) revert InvalidSourceTime();
        recipient = winner == teamA ? walletA : walletB;
    }

    /// @dev IDs must be unsigned JSON integers. ProjectedJson.readUint(..., 0) deliberately truncates decimals,
    /// which is useful for prices but would turn a malformed winner ID such as 10.5 into team 10.
    function readId(bytes calldata data, string memory key) private pure returns (uint256) {
        JSONParserLib.Item memory item = JSONParserLib.parse(string(data)).at(string.concat('"', key, '"'));
        if (!item.isNumber()) revert ProjectedJson.UnexpectedValue(key);
        return JSONParserLib.parseUint(item.value());
    }

    /// @notice A user, keeper, or agent can trigger payment. The recipient always comes from the immutable policy.
    function submitResponse(uint256 timestamp, bytes calldata data, bytes calldata signature) external {
        if (state != State.Funded) revert AlreadyTerminalOrUnfunded();
        if (block.timestamp > settlementDeadline) revert SettlementClosed();
        (uint256 winner, address payable recipient) = validateResponse(timestamp, data, signature);
        bytes32 proofHash = keccak256(abi.encode(timestamp, data, signature));
        // Effects precede the external call: reentrancy cannot pay or refund twice.
        state = State.Paid;
        winningTeam = winner;
        paidTo = recipient;
        acceptedProofHash = proofHash;
        (bool success,) = recipient.call{value: prizeWei}("");
        if (!success) revert TransferFailed();
        emit PrizePaid(matchId, winner, recipient, prizeWei, proofHash);
    }

    /// @notice Missing, postponed, canceled, null-winner, and unresolved results share one fixed timeout policy.
    /// The grace interval cannot pay late proofs, and only the pinned organizer receives a refund.
    function refund() external {
        if (state != State.Funded) revert AlreadyTerminalOrUnfunded();
        if (block.timestamp < refundAvailableAt) revert RefundNotAvailable();
        state = State.Refunded;
        (bool success,) = organizer.call{value: prizeWei}("");
        if (!success) revert TransferFailed();
        emit PrizeRefunded(organizer, prizeWei);
    }
}
