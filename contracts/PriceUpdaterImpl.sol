pragma solidity ^0.4.14;

import "./Bettingon.sol";
import "./PriceUpdater.sol";
import "./lib/OraclizeAPI04.sol";

contract PriceUpdaterImpl is PriceUpdater, usingOraclize {
   
   event LogError(string error);
   event LogUpdate(uint32 value);

   address   public owner;
   Bettingon public bettingon; 
   string    public url;

   mapping(bytes32=>uint32) roundIdPerMyId; 

    function PriceUpdaterImpl(address _owner) {
        owner = _owner;
    }

    function initialize(address oar, address _bettingon, string _url) {
        require(msg.sender == owner);

        bettingon = Bettingon(_bettingon);
        url = _url;     // "json(https://api.coinmarketcap.com/v1/ticker/ethereum/).0.price_usd"

        if (oar != 0 ) {
            OAR = OraclizeAddrResolverI(oar);
        }

        oraclize_setCustomGasPrice(4 * (10 ** 9)); // Set price to 4 Gigawei
        oraclize_setProof(proofType_TLSNotary | proofStorage_IPFS);
    }

    function __callback(bytes32 myid, string result, bytes proof) {
        if (msg.sender != oraclize_cbAddress()) throw;

        require(roundIdPerMyId[myid]>0);
        uint32 roundId=roundIdPerMyId[myid]-1;
        
        uint32 target = stringToUint32(result); // TODO: extra checks
        LogUpdate(target);
        if (target > 0 && address(bettingon)!=0) {
            bettingon.setTargetValue(roundId,target);
        }
    }
    
    function schedule(uint32 _roundId, uint64 _timeOffset) {
        require(msg.sender == address(bettingon));

        if (oraclize.getPrice("URL") > this.balance) {
            throw;
        }        
        
        bytes32 myid = oraclize_query(_timeOffset, "URL", url);
        roundIdPerMyId[myid]=_roundId+1;
    }
    
    function stringToUint32(string s) internal constant returns (uint32 result) {
        bytes memory b = bytes(s);
        uint32 i;
        result = 0;
        for (i = 0; i < b.length; i++) {
            uint8 c = uint8(b[i]);
            if (c >= 48 && c <= 57) {
                result = result * 10 + (c - 48);
            }
        }
    }   
    
    function () payable {
        
    }

    function terminate() {
        require(msg.sender == owner);
        selfdestruct(owner);
    }

}

