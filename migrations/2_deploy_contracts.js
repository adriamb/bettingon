var BettingonUITestDeploy = artifacts.require("./BettingonUITestDeploy.sol");

module.exports = function(deployer) {

  deployer.deploy(
  	 BettingonUITestDeploy,
     "0x6f485C8BF6fc43eA212E93BBF8ce046C7f1cb475" // Oraclize Bridge
  );

};
