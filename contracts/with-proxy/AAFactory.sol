// SPDX-License-Identifier: MIT

import "@matterlabs/zksync-contracts/l2/system-contracts/Constants.sol";

import {TwoUserMultisig} from "./TwoUserMultisig.sol";

contract AAFactory {
    bytes32 public aaBytecodeHash;
    constructor(bytes32 _aaBytecodeHash) {
        aaBytecodeHash = _aaBytecodeHash;
    }

    function deployAccount(
        bytes32 _salt,
        address _implementation,
        address _owner1,
        address _owner2
    ) external returns (address) {
        bytes memory data = abi.encodeWithSelector(TwoUserMultisig.initialize.selector, _owner1, _owner2);
        return DEPLOYER_SYSTEM_CONTRACT.create2AA(_salt, aaBytecodeHash, 0, abi.encode(_implementation, data));
    }
}
