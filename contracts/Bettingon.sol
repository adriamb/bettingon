pragma solidity ^0.4.14;

import "./Directory.sol";
import "./PriceUpdater.sol";

contract Bettingon {

    /// events -------------------------------------------------

    event LogError(string error);
    event LogWinner(uint32 roundId, address winner);
    event LogWinnerPaid(uint32 roundId, address winner, uint amount, uint boat);
    event LogBet(uint32 roundId, address account, uint32[] targets);
    event LogBetOutdated(uint32 roundId, address account, uint32[] targets);
    event LogRefund(uint32 roundId, address account, uint amount);
    event LogPriceSet(uint32 roundId, uint32 target);

    /// types ---------------------------------------------------

    struct Bet {
        address account;
        uint32  target;     // in ethers
    }

    struct Round {
        uint32                 roundId;     // the id of the round

        uint                   balance;     // total money balance 
        uint64                 closeDate;   // date this round closes

        uint32                 target;      // is the goal price

        Bet[]                  bets;
        mapping(uint=>Bet)     betTargets;
        mapping(address=>uint) amountPerAddress;

        uint32                 lastCheckedBetNo;
        uint32                 closestBetNo;
    }

    /// inmutable construction parameters ----------------------

    uint64       public betCycleLength;      // how long the bet cicle lasts. eg 1 day
    uint64       public betCycleOffset;      // the offset of the betting cicle
    uint64       public betMinRevealLength;  // minimum time for revealig target
    uint64       public betMaxRevealLength;  // maxmimum time for revealig target
    uint         public betAmount;           // bet amount in ethers
    uint8        public platformFee;         // percentage that goes to sharePlatform
    address      public platformFeeAddress;  // address where foes the platfromFee
    uint8        public boatFee;             // boat for the bet that matches the amount
    PriceUpdater public priceUpdater;        // who is allowed to update the price
    Directory    public directory;
    address      public owner;

    /// state variables ----------------------------------------

    Round[]   public           rounds;
    mapping   (uint32=>uint32) roundById;
    uint      public           boat;
    uint32    public           stopAtRoundId;

    /*
       Flow diagram for RoundStatus
      
       OPEN -> CLOSED -> PRICEWAIT -> PRICESET  -> RESOLVED -> FINISHED
                                   \> PRICELOST
    */
   
    enum RoundStatus {
        FUTURE,        // Not exists yet
        OPEN,          // Open to bets
        CLOSED,        // Closed to bets, waiting oracle to set the price
        PRICEWAIT,     // Waiting oracle to set the price        
        PRICESET,      // Oracle set the price, calculating best bet
        PRICELOST,     // Oracle cannot set the price [end]
        RESOLVED,      // Bet calculated
        FINISHED       // Bet paid
    }

    function bet(uint32 _roundId, uint32[] _targets) payable;
    function resolve(uint32 _roundNo, uint _times);    
    function withdraw(uint32 _roundId);
    function setTargetValue(uint32 _roundNo, uint32 _target);
    function terminate(uint32 _stopAtRoundId);

    function getRoundById(uint32 _roundId, uint64 _now) external constant returns (
        uint32 roundId,
        uint32 roundNo,
        RoundStatus status,
        uint64 closeDate,
        uint32 betCount,
        uint32 target,
        uint32 lastCheckedBetNo,
        uint32 closestBetNo
    );

    function isBetAvailable(uint32 _target, uint64 _now) returns (bool);

    function getRoundCount(uint64 _now) external constant returns (uint32);

    function getRoundAt(uint32 _roundNo,uint64 _now) constant returns (
        uint32 roundId,
        RoundStatus status,
        uint64 closeDate,
        uint32 betCount,
        uint32 target,
        uint32 lastCheckedBetNo,
        uint32 closestBetNo
    );
    
    function getBetAt(uint32 _roundNo, uint32 _betNo) external constant returns (
        address account,
        uint32  target
    );

    function getRoundPendingAmout(uint32 _roundId, address _addr) external constant returns (uint);

    function getNow() external constant returns (uint64);

}
