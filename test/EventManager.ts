import { expect } from 'chai';
import hre from 'hardhat';
import { ethers } from 'hardhat';

describe('EventManager', function () {
  async function deployEventManagerFixture() {
    const [owner, otherAccount] = await hre.ethers.getSigners();

    const EventManager = await hre.ethers.getContractFactory('EventManager');
    const eventManager = await EventManager.deploy();

    return { eventManager, owner, otherAccount };
  }

  describe('Deployment', function () {
    it('Should set the right owner', async function () {
      const { eventManager, owner } = await deployEventManagerFixture();

      expect(await eventManager.contractOwner()).to.equal(owner.address);
    });

    it('Should have no events', async function () {
      const { eventManager } = await deployEventManagerFixture();

      expect(await eventManager.eventCount()).to.be.equal(0);
    });
  });

  describe('Event Creation', function () {
    it('Should allow anyone to create an event', async function () {
      const { eventManager, otherAccount } = await deployEventManagerFixture();

      await eventManager
        .connect(otherAccount)
        .createEvent('Test Event', 100, 10, 1000);
      expect(await eventManager.eventCount()).to.equal(1);
    });

    it('Should revert when creating an event with an empty name', async function () {
      const { eventManager } = await deployEventManagerFixture();
      await expect(eventManager.createEvent('', 100, 10, 10)).to.be.reverted;
    });

    it('Should allow the event creator to open registration', async function () {
      const { eventManager, otherAccount } = await deployEventManagerFixture();

      await eventManager
        .connect(otherAccount)
        .createEvent('Test Event', 100, 10, 10);

      await expect(eventManager.connect(otherAccount).openRegistration(0))
        .to.emit(eventManager, 'RegistrationOpened')
        .withArgs(0);
    });

    it('Should revert if non-creator tries to open registration', async function () {
      const { eventManager, owner, otherAccount } =
        await deployEventManagerFixture();

      await eventManager
        .connect(otherAccount)
        .createEvent('Test Event', 100, 10, 10);

      await expect(
        eventManager.connect(owner).openRegistration(0)
      ).to.be.revertedWithCustomError(eventManager, 'Unauthorized');
    });

    it('Should allow the event creator to close registration', async function () {
      const { eventManager, otherAccount } = await deployEventManagerFixture();

      await eventManager
        .connect(otherAccount)
        .createEvent('Test Event', 100, 10, 10);

      await eventManager.connect(otherAccount).openRegistration(0);

      await expect(eventManager.connect(otherAccount).closeRegistration(0))
        .to.emit(eventManager, 'RegistrationClosed')
        .withArgs(0);
    });

    it('Should revert if non-creator tries to close registration', async function () {
      const { eventManager, owner, otherAccount } =
        await deployEventManagerFixture();

      await eventManager
        .connect(otherAccount)
        .createEvent('Test Event', 100, 10, 10);

      await eventManager.connect(otherAccount).openRegistration(0);

      await expect(
        eventManager.connect(owner).closeRegistration(0)
      ).to.be.revertedWithCustomError(eventManager, 'Unauthorized');
    });

    it('Should revert when opening registration for a non-existent event', async function () {
      const { eventManager } = await deployEventManagerFixture();
      await expect(
        eventManager.openRegistration(999)
      ).to.be.revertedWithCustomError(eventManager, 'EventNotFound');
    });

    it('Should revert when closing registration for a non-existent event', async function () {
      const { eventManager } = await deployEventManagerFixture();
      await expect(
        eventManager.closeRegistration(999)
      ).to.be.revertedWithCustomError(eventManager, 'EventNotFound');
    });

    it('Should revert when creating an event with zero days until deadline', async function () {
      const { eventManager } = await deployEventManagerFixture();
      await expect(
        eventManager.createEvent('Test Event', 100, 10, 0)
      ).to.be.revertedWith('Deadline must be at least 1 day in the future');
    });

    it('Should revert when creating an event with zero max participants', async function () {
      const { eventManager } = await deployEventManagerFixture();
      await expect(eventManager.createEvent('Test Event', 0, 10, 1)).to.be
        .reverted;
    });

    it('Should allow creating an event with zero registration fee', async function () {
      const { eventManager } = await deployEventManagerFixture();
      await expect(eventManager.createEvent('Free Event', 100, 0, 10)).to.not.be
        .reverted;
    });

    it('Should revert if registration is opened twice', async function () {
      const { eventManager, otherAccount } = await deployEventManagerFixture();

      await eventManager
        .connect(otherAccount)
        .createEvent('Test Event', 100, 10, 10);
      await eventManager.connect(otherAccount).openRegistration(0);

      await expect(
        eventManager.connect(otherAccount).openRegistration(0)
      ).to.be.revertedWith('Registration is already open');
    });

    it('Should revert if registration is closed twice', async function () {
      const { eventManager, otherAccount } = await deployEventManagerFixture();

      await eventManager
        .connect(otherAccount)
        .createEvent('Test Event', 100, 10, 10);
      await eventManager.connect(otherAccount).openRegistration(0);
      await eventManager.connect(otherAccount).closeRegistration(0);

      await expect(
        eventManager.connect(otherAccount).closeRegistration(0)
      ).to.be.revertedWith('Registration is already closed');
    });
  });

  describe('Event Registration', function () {
    it('Should allow a user to register for an open event', async function () {
      const { eventManager, otherAccount } = await deployEventManagerFixture();
      await eventManager.createEvent('Test Event', 2, 10, 10);
      await eventManager.openRegistration(0);

      await expect(
        eventManager.connect(otherAccount).registerForEvent(0, { value: 10 })
      )
        .to.emit(eventManager, 'ParticipantRegistered')
        .withArgs(0, otherAccount.address);
    });

    it('Should revert if registration is closed', async function () {
      const { eventManager, otherAccount } = await deployEventManagerFixture();
      await eventManager.createEvent('Test Event', 2, 10, 10);
      await expect(
        eventManager.connect(otherAccount).registerForEvent(0, { value: 10 })
      ).to.be.revertedWithCustomError(eventManager, 'RegistrationHasClosed');
    });

    it('Should revert if max participants are reached', async function () {
      const { eventManager, otherAccount } = await deployEventManagerFixture();
      await eventManager.createEvent('Test Event', 1, 10, 10);
      await eventManager.openRegistration(0);

      await eventManager.registerForEvent(0, { value: 10 });
      await expect(
        eventManager.connect(otherAccount).registerForEvent(0, { value: 10 })
      ).to.be.revertedWithCustomError(eventManager, 'MaxParticipantsReached');
    });

    it('Should revert if insufficient payment is sent', async function () {
      const { eventManager, otherAccount } = await deployEventManagerFixture();
      await eventManager.createEvent('Test Event', 2, 10, 10);
      await eventManager.openRegistration(0);

      await expect(
        eventManager.connect(otherAccount).registerForEvent(0, { value: 5 })
      ).to.be.revertedWithCustomError(eventManager, 'InsufficientPayment');
    });

    it('Should revert if the registration deadline has passed', async function () {
      const { eventManager, otherAccount } = await deployEventManagerFixture();
      await eventManager.createEvent('Test Event', 2, 10, 1);
      await eventManager.openRegistration(0);

      await hre.network.provider.send('evm_increaseTime', [2 * 24 * 60 * 60]);
      await hre.network.provider.send('evm_mine');

      await expect(
        eventManager.connect(otherAccount).registerForEvent(0, { value: 10 })
      ).to.be.revertedWithCustomError(eventManager, 'DeadlinePassed');
    });

    it('Should refund excess payment', async function () {
      const { eventManager, otherAccount } = await deployEventManagerFixture();
      await eventManager.createEvent('Test Event', 2, 10, 10);
      await eventManager.openRegistration(0);

      const tx = await eventManager
        .connect(otherAccount)
        .registerForEvent(0, { value: 15 });
      await expect(tx)
        .to.emit(eventManager, 'RefundIssued')
        .withArgs(otherAccount.address, 5);
    });

    it('Should allow registering for a free event without sending value', async function () {
      const { eventManager, otherAccount } = await deployEventManagerFixture();
      await eventManager.createEvent('Free Event', 100, 0, 10);
      await eventManager.openRegistration(0);

      await expect(eventManager.connect(otherAccount).registerForEvent(0)).to
        .not.be.reverted;
    });

    it('Should revert if already registered', async function () {
      const { eventManager, otherAccount } = await deployEventManagerFixture();
      await eventManager.createEvent('Test Event', 2, 10, 10);
      await eventManager.openRegistration(0);

      await eventManager
        .connect(otherAccount)
        .registerForEvent(0, { value: 10 });
      await expect(
        eventManager.connect(otherAccount).registerForEvent(0, { value: 10 })
      ).to.be.revertedWithCustomError(eventManager, 'AlreadyRegistered');
    });

    it('Should revert if trying to register for a non-existent event', async function () {
      const { eventManager, otherAccount } = await deployEventManagerFixture();

      await expect(
        eventManager.connect(otherAccount).registerForEvent(999, { value: 10 })
      ).to.be.revertedWithCustomError(eventManager, 'EventNotFound');
    });

    it('Should revert if trying to register with zero value', async function () {
      const { eventManager, otherAccount } = await deployEventManagerFixture();

      await eventManager.createEvent('Test Event', 2, 10, 10);
      await eventManager.openRegistration(0);

      await expect(
        eventManager.connect(otherAccount).registerForEvent(0, { value: 0 })
      ).to.be.revertedWithCustomError(eventManager, 'InsufficientPayment');
    });

    it('Should not refund if exact payment is sent', async function () {
      const { eventManager, otherAccount } = await deployEventManagerFixture();

      await eventManager.createEvent('Test Event', 2, 10, 10);
      await eventManager.openRegistration(0);

      const tx = await eventManager
        .connect(otherAccount)
        .registerForEvent(0, { value: 10 });
      await expect(tx).to.not.emit(eventManager, 'RefundIssued');
    });

    it('Should return the correct list of participants', async function () {
      const { eventManager } = await deployEventManagerFixture();
      const [participant1, participant2] = await ethers.getSigners();

      await eventManager.createEvent('Test Event', 3, 10, 10);
      await eventManager.openRegistration(0);

      await eventManager
        .connect(participant1)
        .registerForEvent(0, { value: 10 });
      await eventManager
        .connect(participant2)
        .registerForEvent(0, { value: 10 });

      const participants = await eventManager.getParticipants(0);
      expect(participants).to.have.lengthOf(2);
      expect(participants).to.include(participant1.address);
      expect(participants).to.include(participant2.address);
    });

    it('Should revert when getting participants for a non-existent event', async function () {
      const { eventManager } = await deployEventManagerFixture();
      await expect(
        eventManager.getParticipants(999)
      ).to.be.revertedWithCustomError(eventManager, 'EventNotFound');
    });
  });

  describe('Withdrawals', function () {
    it('Should allow the owner to withdraw funds from the contract', async function () {
      const { eventManager, owner, otherAccount } =
        await deployEventManagerFixture();

      await eventManager.createEvent('Test Event', 2, 10, 10);
      await eventManager.openRegistration(0);
      await eventManager
        .connect(otherAccount)
        .registerForEvent(0, { value: 10 });

      const initialBalance = await hre.ethers.provider.getBalance(
        await eventManager.getAddress()
      );

      await expect(eventManager.withdrawFunds())
        .to.emit(eventManager, 'FundsWithdrawn')
        .withArgs(initialBalance);

      const finalBalance = await hre.ethers.provider.getBalance(
        await eventManager.getAddress()
      );
      expect(finalBalance).to.equal(0);
    });

    it('Should revert if non-owner tries to withdraw funds', async function () {
      const { eventManager, otherAccount } = await deployEventManagerFixture();
      await expect(
        eventManager.connect(otherAccount).withdrawFunds()
      ).to.be.revertedWithCustomError(eventManager, 'Unauthorized');
    });

    it('Should revert if there are no funds to withdraw', async function () {
      const { eventManager } = await deployEventManagerFixture();
      await expect(eventManager.withdrawFunds()).to.be.revertedWith(
        'No funds to withdraw'
      );
    });
  });

  describe('Fallback and Receive Functions', function () {
    async function deployEventManagerFixture() {
      const [owner, otherAccount] = await ethers.getSigners();

      const EventManager = await ethers.getContractFactory('EventManager');
      const eventManager = await EventManager.deploy();

      return { eventManager, owner, otherAccount };
    }

    it('Should revert when sending Ether directly to the contract (receive function)', async function () {
      const { eventManager, otherAccount } = await deployEventManagerFixture();

      await expect(
        otherAccount.sendTransaction({
          to: await eventManager.getAddress(),
          value: ethers.parseEther('1'),
        })
      ).to.be.revertedWith('Direct payments not accepted');
    });

    it('Should revert when sending Ether to a non-existent function (fallback function)', async function () {
      const { eventManager, otherAccount } = await deployEventManagerFixture();

      await expect(
        otherAccount.sendTransaction({
          to: await eventManager.getAddress(),
          data: ethers.hexlify(ethers.randomBytes(1)),
        })
      ).to.be.revertedWith('Function does not exist');
    });
  });

  describe('Event Emissions', function () {
    async function deployEventManagerFixture() {
      const [owner, otherAccount] = await hre.ethers.getSigners();

      const EventManager = await hre.ethers.getContractFactory('EventManager');
      const eventManager = await EventManager.deploy();

      return { eventManager, owner, otherAccount };
    }

    it('Should emit EventCreated when a new event is created', async function () {
      const { eventManager, otherAccount } = await deployEventManagerFixture();

      const tx = await eventManager
        .connect(otherAccount)
        .createEvent('Test Event', 100, 10, 1);
      const receipt = await tx.wait();

      if (!receipt) {
        throw new Error('Transaction receipt is null');
      }

      const currentTime = (await hre.ethers.provider?.getBlock(
        receipt.blockNumber
      ))!.timestamp;
      const expectedDeadline = currentTime + 1 * 24 * 60 * 60;

      await expect(tx)
        .to.emit(eventManager, 'EventCreated')
        .withArgs(
          0,
          'Test Event',
          100,
          10,
          expectedDeadline,
          otherAccount.address
        );
    });

    it('Should emit RegistrationOpened when registration is opened for an event', async function () {
      const { eventManager, otherAccount } = await deployEventManagerFixture();

      await eventManager
        .connect(otherAccount)
        .createEvent('Test Event', 100, 10, 10);
      const tx = await eventManager.connect(otherAccount).openRegistration(0);

      await expect(tx).to.emit(eventManager, 'RegistrationOpened').withArgs(0);
    });

    it('Should emit RegistrationClosed when registration is closed for an event', async function () {
      const { eventManager, otherAccount } = await deployEventManagerFixture();

      await eventManager
        .connect(otherAccount)
        .createEvent('Test Event', 100, 10, 10);
      await eventManager.connect(otherAccount).openRegistration(0);
      const tx = await eventManager.connect(otherAccount).closeRegistration(0);

      await expect(tx).to.emit(eventManager, 'RegistrationClosed').withArgs(0);
    });

    it('Should emit ParticipantRegistered when a user registers for an event', async function () {
      const { eventManager, otherAccount } = await deployEventManagerFixture();

      await eventManager
        .connect(otherAccount)
        .createEvent('Test Event', 2, 10, 10);
      await eventManager.connect(otherAccount).openRegistration(0);

      const tx = await eventManager
        .connect(otherAccount)
        .registerForEvent(0, { value: 10 });

      await expect(tx)
        .to.emit(eventManager, 'ParticipantRegistered')
        .withArgs(0, otherAccount.address);
    });

    it('Should emit RefundIssued when excess payment is refunded', async function () {
      const { eventManager, otherAccount } = await deployEventManagerFixture();

      await eventManager
        .connect(otherAccount)
        .createEvent('Test Event', 2, 10, 10);
      await eventManager.connect(otherAccount).openRegistration(0);

      const tx = await eventManager
        .connect(otherAccount)
        .registerForEvent(0, { value: 15 });

      await expect(tx)
        .to.emit(eventManager, 'RefundIssued')
        .withArgs(otherAccount.address, 5);
    });

    it('Should emit FundsWithdrawn when funds are withdrawn by the owner', async function () {
      const { eventManager, owner, otherAccount } =
        await deployEventManagerFixture();

      await eventManager
        .connect(otherAccount)
        .createEvent('Test Event', 2, 10, 10);
      await eventManager.connect(otherAccount).openRegistration(0);
      await eventManager
        .connect(otherAccount)
        .registerForEvent(0, { value: 10 });

      const tx = await eventManager.withdrawFunds();

      await expect(tx).to.emit(eventManager, 'FundsWithdrawn').withArgs(10);
    });
  });
});
