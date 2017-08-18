pragma solidity ^0.4.14;

import "./Directory.sol";

contract DirectoryImpl is Directory {

	mapping(address=>string)  names;
	mapping(bytes32=>bool) reverse;

	function isAllowed(address) constant returns (bool) {
		return true;
	}

	function setName(string _name) {
//		require(bytes(_name).length > 4);
//		require(reverse[sha3(_name)]==false);

		string oldName = names[msg.sender];
		if (bytes(oldName).length > 0) {
			delete reverse[sha3(oldName)];
		}

		reverse[sha3(_name)]=true;
		names[msg.sender] = _name;
	}

	function getName(address _addr) constant returns (string) {
		return names[_addr];
	}

}
