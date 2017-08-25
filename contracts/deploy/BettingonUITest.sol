pragma solidity ^0.4.11;

import "../BettingonImpl.sol";
import "../PriceUpdaterImpl.sol";
import "../DirectoryImpl.sol";

contract BettingonUITest is BettingonImpl {
    
   function BettingonUITest(
        address owner,
        address priceUpdaterAddress,
        address directory
    ) BettingonImpl(
        owner,
        priceUpdaterAddress,
        directory, 
        /* betCycleLength      */ 60*1,
        /* betCycleOffset      */ 0,
        /* betMinReveaLength   */ 60,
        /* betMaxReveaLength   */ 60*3,
        /* betAmount           */ 10**16,  // 0.01 eths
        /* platformFee         */ 10, 
        /* platformFeeAddress  */ tx.origin,
        /* boatFee             */ 20
    ) {
    }

    function terminate() {
        assert(msg.sender == owner);
        selfdestruct(owner);
    }

}

contract BettingonUITestDeploy {
    
    PriceUpdaterImpl public pu;
    BettingonUITest  public bon;
    DirectoryImpl    public d;
    
    function BettingonUITestDeploy(
        address oar
    ) {
        pu = new PriceUpdaterImpl(this);
        d = new DirectoryImpl();
        bon = new BettingonUITest(this,address(pu),d);
        pu.initialize(
            oar,
            address(bon),
            "json(https://api.coinmarketcap.com/v1/ticker/ethereum/).0.price_usd"
        );
    }
    
}
