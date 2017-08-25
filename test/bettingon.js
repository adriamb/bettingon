// This test suite corresponds to the old Vault test suite

/* global artifacts */
/* global contract */
/* global web3 */
/* global assert */

const assertJump = require("./helpers/assertJump.js");
const timeTravel = require("./helpers/timeTravel.js");

const BettingonUnitTest = artifacts.require("../contracts/deploy/BettingonUnitTest.sol");

contract("Basic unit tests", (accounts) => {

    const percent = ( (v, p) => Math.floor(v * (p/100)) )
    const VMTIME = web3.toBigNumber(0)

    const FUTURE     = 0  // Not exists yet
    const OPEN       = 1  // Open to bets
    const CLOSED     = 2  // Closed to bets, waiting oracle to set the price
    const PRICEWAIT  = 3  // Waiting set the price
    const PRICESET   = 4  // Oracle set the price, calculating best bet
    const PRICELOST  = 5  // Oracle cannot set the price [end]
    const RESOLVED   = 6  // Bet calculated 
    const FINISHED   = 7  // Prize paid [end]

    const {
        0: owner,
        1: user1,
        2: user2,
        3: user3,
        4: user4,
        8: platformFeeAddress
    } = accounts;

    const betCycleOffset     = 0;
    const betCycleLength     = 3600;
    const betMinRevealLength = 3600;
    const betMaxRevealLength = 7200;
    const betAmount          = web3.toBigNumber("10000000000000000"); // 0.01 eth
    const platformFee        = 10;
    const boatFee            = 20;

    let bon;

    beforeEach(async () => {

        bon = await BettingonUnitTest.new(
            betCycleLength,
            betCycleOffset,
            betMinRevealLength,
            betMaxRevealLength,
            betAmount,
            platformFee, platformFeeAddress,
            boatFee
        )

        // go forward to the beginning of the cycle
        //   we need that to prevent weird unit test errors
        //   if round changes just in the middle of the test
        const ts =  (await bon.getNow()).toNumber()
        await timeTravel(betCycleLength - (ts % betCycleLength));

    });

    it("check construction parameters", async () => {
        assert.equal((await bon.betCycleLength()).toNumber(), betCycleLength);
        assert.equal((await bon.betCycleOffset()).toNumber(), betCycleOffset);
        assert.equal((await bon.betMinRevealLength()).toNumber(), betMinRevealLength);
        assert.equal((await bon.betMaxRevealLength()).toNumber(), betMaxRevealLength);
        assert.equal((await bon.betAmount()).toNumber(), betAmount);
        assert.equal((await bon.platformFee()).toNumber(), platformFee);
        assert.equal((await bon.platformFeeAddress()), platformFeeAddress);
        assert.equal((await bon.boatFee()), boatFee);
     });

    it("a bet is logged", async () => {
        const betValue = await bon.betAmount()
        const [roundId,,,,,,] = await bon.getRoundById(0,VMTIME)
        const trn = await bon.bet(roundId, [260000],  {from : user1 , value : betValue})

        assert.equal(trn.logs.length, 1);
        assert.equal(trn.logs[ 0 ].event, "LogBet");
        assert.equal(trn.logs[ 0 ].args.roundId.toNumber(), roundId.toNumber());
        assert.equal(trn.logs[ 0 ].args.account, user1);
        assert.equal(trn.logs[ 0 ].args.targets.length, 1);
        assert.equal(trn.logs[ 0 ].args.targets[0].toNumber(), 260000);
    });

    it("a double bet is logged", async () => {
        const betValue = await bon.betAmount()
        const [roundId,,,,,,] = await bon.getRoundById(0,VMTIME)
        const trn = await bon.bet(roundId, [260000,260001],  {from : user1 , value : betValue.mul(2)})

        assert.equal(trn.logs.length, 1);
        assert.equal(trn.logs[ 0 ].event, "LogBet");
        assert.equal(trn.logs[ 0 ].args.roundId.toNumber(), roundId.toNumber());
        assert.equal(trn.logs[ 0 ].args.account, user1);
        assert.equal(trn.logs[ 0 ].args.targets.length, 2);
        assert.equal(trn.logs[ 0 ].args.targets[0].toNumber(), 260000);
        assert.equal(trn.logs[ 0 ].args.targets[1].toNumber(), 260001);

        const [,,,,betCount,,] = await bon.getRoundById(0,VMTIME)
        assert.equal(betCount.toNumber(), 2);
     });


    it("target reveal is logged", async () => {

        const betValue = await bon.betAmount()
        const [roundId,,,,,,] = await bon.getRoundById(0,VMTIME)

        await bon.bet(roundId,[260000],  {from : user1 , value : betValue})

        await timeTravel(betCycleLength+betMinRevealLength+1);
        const trn = await bon.__updateEthPrice(roundId,250000)  //   and set to 250$/h
        assert.equal(trn.logs.length, 1);
        assert.equal(trn.logs[ 0 ].event, "LogPriceSet");
        assert.equal(trn.logs[ 0 ].args.roundId.toNumber(), roundId.toNumber());
        assert.equal(trn.logs[ 0 ].args.target.toNumber(), 250000);

    });

    it("cannot bet in another round that the current one", async () => {

        const betValue = await bon.betAmount()
        const [roundId,,,,,,] = await bon.getRoundById(0,VMTIME)

        const trn = await bon.bet(roundId.toNumber()+1,[260000],  {from : user1 , value : betValue})
        assert.equal(trn.logs.length, 1);
        assert.equal(trn.logs[ 0 ].event, "LogBetOutdated");
        assert.equal(trn.logs[ 0 ].args.roundId.toNumber(), roundId.toNumber()+1);
        assert.equal(trn.logs[ 0 ].args.account, user1);
        assert.equal(trn.logs[ 0 ].args.targets.length, 1);
        assert.equal(trn.logs[ 0 ].args.targets[0].toNumber(), 260000);
    });

    it("one bet, one win, no fees, logs generated", async () => {

        const betValue = await bon.betAmount()
        const [roundId,,,,,,] = await bon.getRoundById(0,VMTIME)

        await bon.bet(roundId, [260000], {from : user1 , value : betValue})

        await timeTravel(betCycleLength+betMinRevealLength+1);
        await bon.__updateEthPrice(roundId,250000)  //   and set to 250$/h

        let trn = await bon.resolve(roundId,1)
        assert.equal(trn.logs.length, 1);
        assert.equal(trn.logs[ 0 ].event, "LogWinner");
        assert.equal(trn.logs[ 0 ].args.roundId.toNumber(), roundId.toNumber());
        assert.equal(trn.logs[ 0 ].args.winner, user1);

        const balance = web3.eth.getBalance(user1);
        trn = await bon.withdraw(roundId, { from: user1 } )
        assert.equal(trn.logs.length, 1);
        assert.equal(trn.logs[ 0 ].event, "LogRefund");
        assert.equal(trn.logs[ 0 ].args.roundId.toNumber(), roundId.toNumber());
        assert.equal(trn.logs[ 0 ].args.account, user1);

        const tx = web3.eth.getTransaction(trn.tx);
        const txPrice = web3.toBigNumber(trn.receipt.gasUsed).mul(tx.gasPrice);
        const expectedBalance = balance.minus(txPrice).plus(betValue)
        assert.equal(web3.eth.getBalance(user1).toNumber(), expectedBalance.toNumber());
    });

    it("three bets, one win", async () => {

        const betValue = await bon.betAmount()
        const [roundId,,,,,,] = await bon.getRoundById(0,VMTIME)

        await bon.bet(roundId,[260000], {from : user1 , value : betValue})
        await bon.bet(roundId,[270000,245000], {from : user2 , value : betValue.mul(2)})

        await timeTravel(betCycleLength+betMinRevealLength+1);
        await bon.__updateEthPrice(roundId,250000)  //   and set to 250$/h

        const trn = await bon.resolve(roundId,3)
        assert.equal(trn.logs.length, 1);
        assert.equal(trn.logs[ 0 ].event, "LogWinner");
        assert.equal(trn.logs[ 0 ].args.roundId.toNumber(), roundId.toNumber());
        assert.equal(trn.logs[ 0 ].args.winner, user2);
    });

    it("withdraw resolves automatically", async () => {

        const betValue = await bon.betAmount()
        const [roundId,,,,,,] = await bon.getRoundById(0,VMTIME)

        await bon.bet(roundId,[260000], {from : user1 , value : betValue})
        await bon.bet(roundId,[245000], {from : user2 , value : betValue})

        await timeTravel(betCycleLength+betMinRevealLength+1);
        await bon.__updateEthPrice(roundId,250000)  //   and set to 250$/h

        const trn = await bon.withdraw(roundId, { from: user2 })
        assert.equal(trn.logs.length, 2);
        assert.equal(trn.logs[ 0 ].event, "LogWinner");
        assert.equal(trn.logs[ 0 ].args.roundId.toNumber(), roundId.toNumber());
        assert.equal(trn.logs[ 0 ].args.winner, user2);
        assert.equal(trn.logs[ 1 ].event, "LogWinnerPaid");
        assert.equal(trn.logs[ 1 ].args.roundId.toNumber(), roundId.toNumber());
        assert.equal(trn.logs[ 1 ].args.winner, user2);
    });

    it("get boat on exact bet matching", async () => {

        let betValue1 = await bon.betAmount()
        const [roundId1,,,,,,] = await bon.getRoundById(0,VMTIME)

        await bon.bet(roundId1, [260000], {from : user1 , value : betValue1})
        await bon.bet(roundId1, [270000], {from : user2 , value : betValue1})
        await timeTravel(betCycleLength+betMinRevealLength+1);
        await bon.__updateEthPrice(roundId1,250000)  //   and set to 250$/h
        await bon.resolve(roundId1,2)
        await bon.withdraw(roundId1, { from: user1 } )

        let boat = percent(betValue1.mul(2).toNumber(),boatFee)
        assert.equal((await bon.boat()).toNumber(),boat);

        let betValue2 = await bon.betAmount()
        const [roundId2,,,,,,] = await bon.getRoundById(0,VMTIME)
        await bon.bet(roundId2, [270000], {from : user1 , value : betValue2})
        await bon.bet(roundId2, [260000], {from : user2 , value : betValue2})
        await timeTravel(betCycleLength+betMinRevealLength+1);
        await bon.__updateEthPrice(roundId2,270000)  //   and set to 270$/h
        await bon.resolve(roundId2,2)
        
        const fees = percent(betValue2.mul(2).toNumber(),platformFee+boatFee)
        const prize = betValue2.mul(2).toNumber() - fees

        boat = boat + percent(betValue2.mul(2).toNumber(),boatFee)

        const trn = await bon.withdraw(roundId2, { from: user1 } )
        assert.equal(trn.logs.length, 1);
        assert.equal(trn.logs[ 0 ].event, "LogWinnerPaid");
        assert.equal(trn.logs[ 0 ].args.roundId.toNumber(), roundId2.toNumber());
        assert.equal(trn.logs[ 0 ].args.winner, user1);
        assert.equal(trn.logs[ 0 ].args.amount.toNumber(), prize);
        assert.equal(trn.logs[ 0 ].args.boat.toNumber(), boat);

        assert.equal((await bon.boat()).toNumber(),0);
    });

    it("check getRoundStatus results", async () => {

        const betValue = await bon.betAmount()
        const [roundId,roundNo,,,,,] = await bon.getRoundById(0,VMTIME)

        assert.equal((await bon.getRoundAt(roundNo,VMTIME))[1].toNumber(), OPEN);
        assert.equal((await bon.getRoundAt(roundNo+1,VMTIME))[1].toNumber(), FUTURE);

        await bon.bet(roundId, [260000], {from : user1 , value : betValue})
        await bon.bet(roundId, [270000], {from : user2 , value : betValue})

        await timeTravel(betCycleLength+1); // Wait next round

        assert.equal((await bon.getRoundAt(roundNo,VMTIME))[1].toNumber(), CLOSED);
        assert.equal((await bon.getRoundAt(roundNo+1,VMTIME))[1].toNumber(), OPEN);
        assert.equal((await bon.getRoundAt(roundNo+2,VMTIME))[1].toNumber(), FUTURE);

        await timeTravel(betMinRevealLength);
        assert.equal((await bon.getRoundAt(roundNo,VMTIME))[1].toNumber(), PRICEWAIT);

        await bon.__updateEthPrice(roundId,250000) 

        assert.equal((await bon.getRoundAt(roundNo,VMTIME))[1].toNumber(), PRICESET);
        await bon.resolve(roundId,1)
        assert.equal((await bon.getRoundAt(roundNo,VMTIME))[1].toNumber(), PRICESET);
        await bon.resolve(roundId,1)
        assert.equal((await bon.getRoundAt(roundNo,VMTIME))[1].toNumber(), RESOLVED);

        await bon.withdraw(roundId, { from: user1 } )

        assert.equal((await bon.getRoundAt(roundNo,VMTIME))[1].toNumber(), FINISHED);

    });

    it("updateprice before resolution date does not work", async () => {
        const betValue = await bon.betAmount()
        const [roundId,,,,,,] = await bon.getRoundById(0,VMTIME)

        await bon.bet(roundId, [260000], {from : user1 , value : betValue})

        await timeTravel(betCycleLength+betMinRevealLength-60); 
        try {
            await bon.__updateEthPrice(roundId,250000)  // and set to 250$/h
        } catch (error) {
            return assertJump(error);
        }
        assert.fail("should have thrown before");
    });

    it("two bets cannot have the same amount", async () => {
        
        const betValue = await bon.betAmount()
        const [roundId,,,,,,] = await bon.getRoundById(0,VMTIME)

        await bon.bet(roundId, [260000], {from : user1 , value : betValue})
        try {
            await bon.bet(roundId, [260000], {from : user2 , value : betValue})   
        } catch (error) {
            return assertJump(error);
        }
        assert.fail("should have thrown before");
    
    });

    it("cannot diposit less ether", async () => {
        
        const betValue = await bon.betAmount()
        const [roundId,,,,,,] = await bon.getRoundById(0,VMTIME)

        try {
            await bon.bet(roundId, [260000], {from : user1 , value : betValue.minus(1)})
        } catch (error) {
            return assertJump(error);
        }
        assert.fail("should have thrown before");
    
    });

    it("if more ether is sent, excess is refunded", async () => {
        
        const betValue = await bon.betAmount()
        const [roundId,,,,,,] = await bon.getRoundById(0,VMTIME)

        const balance = web3.eth.getBalance(user1);

        const trn = await bon.bet(roundId, [260000], {from : user1 , value : betValue.plus(1)})
        const tx = web3.eth.getTransaction(trn.tx);
        const txPrice = web3.toBigNumber(trn.receipt.gasUsed).mul(tx.gasPrice);

        const expectedBalance = balance.minus(betValue).minus(txPrice)
        assert.equal(web3.eth.getBalance(user1).toNumber(), expectedBalance.toNumber());
    
    });

    it("fail to refund before full resolving", async () => {
        
        const betValue = await bon.betAmount()
        const [roundId,,,,,,] = await bon.getRoundById(0,VMTIME)
        const maxResolves = (await bon.MAXRESOLVES()).toNumber()

        await bon.bet(roundId, [260000],  {from : user1 , value : betValue})

        let trn = await bon.withdraw(roundId, {from : user1 })
        assert.equal(trn.logs.length, 0);

        await timeTravel(betCycleLength+betMinRevealLength);

        trn = await bon.withdraw(roundId, {from : user1 })
        assert.equal(trn.logs.length, 1);
        assert.equal(trn.logs[ 0 ].event, "LogRefund");
    });

    it("success to refund when round cannot be resolved", async () => {
        
        const betValue = await bon.betAmount()
        const [roundId,,,,,,] = await bon.getRoundById(0,VMTIME)

        await bon.bet(roundId, [260000],  {from : user1 , value : betValue})
        await bon.bet(roundId, [260001],  {from : user1 , value : betValue})
        await bon.bet(roundId, [260002],  {from : user2 , value : betValue})

        let trn = await bon.withdraw(roundId, {from : user1 })
        assert.equal(trn.logs.length, 0);

        await timeTravel(betCycleLength+betMaxRevealLength+1);

        assert.equal((await bon.getRoundById(roundId,VMTIME))[2].toNumber(), PRICELOST);

        trn = await bon.withdraw(roundId, {from : user1 })
        assert.equal(trn.logs.length, 1);
        assert.equal(trn.logs[ 0 ].event, "LogRefund");
        assert.equal(trn.logs[ 0 ].args.roundId.toNumber(), roundId.toNumber());
        assert.equal(trn.logs[ 0 ].args.account, user1);
        assert.equal(trn.logs[ 0 ].args.amount.toNumber(), betValue.mul(2).toNumber());

    });

    it("large amount of bets are not resolved at first withdraw", async () => {
        
        const maxResolves = (await bon.MAXRESOLVES()).toNumber()
        const betValue = await bon.betAmount()
        const [roundId,,,,,,] = await bon.getRoundById(0,VMTIME)

        await bon.bet(roundId, [260000],  {from : user1 , value : betValue})
        for (let c=0;c<maxResolves;c++) {
            await bon.bet(roundId, [260001+c],  {from : user2 , value : betValue})
        }

        await timeTravel(betCycleLength+betMinRevealLength+1);
        await bon.__updateEthPrice(roundId,260000) 

        let trn = await bon.withdraw(roundId, {from : user1 })        
        assert.equal(trn.logs.length, 1);
        assert.equal(trn.logs[ 0 ].event, "LogUnresolved");
        assert.equal(trn.logs[ 0 ].args.roundId.toNumber(), roundId.toNumber());
        assert.equal(trn.logs[ 0 ].args.pending.toNumber(), 1);
        
        trn = await bon.withdraw(roundId, {from : user1 })        
        assert.equal(trn.logs.length, 2);
        assert.equal(trn.logs[ 0 ].event, "LogWinner");
        assert.equal(trn.logs[ 0 ].args.roundId.toNumber(), roundId.toNumber());
        assert.equal(trn.logs[ 0 ].args.winner, user1);
        assert.equal(trn.logs[ 1 ].event, "LogWinnerPaid");
        assert.equal(trn.logs[ 1 ].args.roundId.toNumber(), roundId.toNumber());
        assert.equal(trn.logs[ 1 ].args.winner, user1);
    });


});
