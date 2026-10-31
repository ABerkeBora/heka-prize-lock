// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PrizeLock} from "../contracts/PrizeLock.sol";
import {AirnodeV2Attestation} from "../contracts/oracle/AirnodeV2Attestation.sol";

interface Vm {
    function addr(uint256) external returns (address);
    function deal(address, uint256) external;
    function warp(uint256) external;
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
    function expectRevert(bytes4) external;
    function expectPartialRevert(bytes4) external;
    function readFile(string calldata) external view returns (string memory);
    function parseJsonBytes32(string calldata, string calldata) external pure returns (bytes32);
    function parseJsonUint(string calldata, string calldata) external pure returns (uint256);
    function parseJsonString(string calldata, string calldata) external pure returns (string memory);
    function parseJsonBytes(string calldata, string calldata) external pure returns (bytes memory);
}

contract RejectingWallet {
    receive() external payable {
        revert("receiver unavailable");
    }
}

contract PrizeLockTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 internal constant KEY = 0xA11CE;
    uint256 internal constant NOW = 1793404800;
    uint256 internal constant PRIZE = 0.001 ether;
    bytes32 internal constant REQUEST = keccak256("pinned-getMatch-projection");
    address payable internal constant A = payable(address(0xA11));
    address payable internal constant B = payable(address(0xB11));
    address payable internal constant ORGANIZER = payable(address(0xC11));
    bytes internal constant DATA =
        '{"endAt":"2026-10-30T23:00:00Z","id":123,"modifiedAt":"2026-10-30T23:01:00Z","status":"finished","winnerId":10}';
    PrizeLock internal lock;

    function policy() internal returns (PrizeLock.Policy memory p) {
        p = PrizeLock.Policy({
            airnode: vm.addr(KEY),
            requestHash: REQUEST,
            matchId: 123,
            teamA: 10,
            teamB: 20,
            walletA: A,
            walletB: B,
            organizer: ORGANIZER,
            prizeWei: PRIZE,
            fundingClosesAt: NOW + 300,
            settlementDeadline: NOW + 3600,
            refundGrace: 300,
            maxEnvelopeAge: 120,
            finalityDelay: 60,
            sourceObservationMin: NOW - 7200,
            sourceObservationMax: NOW
        });
    }

    function setUp() public {
        vm.warp(NOW);
        vm.deal(address(this), 100 ether);
        lock = new PrizeLock(policy());
        lock.fund{value: PRIZE}();
    }

    function sign(uint256 key, bytes32 request, uint256 timestamp, bytes memory data) internal returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked(request, timestamp, data));
        bytes32 personal = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, personal);
        return abi.encodePacked(r, s, v);
    }

    function submit(bytes memory data) internal {
        lock.submitResponse(NOW, data, sign(KEY, REQUEST, NOW, data));
    }

    function protected() internal view {
        require(lock.state() == PrizeLock.State.Funded, "protected state changed");
        require(address(lock).balance == PRIZE, "protected prize changed");
        require(lock.paidTo() == address(0), "paid recipient changed");
    }

    function test_PaysFixedWinnerExactlyOnce() public {
        uint256 beforeA = A.balance;
        uint256 beforeB = B.balance;
        submit(DATA);
        require(lock.state() == PrizeLock.State.Paid, "not paid");
        require(A.balance == beforeA + PRIZE && B.balance == beforeB, "wrong recipient");
        require(address(lock).balance == 0 && lock.winningTeam() == 10, "wrong accounting");
        require(lock.paidTo() == A && lock.acceptedProofHash() != bytes32(0), "missing proof");
        bytes memory signature = sign(KEY, REQUEST, NOW, DATA);
        vm.expectRevert(PrizeLock.AlreadyTerminalOrUnfunded.selector);
        lock.submitResponse(NOW, DATA, signature);
        vm.expectRevert(PrizeLock.AlreadyTerminalOrUnfunded.selector);
        lock.refund();
        require(A.balance == beforeA + PRIZE, "duplicate payment");
    }

    function test_CanPayOtherFixedTeam() public {
        bytes memory data =
            '{"endAt":"2026-10-30T23:00:00Z","id":123,"modifiedAt":"2026-10-30T23:01:00Z","status":"finished","winnerId":20}';
        uint256 beforeB = B.balance;
        submit(data);
        require(B.balance == beforeB + PRIZE && lock.paidTo() == B, "other winner missing");
    }

    function test_RejectsEditedValue() public {
        bytes memory signature = sign(KEY, REQUEST, NOW, DATA);
        bytes memory edited =
            '{"endAt":"2026-10-30T23:00:00Z","id":123,"modifiedAt":"2026-10-30T23:01:00Z","status":"finished","winnerId":20}';
        vm.expectPartialRevert(AirnodeV2Attestation.NotSignedByAirnode.selector);
        lock.submitResponse(NOW, edited, signature);
        protected();
    }

    function test_RejectsStaleAuthenticResponse() public {
        bytes memory signature = sign(KEY, REQUEST, NOW, DATA);
        vm.warp(NOW + 121);
        vm.expectRevert(PrizeLock.ResponseTooOld.selector);
        lock.submitResponse(NOW, DATA, signature);
        protected();
    }

    function test_RejectsAnotherRequest() public {
        bytes memory signature = sign(KEY, keccak256("another-match"), NOW, DATA);
        vm.expectPartialRevert(AirnodeV2Attestation.NotSignedByAirnode.selector);
        lock.submitResponse(NOW, DATA, signature);
        protected();
    }

    function test_RejectsWrongSigner() public {
        bytes memory signature = sign(0xBAD, REQUEST, NOW, DATA);
        vm.expectPartialRevert(AirnodeV2Attestation.NotSignedByAirnode.selector);
        lock.submitResponse(NOW, DATA, signature);
        protected();
    }

    function test_RejectsFutureSignature() public {
        bytes memory signature = sign(KEY, REQUEST, NOW + 1, DATA);
        vm.expectRevert(PrizeLock.ResponseFromFuture.selector);
        lock.submitResponse(NOW + 1, DATA, signature);
        protected();
    }

    function test_RejectsWrongMatchEvenIfAuthentic() public {
        bytes memory data =
            '{"endAt":"2026-10-30T23:00:00Z","id":124,"modifiedAt":"2026-10-30T23:01:00Z","status":"finished","winnerId":10}';
        bytes memory signature = sign(KEY, REQUEST, NOW, data);
        vm.expectRevert(PrizeLock.WrongMatch.selector);
        lock.submitResponse(NOW, data, signature);
        protected();
    }

    function test_RejectsNullWinner() public {
        bytes memory data =
            '{"endAt":"2026-10-30T23:00:00Z","id":123,"modifiedAt":"2026-10-30T23:01:00Z","status":"finished","winnerId":null}';
        bytes memory signature = sign(KEY, REQUEST, NOW, data);
        vm.expectRevert(PrizeLock.ResultNotFinal.selector);
        lock.submitResponse(NOW, data, signature);
        protected();
    }

    function test_RejectsPendingAndCanceled() public {
        bytes memory pending = '{"id":123,"status":"not_started","winnerId":null}';
        bytes memory signature = sign(KEY, REQUEST, NOW, pending);
        vm.expectRevert(PrizeLock.ResultNotFinal.selector);
        lock.submitResponse(NOW, pending, signature);
        bytes memory canceled = '{"id":123,"status":"canceled","winnerId":null}';
        signature = sign(KEY, REQUEST, NOW, canceled);
        vm.expectRevert(PrizeLock.ResultNotFinal.selector);
        lock.submitResponse(NOW, canceled, signature);
        protected();
    }

    function test_RejectsUnknownWinner() public {
        bytes memory data =
            '{"endAt":"2026-10-30T23:00:00Z","id":123,"modifiedAt":"2026-10-30T23:01:00Z","status":"finished","winnerId":30}';
        bytes memory signature = sign(KEY, REQUEST, NOW, data);
        vm.expectRevert(PrizeLock.UnknownWinner.selector);
        lock.submitResponse(NOW, data, signature);
        protected();
    }

    function test_RejectsFractionalWinnerInsteadOfTruncating() public {
        bytes memory data =
            '{"endAt":"2026-10-30T23:00:00Z","id":123,"modifiedAt":"2026-10-30T23:01:00Z","status":"finished","winnerId":10.5}';
        bytes memory signature = sign(KEY, REQUEST, NOW, data);
        vm.expectRevert(bytes4(keccak256("ParsingFailed()")));
        lock.submitResponse(NOW, data, signature);
        protected();
    }

    function test_RejectsOldSourceUnderFreshSignature() public {
        bytes memory data =
            '{"endAt":"2026-10-30T20:00:00Z","id":123,"modifiedAt":"2026-10-30T20:01:00Z","status":"finished","winnerId":10}';
        bytes memory signature = sign(KEY, REQUEST, NOW, data);
        vm.expectRevert(PrizeLock.InvalidSourceTime.selector);
        lock.submitResponse(NOW, data, signature);
        protected();
    }

    function test_RejectsFutureSource() public {
        bytes memory data =
            '{"endAt":"2026-10-30T23:00:00Z","id":123,"modifiedAt":"2026-10-31T00:01:00Z","status":"finished","winnerId":10}';
        bytes memory signature = sign(KEY, REQUEST, NOW, data);
        vm.expectRevert(PrizeLock.InvalidSourceTime.selector);
        lock.submitResponse(NOW, data, signature);
        protected();
    }

    function test_RejectsUnfinishedFinalityDelay() public {
        bytes memory data =
            '{"endAt":"2026-10-30T23:59:30Z","id":123,"modifiedAt":"2026-10-30T23:59:45Z","status":"finished","winnerId":10}';
        bytes memory signature = sign(KEY, REQUEST, NOW, data);
        vm.expectRevert(PrizeLock.InvalidSourceTime.selector);
        lock.submitResponse(NOW, data, signature);
        protected();
    }

    function test_RefundOnlyAfterFixedGraceToOrganizer() public {
        vm.warp(lock.refundAvailableAt() - 1);
        vm.expectRevert(PrizeLock.RefundNotAvailable.selector);
        lock.refund();
        protected();
        uint256 beforeBalance = ORGANIZER.balance;
        vm.warp(lock.refundAvailableAt());
        lock.refund();
        require(ORGANIZER.balance == beforeBalance + PRIZE, "refund recipient changed");
        require(lock.state() == PrizeLock.State.Refunded && address(lock).balance == 0, "refund missing");
        vm.expectRevert(PrizeLock.AlreadyTerminalOrUnfunded.selector);
        lock.refund();
    }

    function test_GraceDoesNotAcceptLateSettlement() public {
        vm.warp(lock.settlementDeadline() + 1);
        uint256 late = lock.settlementDeadline() + 1;
        bytes memory signature = sign(KEY, REQUEST, late, DATA);
        vm.expectRevert(PrizeLock.SettlementClosed.selector);
        lock.submitResponse(late, DATA, signature);
        protected();
    }

    function test_RejectsUnderfundingAndDoubleFunding() public {
        PrizeLock fresh = new PrizeLock(policy());
        vm.expectRevert(PrizeLock.WrongFundingAmount.selector);
        fresh.fund{value: PRIZE - 1}();
        require(fresh.state() == PrizeLock.State.Unfunded && address(fresh).balance == 0, "underfunded active");
        fresh.fund{value: PRIZE}();
        vm.expectRevert(PrizeLock.AlreadyTerminalOrUnfunded.selector);
        fresh.fund{value: PRIZE}();
    }

    function test_RejectsFundingAfterClose() public {
        PrizeLock fresh = new PrizeLock(policy());
        vm.warp(fresh.fundingClosesAt() + 1);
        vm.expectRevert(PrizeLock.FundingClosed.selector);
        fresh.fund{value: PRIZE}();
    }

    function test_FailedWinnerTransferDoesNotConsumePrize() public {
        PrizeLock.Policy memory p = policy();
        p.walletA = payable(address(new RejectingWallet()));
        lock = new PrizeLock(p);
        lock.fund{value: PRIZE}();
        bytes memory signature = sign(KEY, REQUEST, NOW, DATA);
        vm.expectRevert(PrizeLock.TransferFailed.selector);
        lock.submitResponse(NOW, DATA, signature);
        protected();
    }

    function test_ValidateWorksAfterPayoutWithoutPayingAgain() public {
        bytes memory signature = sign(KEY, REQUEST, NOW, DATA);
        lock.submitResponse(NOW, DATA, signature);
        uint256 beforeA = A.balance;
        (uint256 winner, address recipient) = lock.validateResponse(NOW, DATA, signature);
        require(winner == 10 && recipient == A && A.balance == beforeA, "validation changed funds");
    }
}
