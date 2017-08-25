// Import libraries we need.
import { default as Web3 } from 'web3';
import { default as contract } from 'truffle-contract'
import { default as Helper } from './helper.js';
import { default as CandlebarGraph } from './candlebargraph.js';
import { default as DirectoryCached } from './directorycached.js';
import { default as toastr } from 'toastr';
import { default as $ } from 'jquery';

// Import our contract artifacts and turn them into usable abstractions.
import bettingonArtifact from '../../build/contracts/Bettingon.json'
import bettingonuitestdeployArtifact from '../../build/contracts/BettingonUITestDeploy.json'
import directoryArtifact from '../../build/contracts/Directory.json'

const FUTURE     = 0  // Not exists yet
const OPEN       = 1  // Open to bets
const CLOSED     = 2  // Closed to bets, waiting oracle to set the price
const PRICEWAIT  = 3  // Waiting set the price
const PRICESET   = 4  // Oracle set the price, calculating best bet
const PRICELOST  = 5  // Oracle cannot set the price [end]
const RESOLVED   = 6  // Bet calculated 
const FINISHED   = 7  // Prize paid [end]

let TOPICBET         
let TOPICBETOUTDATED 
let TOPICWINNER      
let TOPICWINNERPAID  
let TOPICREFUND      
let TOPICPRICESET    
let TOPICUNRESOLVED  

export default class BettingonDApp {

  constructor() {
      this._statuses = [
        "FUTURE", "OPEN", "CLOSED",
        "PRICEWAIT", "PRICESET", "PRICELOST",
        "RESOLVED", "FINISHED"
      ]
      this._candleBar = new CandlebarGraph($('#canvas')[0])
      this._Bettingon = contract(bettingonArtifact);
      this._Directory = contract(directoryArtifact);
      this._BettingonUITestDeploy = contract(bettingonuitestdeployArtifact);

      TOPICBET         = web3.sha3("LogBet(uint32,address,uint32[])")
      TOPICBETOUTDATED = web3.sha3("LogBetOutdated(uint32,address,uint32[])")
      TOPICWINNER      = web3.sha3("LogWinner(uint32,address)")
      TOPICWINNERPAID  = web3.sha3("LogWinnerPaid(uint32,address,uint256,uint256)")
      TOPICREFUND      = web3.sha3("LogRefund(uint32,address,uint256)")
      TOPICPRICESET    = web3.sha3("LogPriceSet(uint32,uint32)")
      TOPICUNRESOLVED  = web3.sha3("LogUnresolved(uint32,uint32)")
  }

  async start() {

    var self = this;

    this.setStatus("Loading",true);

    // Bootstrap the MetaCoin abstraction for Use.
    this._Bettingon.setProvider(web3.currentProvider);
    this._Directory.setProvider(web3.currentProvider);
    this._BettingonUITestDeploy.setProvider(web3.currentProvider);

    // Get the initial account balance so it can be displayed.
    web3.eth.getAccounts(async function(err, accs) {

      if (err != null) {
        alert("There was an error fetching your accounts.");
        return;
      }

      if (accs.length == 0) {
        alert("Couldn't get any accounts! Make sure your Ethereum client is configured correctly.");
        return;
      }

      self._accounts = accs;
      self._account = accs[0];

      await self.loadBettingtonParameters()
      await self.refresh()
      await self.watchAccountChange();
    })

  }

  async watchAccountChange() {
      var self = this;

      setTimeout(function(){
        web3.eth.getAccounts(async function(err, accs) {
          if (self._account != accs[0] ) {
            self._accounts = accs;
            self._account = accs[0];
            await self.refresh()
          }
          await self.watchAccountChange()
        })              
      }, 2000);    
  }

