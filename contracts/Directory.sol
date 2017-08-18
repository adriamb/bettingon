pragma solidity ^0.4.13;

contract Directory {

	function isAllowed(address) constant returns (bool);
	function getName(address) constant returns (string);
	function setName(string _name);

}
