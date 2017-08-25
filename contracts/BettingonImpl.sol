pragma solidity ^0.4.14;

import "./lib/SafeMath256.sol";
import "./lib/SafeMath64.sol";
import "./Bettingon.sol";

contract BettingonImpl is Bettingon {

    using SafeMath256 for uint;
    using SafeMath64 for uint64;

    uint public constant MAXRESOLVES = 25;

    /// code ===================================================

    event LogDebug(string what);

    function BettingonImpl(
        address _owner,
        address _priceUpdaterAddress,
        address _directoryAddress,
        uint64  _betCycleLength,
        uint64  _betCycleOffset,
        uint64  _betMinRevealLength,
        uint64  _betMaxRevealLength,
        uint    _betAmount,
        uint8   _platformFee,
        address _platformFeeAddress,
        uint8   _boatFee
        ) {

      owner = _owner;

      betCycleOffset = _betCycleOffset;
      betCycleLength = _betCycleLength;
      betMinRevealLength = _betMinRevealLength;
      betMaxRevealLength = _betMaxRevealLength;
      betAmount = _betAmount;
      platformFee = _platformFee;
      platformFeeAddress = _platformFeeAddress;
      boatFee = _boatFee;

      priceUpdater = PriceUpdater(_priceUpdaterAddress);
      directory = Directory(_directoryAddress);

      require(!isContract(_platformFeeAddress));

    }

    function bet(address _sender, Round storage round, uint32 _target) internal {

        // -- check if someone already bet on this target
        if (round.betTargets[_target].account != 0 ) {
            revert();
        }

        round.bets.length++;
        round.bets[round.bets.length-1].account = _sender;
        round.bets[round.bets.length-1].target = _target;

        round.betTargets[_target] = round.bets[round.bets.length-1];
        round.amountPerAddress[_sender] = 
            round.amountPerAddress[_sender].add(betAmount);

        round.balance = round.balance.add(betAmount);

    }

    function bet(uint32 _roundId, uint32[] _targets) payable {

        // -- check owner finished this bettington
        require(stopAtRoundId < _roundId);

        require(_targets.length > 0);

        // -- check that the bet is not outdated due network congestion
        var (roundId,) = thisRoundInfo(uint64(now));
        
        if (roundId!=_roundId) {
            LogBetOutdated(_roundId,msg.sender,_targets);
            msg.sender.transfer(msg.value);
            return;
        }


        // -- check if the user is in the directory
        require(address(directory)==0 || directory.isAllowed(msg.sender));

        // -- check sent value is, at least the minimum value
        uint totalBetAmount = betAmount.mul(_targets.length);
        require(msg.value >= totalBetAmount);

        // -- check if someone already bet on this target
        if (msg.value > betAmount) {
            msg.sender.transfer(msg.value.sub(totalBetAmount));
        }

        // -- create a new round if requiered
        createRoundIfRequiered();

        for (uint targetNo = 0; targetNo < _targets.length ; targetNo++) {
            Round storage round = rounds[rounds.length-1];       
            bet(msg.sender,round,_targets[targetNo]);
        }
        LogBet(_roundId,msg.sender,_targets);
    }


    function withdraw(uint32 _roundId) {

        uint32 roundNo = roundById[_roundId];
        RoundStatus status = getRoundStatus(roundNo,uint64(now));
        
        if(status == RoundStatus.OPEN) {
            return;
        }
        Round storage round = rounds[roundNo];

        // ------------------------------------------------------------------
        // if this round is >closed, and there's only
        //   one betting address, just refund money

        if (round.balance == round.amountPerAddress[round.bets[0].account]
            && round.bets[0].account == msg.sender) {

            msg.sender.transfer(round.balance);
            LogRefund(round.roundId, round.bets[0].account,round.balance);
            round.amountPerAddress[round.bets[0].account] = 0;
            round.balance = 0;
            return;
        }

        // ------------------------------------------------------------------
        // case PRICELOST : if this round is target lost, just refund money
        //   one betting address, just refund money

        if (status == RoundStatus.PRICELOST) {
            uint amount = round.amountPerAddress[msg.sender];
            if (amount > 0) {
                round.balance = round.balance.sub(amount);
                round.amountPerAddress[msg.sender] = 0;
                msg.sender.transfer(amount);
                LogRefund(round.roundId,msg.sender,amount);
            }
            return;
        }

        // ------------------------------------------------------------------
        // case PRICESET :We assume there that the winner is calling this
        // function because is the winner, and wants to retrieve their price

        if(status==RoundStatus.PRICESET) {
            
            // The round is not yet resolved, so resolve it
            resolveRoundNo(roundNo,MAXRESOLVES);
            status = getRoundStatus(roundNo,uint64(now));
        }

        // ------------------------------------------------------------------
        //  case RESOLVED

        if(status!=RoundStatus.RESOLVED) {
            LogUnresolved(
                _roundId,
                uint32(round.bets.length.sub(round.lastCheckedBetNo).div(MAXRESOLVES)+1)
            );
            return;
        }

        address winner = round.bets[round.closestBetNo].account;
        if(msg.sender != winner){
            return;
        }

        uint platformAmount = percentage(round.balance,platformFee);
        uint boatAmount = percentage(round.balance,boatFee);
        uint winnerAmount = round.balance.sub(platformAmount).sub(boatAmount);

        winner.transfer(winnerAmount);
        platformFeeAddress.transfer(platformAmount);
        boat=boat.add(boatAmount);

        if (round.bets[round.closestBetNo].target == round.target) {
            LogWinnerPaid(round.roundId, winner, winnerAmount, boat);
            winner.transfer(boat);
            boat = 0;
        } else {
            LogWinnerPaid(round.roundId, winner, winnerAmount, 0);            
        }

        round.balance = 0;   

    }

    function setTargetValue(uint32 _roundId, uint32 _target) {
        
        require(address(priceUpdater)==msg.sender || address(priceUpdater)==address(this));

        uint32 roundNo = roundById[_roundId];
        assert(getRoundStatus(roundNo, uint64(now)) == RoundStatus.PRICEWAIT);

        rounds[roundNo].target = _target;

        LogPriceSet(rounds[roundNo].roundId,_target);
        
    }

    function terminate(uint32 _stopAtRoundId) {
        require (msg.sender == owner );

        stopAtRoundId = _stopAtRoundId;
    }

    // internal functions ------------------------------------------

    function getRoundStatus(uint _roundNo, uint64 _now) internal constant returns (RoundStatus) {

        if (_now == 0) {
            _now = uint64(now);
        }

        if (_roundNo > rounds.length) {
            return RoundStatus.FUTURE;
        }

        if (_roundNo == rounds.length) {
            if (rounds.length>0 && rounds[_roundNo-1].closeDate > _now) {
                return RoundStatus.FUTURE;
            }
            return RoundStatus.OPEN;
        }

        Round storage round = rounds[_roundNo];
        
        if (_now < round.closeDate) {
            return RoundStatus.OPEN;
        }

        if (round.balance == 0) {
            return RoundStatus.FINISHED;            
        }

        if (round.lastCheckedBetNo == round.bets.length) {
            assert(round.target > 0);
            return RoundStatus.RESOLVED;            
        }

        if (round.target > 0) {
            return RoundStatus.PRICESET;            
        }

        if (round.target == 0  && _now > round.closeDate.add(betMaxRevealLength)) {
            return RoundStatus.PRICELOST;
        }

        if (round.target == 0  && _now > round.closeDate.add(betMinRevealLength)) {
            return RoundStatus.PRICEWAIT;
        }

        return RoundStatus.CLOSED;
    }


    function thisRoundInfo(uint64 _now) internal returns (uint32 roundId, uint64 closeDate) {

        if (_now == 0) {
            _now = uint64(now);
        }

       roundId = uint32(uint64(_now).div(betCycleLength));

       uint64 startDate = _now.sub(_now % betCycleLength).add(betCycleOffset);
       closeDate = startDate.add(betCycleLength);
       return;
    }

    function createRoundIfRequiered() internal {

       var (roundId,closeDate) = thisRoundInfo(uint64(now));
       uint32 lastRoundId=0;

       if (rounds.length > 0) {
            lastRoundId = rounds[rounds.length-1].roundId;
        } 
 
        if (lastRoundId != roundId) {
            rounds.length++;
            
            rounds[rounds.length-1].roundId = roundId;
            rounds[rounds.length-1].closeDate = closeDate;

            roundById[roundId] = uint32(rounds.length)-1;
            
            priceUpdater.schedule(
                roundId,
                closeDate.sub(uint64(now)).add(betMinRevealLength)
            );
        }
    }

    function resolve(uint32 _roundId, uint _times) {
        resolveRoundNo(roundById[_roundId],_times);
    }

    /// _times < 0 => gas limit , times > 0 just do it n times maximum
    function resolveRoundNo(uint32 _roundNo, uint _times) internal {

        if (getRoundStatus(_roundNo,uint64(now))!=RoundStatus.PRICESET) {
            return;
        }
  
        Round storage round = rounds[_roundNo];
  
        uint32 target           = round.target;
        uint32 lastCheckedBetNo = round.lastCheckedBetNo;
        uint32 closestBetNo     = round.closestBetNo;
  
        while (lastCheckedBetNo < round.bets.length) {
            
           if (lastCheckedBetNo == 0) {
               closestBetNo = 0;
           } else {
               uint32 thisTarget = round.bets[lastCheckedBetNo].target;
               uint32 bestTarget = round.bets[closestBetNo].target;
               if (diff(thisTarget,target) < diff(bestTarget,target)) {
                    closestBetNo = lastCheckedBetNo;             
               }
           }
          
           lastCheckedBetNo++;

           bool noMoreGasToNextResolve   = ( _times==0 && msg.gas < 50000) ;
           bool noMoreTimesToNextResolve = ( _times==1 );

           if (noMoreGasToNextResolve || noMoreTimesToNextResolve) {
              break;
           }

           if (_times>1) _times--;
        }

        if (lastCheckedBetNo == round.bets.length) {
            LogWinner(round.roundId, round.bets[closestBetNo].account);
        }
        
        round.lastCheckedBetNo = lastCheckedBetNo;
        round.closestBetNo = closestBetNo;

    } 

    // web3 helpers ------------------------------------------------

    function getRoundById(uint32 _roundId, uint64 _now) external constant returns (
        uint32      roundId,
        uint32      roundNo,
        RoundStatus status,
        uint64      closeDate,
        uint32      betCount,
        uint32      target,
        uint32      lastCheckedBetNo,
        uint32      closestBetNo
    ) {
        if (_roundId == 0) {
            // determine the last round 
            if (rounds.length == 0) {
                roundNo = 0;
            } else if (getRoundStatus(rounds.length-1,_now)==RoundStatus.OPEN) {
                // if last round is open, then return last round
                roundNo = uint32(rounds.length)-1;
            } else  {
                // return the new round
                roundNo = uint32(rounds.length);
            }
        } else {
            roundNo = roundById[_roundId];
        }

        (roundId,status,closeDate,betCount,target,lastCheckedBetNo,closestBetNo) = 
           getRoundAt(roundNo,_now);
    }

    function isBetAvailable(uint32 _target, uint64 _now) returns (bool) {

        if (getRoundStatus(rounds.length-1, _now)!=RoundStatus.OPEN) {
            return true;
        }

        return rounds[rounds.length-1].betTargets[_target].account == 0;
    }
    
    function getRoundCount(uint64 _now) external constant returns (uint32) {
        if (getRoundStatus(rounds.length,_now) == RoundStatus.OPEN) {
            return uint32(rounds.length) + 1;
        }
        return uint32(rounds.length);
    }

    function getRoundAt(uint32 _roundNo,uint64 _now) constant returns (
        uint32      roundId,
        RoundStatus status,
        uint64      closeDate,
        uint32      betCount,
        uint32      target,
        uint32      lastCheckedBetNo,
        uint32      closestBetNo
    ) {
        status = getRoundStatus(_roundNo, _now);

        if (_roundNo >= rounds.length) {

            (roundId,closeDate) = thisRoundInfo(_now);
            betCount = 0;
            target = 0;
            lastCheckedBetNo = 0;
            closestBetNo = 0;
            return;
        }

        roundId = rounds[_roundNo].roundId;
        closeDate = rounds[_roundNo].closeDate;
        betCount = uint32(rounds[_roundNo].bets.length);
        target = rounds[_roundNo].target;
        lastCheckedBetNo = rounds[_roundNo].lastCheckedBetNo;
        closestBetNo = rounds[_roundNo].closestBetNo;
        return;
    }
    
    function getBetAt(uint32 _roundNo, uint32 _betNo) external constant returns (
        address account,
        uint32  target
    ){
        account = rounds[_roundNo].bets[_betNo].account;
        target = rounds[_roundNo].bets[_betNo].target;
    }
    
    function getNow() external constant returns (uint64) {
        return uint64(now);
    }

    function getRoundPendingAmout(uint32 _roundId, address _addr) external constant returns (uint) {
        
        uint32 roundNo = roundById[_roundId];

    }


    /// generic helpers ------------------------------------------------

    function isContract(address addr) internal returns (bool) {
      uint size;
      assembly { size := extcodesize(addr) }
      return size > 0;
    }

    function percentage(uint _amount, uint8 _perc) internal constant returns (uint) {
        return _amount.mul(10**16).mul(_perc).div(10**18);
    }

    function diff(uint _a, uint _b) internal constant returns (uint) {
       if (_a > _b) {
           return _a.sub(_b);
       } else {
           return _b.sub(_a);
       }
    }

}
