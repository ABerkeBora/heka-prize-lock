// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FuturePrizeLock} from "../contracts/FuturePrizeLock.sol";
import {AirnodeV2Attestation} from "../contracts/oracle/AirnodeV2Attestation.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Vm} from "./PrizeLock.t.sol";

contract FuturePrizeLockTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 internal constant NOW = 1793404800; // 2026-10-31T00:00:00Z
    uint256 internal constant FINAL = NOW + 11100; // 03:05:00Z
    uint256 internal constant KEY = 0xA11CE;
    bytes32 internal constant REQUEST = keccak256("future-getMatch-eight-field-projection");
    uint256 internal constant PRIZE = 0.0001 ether;
    address payable internal constant A = payable(address(0xA11));
    address payable internal constant B = payable(address(0xB11));
    address payable internal constant ORGANIZER = payable(address(0xC11));
    FuturePrizeLock internal lock;

    struct Observation {
        uint256 id;
        uint256 teamA;
        uint256 teamB;
        string status;
        uint256 winner;
        string endAt;
        string modifiedAt;
        string scheduledAt;
    }

    function policy() internal returns (FuturePrizeLock.Policy memory p) {
        p = FuturePrizeLock.Policy({
            airnode: vm.addr(KEY),
            requestHash: REQUEST,
            matchId: 123,
            teamA: 10,
            teamB: 20,
            walletA: A,
            walletB: B,
            organizer: ORGANIZER,
            prizeWei: PRIZE,
            fundingClosesAt: NOW + 3600,
            scheduledAt: NOW + 7200,
            endWindowStart: NOW + 5400,
            endWindowEnd: NOW + 28800,
            settlementDeadline: NOW + 36000,
            refundGrace: 600,
            maxEnvelopeAge: 180,
            finalityDelay: 120,
            maxInitialSourceAge: 7 days,
            maxFinalSourceAge: 3600
        });
    }

    function setUp() public {
        vm.warp(NOW);
        vm.deal(address(this), 10 ether);
        lock = new FuturePrizeLock(policy());
    }

    function pending() internal pure returns (Observation memory o) {
        o = Observation(123, 10, 20, "not_started", 0, "", "2026-10-31T00:00:00Z", "2026-10-31T02:00:00Z");
    }

    function finished() internal pure returns (Observation memory o) {
        o = Observation(
            123, 10, 20, "finished", 10, "2026-10-31T03:00:00Z", "2026-10-31T03:01:00Z", "2026-10-31T02:00:00Z"
        );
    }

    function nullable(string memory value) internal pure returns (string memory) {
        return bytes(value).length == 0 ? "null" : string.concat('"', value, '"');
    }

    function encode(Observation memory o) internal pure returns (bytes memory) {
        string memory identity = string.concat(
            '{"id":',
            Strings.toString(o.id),
            ',"teamAId":',
            Strings.toString(o.teamA),
            ',"teamBId":',
            Strings.toString(o.teamB)
        );
        string memory outcome = string.concat(
            ',"status":"',
            o.status,
            '","winnerId":',
            o.winner == 0 ? "null" : Strings.toString(o.winner),
            ',"endAt":',
            nullable(o.endAt)
        );
        return bytes(
            string.concat(
                identity,
                outcome,
                ',"modifiedAt":',
                nullable(o.modifiedAt),
                ',"scheduledAt":',
                nullable(o.scheduledAt),
                "}"
            )
        );
    }

    function sign(uint256 key, bytes32 request, uint256 timestamp, bytes memory data) internal returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked(request, timestamp, data));
        bytes32 personal = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, personal);
        return abi.encodePacked(r, s, v);
    }

    function fund() internal {
        bytes memory data = encode(pending());
        lock.fund{value: PRIZE}(NOW, data, sign(KEY, REQUEST, NOW, data));
    }

    function finish(Observation memory o) internal {
        bytes memory data = encode(o);
        lock.submitResponse(FINAL, data, sign(KEY, REQUEST, FINAL, data));
    }

    function untouched(bool funded) internal view {
        require(
            lock.state() == (funded ? FuturePrizeLock.State.Funded : FuturePrizeLock.State.Unfunded), "state changed"
        );
        require(address(lock).balance == (funded ? PRIZE : 0), "prize changed");
        require(lock.paidTo() == address(0) && lock.winningTeam() == 0, "recipient changed");
    }

    function test_FundsUnknownFutureResultAndKeepsPrizeWaiting() public {
        fund();
        untouched(true);
        require(lock.fundingObservedAt() == NOW && lock.fundedAt() == NOW, "funding times missing");
        require(lock.fundingProofHash() != bytes32(0), "funding proof missing");
        bytes memory data = encode(pending());
        bytes memory signature = sign(KEY, REQUEST, NOW, data);
        vm.expectRevert(FuturePrizeLock.ResultNotFinal.selector);
        lock.submitResponse(NOW, data, signature);
        untouched(true);
    }

    function test_FundingAcceptsProviderTeamReordering() public {
        Observation memory o = pending();
        o.teamA = 20;
        o.teamB = 10;
        bytes memory data = encode(o);
        lock.fund{value: PRIZE}(NOW, data, sign(KEY, REQUEST, NOW, data));
        untouched(true);
    }

    function test_RejectsAlreadyKnownWinnerAtFunding() public {
        Observation memory o = pending();
        o.winner = 10;
        bytes memory data = encode(o);
        bytes memory signature = sign(KEY, REQUEST, NOW, data);
        vm.expectRevert(FuturePrizeLock.ResultAlreadyKnown.selector);
        lock.fund{value: PRIZE}(NOW, data, signature);
        untouched(false);
    }

    function test_RejectsAlreadyKnownEndAtFunding() public {
        Observation memory o = pending();
        o.endAt = "2026-10-30T23:59:00Z";
        bytes memory data = encode(o);
        bytes memory signature = sign(KEY, REQUEST, NOW, data);
        vm.expectRevert(FuturePrizeLock.ResultAlreadyKnown.selector);
        lock.fund{value: PRIZE}(NOW, data, signature);
        untouched(false);
    }

    function test_RejectsRunningMatchFunding() public {
        Observation memory o = pending();
        o.status = "running";
        bytes memory data = encode(o);
        bytes memory signature = sign(KEY, REQUEST, NOW, data);
        vm.expectRevert(FuturePrizeLock.MatchAlreadyStarted.selector);
        lock.fund{value: PRIZE}(NOW, data, signature);
        untouched(false);
    }

    function test_RejectsFundingAfterClose() public {
        vm.warp(lock.fundingClosesAt() + 1);
        uint256 timestamp = block.timestamp;
        Observation memory o = pending();
        bytes memory data = encode(o);
        bytes memory signature = sign(KEY, REQUEST, timestamp, data);
        vm.expectRevert(FuturePrizeLock.FundingClosed.selector);
        lock.fund{value: PRIZE}(timestamp, data, signature);
        untouched(false);
    }

    function test_RejectsFundingWithStaleEnvelope() public {
        bytes memory data = encode(pending());
        bytes memory signature = sign(KEY, REQUEST, NOW, data);
        vm.warp(NOW + 181);
        vm.expectRevert(FuturePrizeLock.ResponseTooOld.selector);
        lock.fund{value: PRIZE}(NOW, data, signature);
        untouched(false);
    }

    function test_RejectsFundingWithOldSourceUnderFreshEnvelope() public {
        Observation memory o = pending();
        o.modifiedAt = "2026-10-20T00:00:00Z";
        bytes memory data = encode(o);
        bytes memory signature = sign(KEY, REQUEST, NOW, data);
        vm.expectRevert(FuturePrizeLock.InvalidSourceTime.selector);
        lock.fund{value: PRIZE}(NOW, data, signature);
        untouched(false);
    }

    function test_RejectsWrongMatchAndTeamsAtFunding() public {
        Observation memory o = pending();
        o.id = 124;
        bytes memory data = encode(o);
        bytes memory signature = sign(KEY, REQUEST, NOW, data);
        vm.expectRevert(FuturePrizeLock.WrongMatch.selector);
        lock.fund{value: PRIZE}(NOW, data, signature);
        o = pending();
        o.teamB = 30;
        data = encode(o);
        signature = sign(KEY, REQUEST, NOW, data);
        vm.expectRevert(FuturePrizeLock.WrongTeams.selector);
        lock.fund{value: PRIZE}(NOW, data, signature);
        untouched(false);
    }

    function test_RejectsChangedFundingSchedule() public {
        Observation memory o = pending();
        o.scheduledAt = "2026-10-31T02:01:00Z";
        bytes memory data = encode(o);
        bytes memory signature = sign(KEY, REQUEST, NOW, data);
        vm.expectRevert(FuturePrizeLock.WrongSchedule.selector);
        lock.fund{value: PRIZE}(NOW, data, signature);
        untouched(false);
    }

    function test_RejectsFundingWrongSignerAndRequest() public {
        bytes memory data = encode(pending());
        bytes memory signature = sign(0xBAD, REQUEST, NOW, data);
        vm.expectPartialRevert(AirnodeV2Attestation.NotSignedByAirnode.selector);
        lock.fund{value: PRIZE}(NOW, data, signature);
        signature = sign(KEY, keccak256("other-request"), NOW, data);
        vm.expectPartialRevert(AirnodeV2Attestation.NotSignedByAirnode.selector);
        lock.fund{value: PRIZE}(NOW, data, signature);
        untouched(false);
    }

    function test_RejectsEditedFundingValue() public {
        bytes memory original = encode(pending());
        bytes memory signature = sign(KEY, REQUEST, NOW, original);
        Observation memory o = pending();
        o.id = 124;
        vm.expectPartialRevert(AirnodeV2Attestation.NotSignedByAirnode.selector);
        lock.fund{value: PRIZE}(NOW, encode(o), signature);
        untouched(false);
    }

    function test_RejectsUnderfundingAndDuplicateFunding() public {
        bytes memory data = encode(pending());
        bytes memory signature = sign(KEY, REQUEST, NOW, data);
        vm.expectRevert(FuturePrizeLock.WrongFundingAmount.selector);
        lock.fund{value: PRIZE - 1}(NOW, data, signature);
        untouched(false);
        lock.fund{value: PRIZE}(NOW, data, signature);
        vm.expectRevert(FuturePrizeLock.AlreadyTerminalOrUnfunded.selector);
        lock.fund{value: PRIZE}(NOW, data, signature);
        untouched(true);
    }

    function test_LaterFinalResultPaysFixedWinnerOnce() public {
        fund();
        vm.warp(FINAL);
        uint256 beforeBalance = A.balance;
        finish(finished());
        require(lock.state() == FuturePrizeLock.State.Paid && A.balance == beforeBalance + PRIZE, "winner not paid");
        require(lock.paidTo() == A && lock.winningTeam() == 10 && address(lock).balance == 0, "wrong payout");
        bytes memory data = encode(finished());
        bytes memory signature = sign(KEY, REQUEST, FINAL, data);
        vm.expectRevert(FuturePrizeLock.AlreadyTerminalOrUnfunded.selector);
        lock.submitResponse(FINAL, data, signature);
        vm.expectRevert(FuturePrizeLock.AlreadyTerminalOrUnfunded.selector);
        lock.refund();
        require(A.balance == beforeBalance + PRIZE, "paid twice");
    }

    function test_FinalTeamReorderingDoesNotChangeWinnerRecipient() public {
        fund();
        vm.warp(FINAL);
        Observation memory o = finished();
        o.teamA = 20;
        o.teamB = 10;
        o.winner = 20;
        uint256 beforeBalance = B.balance;
        finish(o);
        require(lock.paidTo() == B && B.balance == beforeBalance + PRIZE, "order chose recipient");
    }

    function test_RejectsEditedFinalValue() public {
        fund();
        vm.warp(FINAL);
        bytes memory original = encode(finished());
        bytes memory signature = sign(KEY, REQUEST, FINAL, original);
        Observation memory o = finished();
        o.winner = 20;
        vm.expectPartialRevert(AirnodeV2Attestation.NotSignedByAirnode.selector);
        lock.submitResponse(FINAL, encode(o), signature);
        untouched(true);
    }

    function test_RejectsStaleFinalEnvelope() public {
        fund();
        vm.warp(FINAL + 181);
        bytes memory data = encode(finished());
        bytes memory signature = sign(KEY, REQUEST, FINAL, data);
        vm.expectRevert(FuturePrizeLock.ResponseTooOld.selector);
        lock.submitResponse(FINAL, data, signature);
        untouched(true);
    }

    function test_RejectsWrongFinalSignerAndRequest() public {
        fund();
        vm.warp(FINAL);
        bytes memory data = encode(finished());
        bytes memory signature = sign(0xBAD, REQUEST, FINAL, data);
        vm.expectPartialRevert(AirnodeV2Attestation.NotSignedByAirnode.selector);
        lock.submitResponse(FINAL, data, signature);
        signature = sign(KEY, keccak256("other-request"), FINAL, data);
        vm.expectPartialRevert(AirnodeV2Attestation.NotSignedByAirnode.selector);
        lock.submitResponse(FINAL, data, signature);
        untouched(true);
    }

    function test_RejectsNullWinnerOrEndInFinalResult() public {
        fund();
        vm.warp(FINAL);
        Observation memory o = finished();
        o.winner = 0;
        bytes memory data = encode(o);
        bytes memory signature = sign(KEY, REQUEST, FINAL, data);
        vm.expectRevert(FuturePrizeLock.ResultNotFinal.selector);
        lock.submitResponse(FINAL, data, signature);
        o = finished();
        o.endAt = "";
        data = encode(o);
        signature = sign(KEY, REQUEST, FINAL, data);
        vm.expectRevert(FuturePrizeLock.ResultNotFinal.selector);
        lock.submitResponse(FINAL, data, signature);
        untouched(true);
    }

    function test_RejectsPendingCanceledAndRescheduledWithoutPayout() public {
        fund();
        vm.warp(FINAL);
        Observation memory o = pending();
        o.status = "canceled";
        bytes memory data = encode(o);
        bytes memory signature = sign(KEY, REQUEST, FINAL, data);
        vm.expectRevert(FuturePrizeLock.ResultNotFinal.selector);
        lock.submitResponse(FINAL, data, signature);
        o = finished();
        o.scheduledAt = "2026-10-31T03:00:00Z";
        data = encode(o);
        signature = sign(KEY, REQUEST, FINAL, data);
        vm.expectRevert(FuturePrizeLock.WrongSchedule.selector);
        lock.submitResponse(FINAL, data, signature);
        untouched(true);
    }

    function test_RejectsUnknownWinnerAndWrongFinalTeamSet() public {
        fund();
        vm.warp(FINAL);
        Observation memory o = finished();
        o.winner = 30;
        bytes memory data = encode(o);
        bytes memory signature = sign(KEY, REQUEST, FINAL, data);
        vm.expectRevert(FuturePrizeLock.UnknownWinner.selector);
        lock.submitResponse(FINAL, data, signature);
        o = finished();
        o.teamB = 30;
        data = encode(o);
        signature = sign(KEY, REQUEST, FINAL, data);
        vm.expectRevert(FuturePrizeLock.WrongTeams.selector);
        lock.submitResponse(FINAL, data, signature);
        untouched(true);
    }

    function test_RejectsEndOutsidePinnedWindow() public {
        fund();
        vm.warp(FINAL);
        Observation memory o = finished();
        o.endAt = "2026-10-31T01:00:00Z";
        bytes memory data = encode(o);
        bytes memory signature = sign(KEY, REQUEST, FINAL, data);
        vm.expectRevert(FuturePrizeLock.InvalidSourceTime.selector);
        lock.submitResponse(FINAL, data, signature);
        untouched(true);
    }

    function test_RejectsEndBeforeActualFundingEvenInsideConfiguredWindow() public {
        FuturePrizeLock.Policy memory p = policy();
        p.endWindowStart = NOW - 3600;
        lock = new FuturePrizeLock(p);
        fund();
        vm.warp(FINAL);
        Observation memory o = finished();
        o.endAt = "2026-10-30T23:59:00Z";
        bytes memory data = encode(o);
        bytes memory signature = sign(KEY, REQUEST, FINAL, data);
        vm.expectRevert(FuturePrizeLock.InvalidSourceTime.selector);
        lock.submitResponse(FINAL, data, signature);
        untouched(true);
    }

    function test_RejectsShortFinalityDelay() public {
        fund();
        vm.warp(FINAL);
        Observation memory o = finished();
        o.endAt = "2026-10-31T03:04:00Z";
        o.modifiedAt = "2026-10-31T03:04:30Z";
        bytes memory data = encode(o);
        bytes memory signature = sign(KEY, REQUEST, FINAL, data);
        vm.expectRevert(FuturePrizeLock.InvalidSourceTime.selector);
        lock.submitResponse(FINAL, data, signature);
        untouched(true);
    }

    function test_RejectsStaleFinalSourceUnderFreshEnvelope() public {
        fund(); // 05:00
        vm.warp(NOW + 18000);
        bytes memory data = encode(finished());
        bytes memory signature = sign(KEY, REQUEST, block.timestamp, data);
        vm.expectRevert(FuturePrizeLock.InvalidSourceTime.selector);
        lock.submitResponse(block.timestamp, data, signature);
        untouched(true);
    }

    function test_RejectsSourceTimeBeforeEnd() public {
        fund();
        vm.warp(FINAL);
        Observation memory o = finished();
        o.modifiedAt = "2026-10-31T02:59:00Z";
        bytes memory data = encode(o);
        bytes memory signature = sign(KEY, REQUEST, FINAL, data);
        vm.expectRevert(FuturePrizeLock.InvalidSourceTime.selector);
        lock.submitResponse(FINAL, data, signature);
        untouched(true);
    }

    function test_RejectsSourceOrEnvelopeFromFuture() public {
        fund();
        vm.warp(FINAL);
        Observation memory o = finished();
        o.modifiedAt = "2026-10-31T03:06:00Z";
        bytes memory data = encode(o);
        bytes memory signature = sign(KEY, REQUEST, FINAL, data);
        vm.expectRevert(FuturePrizeLock.InvalidSourceTime.selector);
        lock.submitResponse(FINAL, data, signature);
        data = encode(finished());
        signature = sign(KEY, REQUEST, FINAL + 1, data);
        vm.expectRevert(FuturePrizeLock.ResponseFromFuture.selector);
        lock.submitResponse(FINAL + 1, data, signature);
        untouched(true);
    }

    function test_GraceBlocksLateSettlementAndRefundsOnlyFixedOrganizer() public {
        fund();
        vm.warp(lock.settlementDeadline() + 1);
        bytes memory data = encode(finished());
        bytes memory signature = sign(KEY, REQUEST, block.timestamp, data);
        vm.expectRevert(FuturePrizeLock.SettlementClosed.selector);
        lock.submitResponse(block.timestamp, data, signature);
        vm.expectRevert(FuturePrizeLock.RefundNotAvailable.selector);
        lock.refund();
        untouched(true);
        vm.warp(lock.refundAvailableAt());
        uint256 beforeBalance = ORGANIZER.balance;
        lock.refund();
        require(
            lock.state() == FuturePrizeLock.State.Refunded && ORGANIZER.balance == beforeBalance + PRIZE, "refund wrong"
        );
        vm.expectRevert(FuturePrizeLock.AlreadyTerminalOrUnfunded.selector);
        lock.refund();
    }
}

