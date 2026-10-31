// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PrizeLock} from "../contracts/PrizeLock.sol";
import {AirnodeV2Attestation} from "../contracts/oracle/AirnodeV2Attestation.sol";
import {Vm} from "./PrizeLock.t.sol";

/// @notice These tests use paid PandaScore responses captured in evidence/, never a substitute signing key.
contract PrizeLockRealResponseTest {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address internal constant AIRNODE = 0xd9D29FEDc3737aD5198611457fE04aB08a739C7b;
    address payable internal constant WINNER = payable(address(0x139124));
    uint256 internal constant PRIZE = 0.0001 ether;
    PrizeLock internal lock;
    uint256 internal timestamp;
    bytes internal data;
    bytes internal signature;
    bytes32 internal requestHash;

    function setUp() public {
        string memory fixture = vm.readFile("evidence/preflight-match.json");
        timestamp = vm.parseJsonUint(fixture, ".proof.timestamp");
        data = bytes(vm.parseJsonString(fixture, ".proof.data"));
        signature = vm.parseJsonBytes(fixture, ".proof.signature");
        requestHash = vm.parseJsonBytes32(fixture, ".proof.requestHash");
        vm.warp(timestamp + 10);
        vm.deal(address(this), 1 ether);
        lock = new PrizeLock(
            PrizeLock.Policy({
                airnode: AIRNODE,
                requestHash: requestHash,
                matchId: 1772358,
                teamA: 139124,
                teamB: 137905,
                walletA: WINNER,
                walletB: payable(address(0x137905)),
                organizer: payable(address(0xABC123)),
                prizeWei: PRIZE,
                fundingClosesAt: timestamp + 300,
                settlementDeadline: timestamp + 3600,
                refundGrace: 300,
                maxEnvelopeAge: 120,
                finalityDelay: 60,
                sourceObservationMin: 1793404800,
                sourceObservationMax: 1793491199
            })
        );
        lock.fund{value: PRIZE}();
    }

    function protected() internal view {
        require(lock.state() == PrizeLock.State.Funded && address(lock).balance == PRIZE, "protected prize changed");
        require(lock.paidTo() == address(0), "recipient changed");
    }

    function test_RealPaidPandaScoreProofPaysTeamSynapse() public {
        uint256 beforeBalance = WINNER.balance;
        lock.submitResponse(timestamp, data, signature);
        require(lock.state() == PrizeLock.State.Paid, "not paid");
        require(lock.winningTeam() == 139124 && lock.paidTo() == WINNER, "wrong real team");
        require(WINNER.balance == beforeBalance + PRIZE && address(lock).balance == 0, "payment missing");
    }

    function test_RealResponseEditedWinnerRejected() public {
        bytes memory edited =
            '{"endAt":"2026-10-31T02:04:55Z","id":1772358,"modifiedAt":"2026-10-31T02:26:16Z","status":"finished","winnerId":137905}';
        vm.expectPartialRevert(AirnodeV2Attestation.NotSignedByAirnode.selector);
        lock.submitResponse(timestamp, edited, signature);
        protected();
    }

    function test_RealResponseBecomesTooOld() public {
        vm.warp(timestamp + 121);
        vm.expectRevert(PrizeLock.ResponseTooOld.selector);
        lock.submitResponse(timestamp, data, signature);
        protected();
    }

    function test_RealResponseForDifferentOperationRejected() public {
        string memory fixture = vm.readFile("evidence/discovery.json");
        uint256 otherTimestamp = vm.parseJsonUint(fixture, ".proof.timestamp");
        bytes memory otherData = bytes(vm.parseJsonString(fixture, ".proof.data"));
        bytes memory otherSignature = vm.parseJsonBytes(fixture, ".proof.signature");
        vm.expectPartialRevert(AirnodeV2Attestation.NotSignedByAirnode.selector);
        lock.submitResponse(otherTimestamp, otherData, otherSignature);
        protected();
    }

    function test_RealPayloadSignedWithWrongKeyRejected() public {
        bytes32 digest = keccak256(abi.encodePacked(requestHash, timestamp, data));
        bytes32 personal = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBAD, personal);
        bytes memory wrongSignature = abi.encodePacked(r, s, v);
        vm.expectPartialRevert(AirnodeV2Attestation.NotSignedByAirnode.selector);
        lock.submitResponse(timestamp, data, wrongSignature);
        protected();
    }

    function test_RealResponseCannotPayTwice() public {
        lock.submitResponse(timestamp, data, signature);
        uint256 paidBalance = WINNER.balance;
        vm.expectRevert(PrizeLock.AlreadyTerminalOrUnfunded.selector);
        lock.submitResponse(timestamp, data, signature);
        require(WINNER.balance == paidBalance && address(lock).balance == 0, "duplicate real payout");
    }
}