  async loadBettingtonParameters()  {

    var self = this;

    const deploy = await this._BettingonUITestDeploy.deployed();    
    this._bon = this._Bettingon.at(await deploy.bon())
    this._directory = this._Directory.at(await deploy.d())
    this._directoryCached = new DirectoryCached(this._directory)
    this._betCycleLength = (await this._bon.betCycleLength()).toNumber();
    this._betCycleOffset = (await this._bon.betCycleOffset()).toNumber();
    this._betMinRevealLength = (await this._bon.betMinRevealLength()).toNumber();
    this._betMaxRevealLength = (await this._bon.betMaxRevealLength()).toNumber();
    this._betAmount = await this._bon.betAmount();
    this._platformFee = (await this._bon.platformFee()).toNumber();
    this._boatFee = (await this._bon.boatFee()).toNumber();
    this._priceUpdater = await this._bon.priceUpdater();
    this._boat = (await this._bon.boat()).toNumber();

    let displayInfo = ""; 
    displayInfo += "Boat : " + Helper.formatEth(this._boat)+" ETH"
    displayInfo += "<br>Bet amount : " + Helper.formatEth(this._betAmount)+" ETH"
    displayInfo += "<br>New round each : " + Helper.formatTimeDiff(this._betCycleLength)
    displayInfo += "<br>UTC time is : " + new Date()
    displayInfo += "<br>Deployed at : " + Helper.formatAddr(this._bon.address)+", updater is in "
      + Helper.formatAddr(this._priceUpdater)        
    displayInfo += "<br><br>"

    web3.eth.getBalance(this._priceUpdater, function(err,val) {
        if (val==0) {
          alert("Top up priceupdater "+self._priceUpdater)
        }      
    })

    $('#paramInfo').html(displayInfo)
    this.setStatus("",false);

  }

  async refresh() {

    const now = Math.floor(Date.now() / 1000);
    this.setStatus("Refreshing",true);    

    await this._directoryCached.embedMemberIcon(
      this._account,$('#currentMember'),
      "javascript:app.uiChangeName()"
    )

    const roundCount = (await this._bon.getRoundCount(web3.toBigNumber(now))).toNumber();

    Helper.removeTableRows($("#currentRoundTable")[0])
    Helper.removeTableRows($("#pastRoundsTable")[0])

    let step = this._betCycleLength

    if (step < 7200) step = 7200;
    const startTime = (+new Date() / 1000) - 40 * step
    const endTime= (+new Date() / 1000) + 2 * step + this._betMaxRevealLength 
    await this._candleBar.invalidate(startTime,endTime,step)

    for (let roundNo = roundCount - 1; roundNo >=0 ; roundNo--) {
      await this.displayRound(roundNo,now);
    } 

    this.setStatus("",false);

  }

  async displayRound(roundNo, now) {

      var self = this;

      const _values = await this._bon.getRoundAt(roundNo, web3.toBigNumber(now))

      let [
        roundId, status, closeDate,
        betCount, target, lastCheckedBetNo,
        closestBetNo
      ] = [ 
        _values[0].toNumber(), _values[1].toNumber(), _values[2].toNumber(),
        _values[3].toNumber(), _values[4].toNumber(), _values[5].toNumber(),
        _values[6].toNumber()
      ];

      let info = ""
      let actions = ""

      const bidButton = "<button class='button-primary' onclick='app.uiBid("+roundId+")'>Bid</button>"
      const withdrawButton = "<button class='button-primary' onclick='app.uiWithdraw("+roundId+")'>Withdraw</button>"
      const showBetsButton = "<button onclick='app.uiShowMyBets("+roundId+")'>My bets</button>"

      const pricePublishDate = closeDate+this._betMinRevealLength

      switch (status) {
        case FUTURE :
        case OPEN :
          info += Helper.formatTimeDiff(closeDate-now)+" to close."
          info += "<br>bets are for price published in "+new Date(1000*pricePublishDate);         
          actions += bidButton
          break;
        case CLOSED :
           info += Helper.formatTimeDiff(closeDate+this._betMinRevealLength-now)+" to oraclize starts set the price."
           info += "<br>bets are for price published in "+new Date(1000*pricePublishDate);
           actions += showBetsButton
           break;
        case PRICEWAIT :
           info += Helper.formatTimeDiff(closeDate+this._betMaxRevealLength-now)+" deadline to oraclize sets the price."
           info += "<br>bets are for price published in "+new Date(1000*pricePublishDate);
           break;
        case PRICESET :
           info += "Price is "+target/1000+" USD/ETH ["+lastCheckedBetNo+"/"+betCount+" resolved]"
           actions += showBetsButton
           actions += withdrawButton
           break;
        case PRICELOST :
           actions += showBetsButton
           actions += withdrawButton
           break;
        case RESOLVED :
           info += "Price is "+target/1000+" USD/ETH"
           actions += showBetsButton
           actions += withdrawButton
           break;
        case FINISHED :
           actions += showBetsButton
           info += "Price is "+target/1000+" USD/ETH "
           break;
      }

      if (status == OPEN){

        this._candleBar.setBetTime(pricePublishDate)

        $('#currentRoundInfo').html(info)
        $("#currentRoundBetActions").html(actions);

        if (betCount==0) {
            Helper.addTableRow(
              $("#currentRoundTable"),
              ["<i>No bets</i>",""],
              this._directoryCached
            )
        }

        for (let betNo = 0; betNo < betCount ; ) { 
          let row = []
          for (let col = 0; col < 5 && betNo < betCount; col++, betNo++) {
             const bet = await this._bon.getBetAt(roundNo,betNo);
             this._candleBar.addBet(pricePublishDate,bet[1].toNumber()/1000)
             row.push(bet[1].toNumber()/1000)
             row.push("member:"+bet[0])
          }
          Helper.addTableRow(
              $("#currentRoundTable"),
              row,
              this._directoryCached
          )
        } 

      } else {

        Helper.addTableRow(
          $("#pastRoundsTable"),
          [roundId,betCount,this._statuses[status],info,actions],
          this._directoryCached
        )
      }

      return closeDate+this._betMinRevealLength;
  }