/// @notice Real paid API3 future-match capture; terminal behavior remains in the synthetic time-controlled tests.
contract FuturePrizeLockRealFundingTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 internal constant PRIZE = 0.0001 ether;
    address internal constant AIRNODE = 0xd9D29FEDc3737aD5198611457fE04aB08a739C7b;
    FuturePrizeLock internal lock;
    uint256 internal timestamp;
    bytes32 internal requestHash;
    bytes internal data;
    bytes internal signature;

    function setUp() public {
        string memory fixture = vm.readFile("evidence/v2/future-selection.json");
        timestamp = vm.parseJsonUint(fixture, ".proof.timestamp");
        requestHash = vm.parseJsonBytes32(fixture, ".proof.requestHash");
        data = bytes(vm.parseJsonString(fixture, ".proof.data"));
        signature = vm.parseJsonBytes(fixture, ".proof.signature");
        vm.warp(timestamp + 10);
        vm.deal(address(this), 1 ether);
        lock = new FuturePrizeLock(
            FuturePrizeLock.Policy({
                airnode: AIRNODE,
                requestHash: requestHash,
                matchId: 1713127,
                teamA: 138767,
                teamB: 13719,
                walletA: payable(address(0xA1713127)),
                walletB: payable(address(0xB1713127)),
                organizer: payable(address(0xC1713127)),
                prizeWei: PRIZE,
                fundingClosesAt: timestamp + 3600,
                scheduledAt: 1793426400,
                endWindowStart: 1793424600,
                endWindowEnd: 1793448000,
                settlementDeadline: 1793455200,
                refundGrace: 600,
                maxEnvelopeAge: 180,
                finalityDelay: 120,
                maxInitialSourceAge: 7 days,
                maxFinalSourceAge: 3600
            })
        );
    }

    function unchanged(bool funded) internal view {
        require(
            lock.state() == (funded ? FuturePrizeLock.State.Funded : FuturePrizeLock.State.Unfunded), "state changed"
        );
        require(address(lock).balance == (funded ? PRIZE : 0), "prize changed");
        require(lock.winningTeam() == 0 && lock.paidTo() == address(0), "unexpected payout");
    }

    function test_RealUnknownFutureMatchCanBeFundedBeforeItsSchedule() public {
        lock.fund{value: PRIZE}(timestamp, data, signature);
        unchanged(true);
        require(lock.fundingObservedAt() == timestamp && lock.fundingProofHash() != bytes32(0), "proof not bound");
    }

    function test_RealPendingResultCannotPayTheFundedPrize() public {
        lock.fund{value: PRIZE}(timestamp, data, signature);
        vm.expectRevert(FuturePrizeLock.ResultNotFinal.selector);
        lock.submitResponse(timestamp, data, signature);
        unchanged(true);
    }

    function test_RealFundingProofEditedWinnerRejected() public {
        bytes memory edited =
            '{"endAt":null,"id":1713127,"modifiedAt":"2026-10-30T17:04:45Z","scheduledAt":"2026-10-31T06:00:00Z","status":"not_started","teamAId":138767,"teamBId":13719,"winnerId":138767}';
        vm.expectPartialRevert(AirnodeV2Attestation.NotSignedByAirnode.selector);
        lock.fund{value: PRIZE}(timestamp, edited, signature);
        unchanged(false);
    }

    function test_RealFundingProofExpiresWithoutFunding() public {
        vm.warp(timestamp + 181);
        vm.expectRevert(FuturePrizeLock.ResponseTooOld.selector);
        lock.fund{value: PRIZE}(timestamp, data, signature);
        unchanged(false);
    }

    function test_RealFundingProofWrongRequestRejected() public {
        string memory fixture = vm.readFile("evidence/preflight-match.json");
        uint256 otherTimestamp = vm.parseJsonUint(fixture, ".proof.timestamp");
        bytes memory otherData = bytes(vm.parseJsonString(fixture, ".proof.data"));
        bytes memory otherSignature = vm.parseJsonBytes(fixture, ".proof.signature");
        vm.expectPartialRevert(AirnodeV2Attestation.NotSignedByAirnode.selector);
        lock.fund{value: PRIZE}(otherTimestamp, otherData, otherSignature);
        unchanged(false);
    }

    function test_RealFundingPayloadWithWrongKeyRejected() public {
        bytes32 digest = keccak256(abi.encodePacked(requestHash, timestamp, data));
        bytes32 personal = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBAD, personal);
        bytes memory wrongSignature = abi.encodePacked(r, s, v);
        vm.expectPartialRevert(AirnodeV2Attestation.NotSignedByAirnode.selector);
        lock.fund{value: PRIZE}(timestamp, data, wrongSignature);
        unchanged(false);
    }
}
