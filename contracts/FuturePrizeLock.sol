// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AirnodeV2Attestation} from "./oracle/AirnodeV2Attestation.sol";
import {ProjectedJson} from "./oracle/ProjectedJson.sol";
import {JSONParserLib} from "solady/utils/JSONParserLib.sol";

/// @title A prize funded against an authenticated, not-started match
/// @notice The funding and final proofs answer the same immutable request. No operator can change the schedule,
/// teams, recipients or timing policy after the initial unknown-result proof is accepted.
/// @dev Shares the unchanged official oracle libraries with PrizeLock V1. V1 source and deployments are untouched.
contract FuturePrizeLock {
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
        uint256 scheduledAt;
        uint256 endWindowStart;
        uint256 endWindowEnd;
        uint256 settlementDeadline;
        uint256 refundGrace;
        uint256 maxEnvelopeAge;
        uint256 finalityDelay;
        uint256 maxInitialSourceAge;
        uint256 maxFinalSourceAge;
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
    uint256 public immutable scheduledAt;
    uint256 public immutable endWindowStart;
    uint256 public immutable endWindowEnd;
    uint256 public immutable settlementDeadline;
    uint256 public immutable refundAvailableAt;
    uint256 public immutable maxEnvelopeAge;
    uint256 public immutable finalityDelay;
    uint256 public immutable maxInitialSourceAge;
    uint256 public immutable maxFinalSourceAge;

    State public state;
    uint256 public winningTeam;
    address public paidTo;
    bytes32 public acceptedProofHash;
    bytes32 public fundingProofHash;
    uint256 public fundingObservedAt;
    uint256 public fundedAt;

    error InvalidPolicy();
    error FundingClosed();
    error WrongFundingAmount();
    error AlreadyTerminalOrUnfunded();
    error SettlementClosed();
    error ResponseFromFuture();
    error ResponseTooOld();
    error WrongMatch();
    error WrongTeams();
    error WrongSchedule();
    error MatchAlreadyStarted();
    error ResultAlreadyKnown();
    error ResultNotFinal();
    error UnknownWinner();
    error InvalidSourceTime();
    error RefundNotAvailable();
    error TransferFailed();

    event PrizeFunded(address indexed funder, uint256 amount, bytes32 indexed proofHash, uint256 observedAt);
    event PrizePaid(
        uint256 indexed matchId, uint256 indexed winner, address indexed recipient, uint256 amount, bytes32 proofHash
    );
    event PrizeRefunded(address indexed organizer, uint256 amount);

    constructor(Policy memory p) {
        if (
            p.airnode == address(0) || p.requestHash == bytes32(0) || p.matchId == 0 || p.teamA == 0 || p.teamB == 0
                || p.teamA == p.teamB || p.walletA == address(0) || p.walletB == address(0) || p.walletA == p.walletB
                || p.organizer == address(0) || p.walletA == p.organizer || p.walletB == p.organizer || p.prizeWei == 0
                || p.fundingClosesAt < block.timestamp || p.fundingClosesAt >= p.scheduledAt
                || p.endWindowStart > p.scheduledAt || p.endWindowEnd < p.scheduledAt
                || p.endWindowEnd > p.settlementDeadline || p.maxEnvelopeAge == 0 || p.maxInitialSourceAge == 0
                || p.maxFinalSourceAge == 0
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
        scheduledAt = p.scheduledAt;
        endWindowStart = p.endWindowStart;
        endWindowEnd = p.endWindowEnd;
        settlementDeadline = p.settlementDeadline;
        refundAvailableAt = p.settlementDeadline + p.refundGrace;
        maxEnvelopeAge = p.maxEnvelopeAge;
        finalityDelay = p.finalityDelay;
        maxInitialSourceAge = p.maxInitialSourceAge;
        maxFinalSourceAge = p.maxFinalSourceAge;
    }

    /// @notice Funding itself requires a fresh, authenticated proof that the pinned match has not started.
    function fund(uint256 timestamp, bytes calldata data, bytes calldata signature) external payable {
        if (state != State.Unfunded) revert AlreadyTerminalOrUnfunded();
        if (msg.value != prizeWei) revert WrongFundingAmount();
        validateFundingResponse(timestamp, data, signature);
        state = State.Funded;
        fundingObservedAt = timestamp;
        fundedAt = block.timestamp;
        fundingProofHash = keccak256(abi.encode(timestamp, data, signature));
        emit PrizeFunded(msg.sender, msg.value, fundingProofHash, timestamp);
    }

    function validateFundingResponse(uint256 timestamp, bytes calldata data, bytes calldata signature) public view {
        authenticate(timestamp, data, signature);
        if (block.timestamp > fundingClosesAt || timestamp > fundingClosesAt) revert FundingClosed();
        if (scheduledAt <= block.timestamp) revert MatchAlreadyStarted();
        checkIdentity(data);
        if (keccak256(bytes(ProjectedJson.readString(data, "status"))) != keccak256("not_started")) {
            revert MatchAlreadyStarted();
        }
        if (!ProjectedJson.isNull(data, "winnerId") || !ProjectedJson.isNull(data, "endAt")) {
            revert ResultAlreadyKnown();
        }
        if (ProjectedJson.isNull(data, "modifiedAt")) revert InvalidSourceTime();
        uint256 modifiedAt = ProjectedJson.readTimestamp(data, "modifiedAt");
        if (modifiedAt > timestamp || block.timestamp - modifiedAt > maxInitialSourceAge) revert InvalidSourceTime();
    }

    /// @notice Check a final result independently of prize state. Missing or nonfinal observations release no money.
    function validateResponse(uint256 timestamp, bytes calldata data, bytes calldata signature)
        public
        view
        returns (uint256 winner, address payable recipient)
    {
        authenticate(timestamp, data, signature);
        checkIdentity(data);
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
            endedAt < endWindowStart || endedAt > endWindowEnd || endedAt < fundedAt || endedAt > timestamp
                || timestamp - endedAt < finalityDelay || modifiedAt < endedAt || modifiedAt > timestamp
                || modifiedAt > endWindowEnd || block.timestamp - modifiedAt > maxFinalSourceAge
        ) revert InvalidSourceTime();
        recipient = winner == teamA ? walletA : walletB;
    }

    function authenticate(uint256 timestamp, bytes calldata data, bytes calldata signature) private view {
        AirnodeV2Attestation.verify(airnode, requestHash, timestamp, data, signature);
        if (timestamp > block.timestamp) revert ResponseFromFuture();
        if (block.timestamp - timestamp > maxEnvelopeAge) revert ResponseTooOld();
    }

    function checkIdentity(bytes calldata data) private view {
        if (readId(data, "id") != matchId) revert WrongMatch();
        uint256 observedA = readId(data, "teamAId");
        uint256 observedB = readId(data, "teamBId");
        if (!((observedA == teamA && observedB == teamB) || (observedA == teamB && observedB == teamA))) {
            revert WrongTeams();
        }
        if (ProjectedJson.readTimestamp(data, "scheduledAt") != scheduledAt) revert WrongSchedule();
    }

    function readId(bytes calldata data, string memory key) private pure returns (uint256) {
        JSONParserLib.Item memory item = JSONParserLib.parse(string(data)).at(string.concat('"', key, '"'));
        if (!item.isNumber()) revert ProjectedJson.UnexpectedValue(key);
        return JSONParserLib.parseUint(item.value());
    }

    /// @notice A bounded agent, keeper or user may trigger payment, always to the immutable winner wallet.
    function submitResponse(uint256 timestamp, bytes calldata data, bytes calldata signature) external {
        if (state != State.Funded) revert AlreadyTerminalOrUnfunded();
        if (block.timestamp > settlementDeadline) revert SettlementClosed();
        (uint256 winner, address payable recipient) = validateResponse(timestamp, data, signature);
        bytes32 proofHash = keccak256(abi.encode(timestamp, data, signature));
        state = State.Paid;
        winningTeam = winner;
        paidTo = recipient;
        acceptedProofHash = proofHash;
        (bool success,) = recipient.call{value: prizeWei}("");
        if (!success) revert TransferFailed();
        emit PrizePaid(matchId, winner, recipient, prizeWei, proofHash);
    }

    /// @notice Canceled, rescheduled, unavailable and unresolved results share this immutable timeout refund.
    function refund() external {
        if (state != State.Funded) revert AlreadyTerminalOrUnfunded();
        if (block.timestamp < refundAvailableAt) revert RefundNotAvailable();
        state = State.Refunded;
        (bool success,) = organizer.call{value: prizeWei}("");
        if (!success) revert TransferFailed();
        emit PrizeRefunded(organizer, prizeWei);
    }
}