  setStatus(message,working) {
    if (working) message+="<img height=40 width=40 src='https://media.giphy.com/media/DoGDAF93K9QpG/giphy.gif'>"
    $('#status').html(message);
  }

  doTransaction(promise) {
    var self = this;

    return promise
    .then ( (tx) => {
      self.setStatus("Sending",true);
      console.log("tx "+tx.tx);
      return Helper.getTransactionReceiptMined(tx.tx);     
    }).then ( receipt  => {
      self.setStatus("",false);
      self.refresh()
      let topics = {}
      for (let rn = 0; rn < receipt.logs.length; rn++) {
        for (let tn = 0; tn < receipt.logs[rn].topics.length; tn++) {
          topics[receipt.logs[rn].topics[tn]]=0
        }
      }
      console.log(receipt)
      return new Promise((resolve, reject)=>{resolve(topics)})
    }).catch ( (e) => {
      console.log(e);
      toastr.error('Failed to send transaction');
      self.setStatus("",false);
    })

  }

  uiBid(roundId) {

    var self = this;

    let targetsStr = prompt("Your bids? (e.g. 215.500,199.2)")
    if (targetsStr === null) {
      return; 
    }

    let targets=targetsStr.split(",").map(function(x){return Math.round(parseFloat(x)*1000)})
    this.doTransaction(
      self._bon.bet(
        roundId,targets,
        {from: self._account, value: self._betAmount.mul(targets.length) }
      )
    ).then (topics => {
      if (TOPICBET in topics) {
          toastr.info('Bet added');
      } else if (TOPICBETOUTDATED in topics) {        
          toastr.error('Bet outdated, another round is active');
      } else {
          toastr.error('Something wrong happened');
      }
    })
  }

  async uiShowMyBets(roundId) {

    this.setStatus("Reading",true);

    const now = Math.floor(Date.now() / 1000);
    const _values = await this._bon.getRoundById(roundId, web3.toBigNumber(now))

    let [ _, roundNo, status, closeDate,
      betCount, target, lastCheckedBetNo,
      closestBetNo
    ] = [ 
      _values[0].toNumber(), _values[1].toNumber(), _values[2].toNumber(),
      _values[3].toNumber(), _values[4].toNumber(), _values[5].toNumber(),
      _values[6].toNumber()
    ];

    let bets = ""
    for (let betNo = 0; betNo < betCount; betNo++) { 
      const bet = await this._bon.getBetAt(roundNo,betNo);
      if (bet[0] == this._account) {
        if (bets!="") bets=bets+","
        bets += (bet[1].toNumber()/1000)
      }
    } 
    if (bets=="") toastr.info('No bets found');
    else toastr.info("You bet on: "+bets)

    this.setStatus("",false);
  }

  uiChangeName() {

    let newName = prompt("Change your name to...")

    if (newName === null) {
      return; 
    }
    
    this._directoryCached.invalidate(this._account)
    
    this.doTransaction(
      this._directory.setName(newName, {from: this._account})
    )

  }

  uiWithdraw(roundId) {

    var self = this;
    self.doTransaction(
      self._bon.withdraw(roundId,{from: self._account })
    ).then (topics => {
      if (TOPICREFUND in topics) {
          toastr.info('Money refunded');
      } else if (TOPICWINNERPAID in topics) {        
          toastr.info('Paid to winner!');
      } else if (TOPICUNRESOLVED in topics) {        
          toastr.warning('You need more withdraws');
      }
    })
  }

}