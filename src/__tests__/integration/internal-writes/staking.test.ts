import fs from 'fs';

import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import { Contract, LoggerFactory, SmartWeave, SmartWeaveNodeFactory } from '@smartweave';
import path from 'path';
import { TsLogFactory } from '../../../logging/node/TsLogFactory';

/**
 */
describe('Testing internal writes', () => {
  let tokenContractSrc: string;
  let tokenContractInitialState: string;
  let tokenContract: Contract<any>;
  let tokenContractTxId;

  let stakingContractSrc: string;
  let stakingContractInitialState: string;
  let stakingContract: Contract<any>;
  let stakingContractTxId;

  let wallet: JWKInterface;
  let walletAddress: string;

  let arweave: Arweave;
  let arlocal: ArLocal;
  let smartweave: SmartWeave;

  beforeAll(async () => {
    // note: each tests suit (i.e. file with tests that Jest is running concurrently
    // with another files has to have ArLocal set to a different port!)
    arlocal = new ArLocal(1950, false);
    await arlocal.start();

    arweave = Arweave.init({
      host: 'localhost',
      port: 1950,
      protocol: 'http'
    });

    LoggerFactory.use(new TsLogFactory());
    LoggerFactory.INST.logLevel('error');
  });

  afterAll(async () => {
    await arlocal.stop();
  });

  async function deployContracts() {
    smartweave = SmartWeaveNodeFactory.memCached(arweave);

    wallet = await arweave.wallets.generate();
    walletAddress = await arweave.wallets.jwkToAddress(wallet);

    tokenContractSrc = fs.readFileSync(path.join(__dirname, '../data/staking/token-allowance.js'), 'utf8');
    tokenContractInitialState = fs.readFileSync(path.join(__dirname, '../data/staking/token-allowance.json'), 'utf8');
    stakingContractSrc = fs.readFileSync(path.join(__dirname, '../data/staking/staking-contract.js'), 'utf8');
    stakingContractInitialState = fs.readFileSync(
      path.join(__dirname, '../data/staking/staking-contract.json'),
      'utf8'
    );

    tokenContractTxId = await smartweave.createContract.deploy({
      wallet,
      initState: JSON.stringify({
        ...JSON.parse(tokenContractInitialState),
        owner: walletAddress
      }),
      src: tokenContractSrc
    });

    stakingContractTxId = await smartweave.createContract.deploy({
      wallet,
      initState: JSON.stringify({
        ...JSON.parse(stakingContractInitialState),
        tokenTxId: tokenContractTxId
      }),
      src: stakingContractSrc
    });

    tokenContract = smartweave.contract(tokenContractTxId).connect(wallet);
    stakingContract = smartweave.contract(stakingContractTxId).connect(wallet);

    await mine();
  }

  describe('with read states in between', () => {
    beforeAll(async () => {
      await deployContracts();
    });

    it('should deploy contracts with initial state', async () => {
      expect((await tokenContract.readState()).state).toEqual({
        allowances: {},
        balances: {},
        owner: walletAddress,
        ticker: 'EXAMPLE_PST_TOKEN',
        totalSupply: 0
      });
      expect((await stakingContract.readState()).state).toEqual({
        minimumStake: 1000,
        stakes: {},
        tokenTxId: tokenContractTxId,
        unstakePeriod: 10
      });
    });

    it('should mint tokens', async () => {
      await tokenContract.writeInteraction({
        function: 'mint',
        account: walletAddress,
        amount: 10000
      });
      await mine();

      const tokenState = (await tokenContract.readState()).state;

      expect(tokenState.balances).toEqual({
        [walletAddress]: 10000
      });
      expect(tokenState.totalSupply).toEqual(10000);
    });

    it('should not stake tokens if no allowance', async () => {
      await stakingContract.writeInteraction({
        function: 'stake',
        amount: 1000
      });
      await mine();

      expect((await stakingContract.readState()).state.stakes).toEqual({
      });

      const tokenState = (await tokenContract.readState()).state;
      expect(tokenState.balances).toEqual({
        [walletAddress]: 10000,
      });
    });

    it('should approve for staking contract', async () => {
      await tokenContract.writeInteraction({
        function: 'approve',
        spender: stakingContractTxId,
        amount: 1000
      });
      await mine();

      expect((await tokenContract.readState()).state.allowances).toEqual({
        [walletAddress]: {
          [stakingContractTxId]: 1000
        }
      });
    });

    it('should stake tokens', async () => {
      await stakingContract.writeInteraction({
        function: 'stake',
        amount: 1000
      });
      await mine();

      expect((await stakingContract.readState()).state.stakes).toEqual({
        [walletAddress]: {
          amount: 1000,
          unlockWhen: 0
        }
      });

      const tokenState = (await tokenContract.readState()).state;
      expect(tokenState.balances).toEqual({
        [walletAddress]: 9000,
        [stakingContractTxId]: 1000
      });
    });


  });

  describe('with read states at the end', () => {
    beforeAll(async () => {
      await deployContracts();
    });

    it('should stake tokens', async () => {
      expect((await tokenContract.readState()).state).toEqual({
        allowances: {},
        balances: {},
        owner: walletAddress,
        ticker: 'EXAMPLE_PST_TOKEN',
        totalSupply: 0
      });
      expect((await stakingContract.readState()).state).toEqual({
        minimumStake: 1000,
        stakes: {},
        tokenTxId: tokenContractTxId,
        unstakePeriod: 10
      });

      await tokenContract.writeInteraction({
        function: 'mint',
        account: walletAddress,
        amount: 10000
      });
      await mine();

      await stakingContract.writeInteraction({
        function: 'stake',
        amount: 1000
      });
      await mine();

      await tokenContract.writeInteraction({
        function: 'approve',
        spender: stakingContractTxId,
        amount: 1000
      });
      await mine();

      await stakingContract.writeInteraction({
        function: 'stake',
        amount: 1000
      });
      await mine();

      const tokenState = (await tokenContract.readState()).state;
      expect(tokenState.balances).toEqual({
        [walletAddress]: 9000,
        [stakingContractTxId]: 1000
      });
      expect((await stakingContract.readState()).state.stakes).toEqual({
        [walletAddress]: {
          amount: 1000,
          unlockWhen: 0
        }
      });
    });

  });

  async function mine() {
    await arweave.api.get('mine');
  }
});