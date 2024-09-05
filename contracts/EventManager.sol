// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract EventManager {
    uint256 public eventCount;
    address public immutable contractOwner;
    bool private _locked;

    struct Event {
        string name;
        uint256 maxParticipants;
        uint256 registrationFee;
        uint256 deadline;
        bool isOpen;
        address creator;
        address[] participants;
    }

    mapping(uint256 => Event) public events;
    mapping(uint256 => mapping(address => bool)) public registered;

    event EventCreated(
        uint256 indexed eventId,
        string name,
        uint256 maxParticipants,
        uint256 registrationFee,
        uint256 deadline,
        address creator
    );

    event RegistrationOpened(uint256 indexed eventId);
    event RegistrationClosed(uint256 indexed eventId);
    event ParticipantRegistered(uint256 indexed eventId, address participant);
    event RefundIssued(address indexed recipient, uint256 amount);
    event FundsWithdrawn(uint256 amount);

    error EventNotFound();
    error RegistrationHasClosed();
    error MaxParticipantsReached();
    error InsufficientPayment();
    error DeadlinePassed();
    error Unauthorized();
    error AlreadyRegistered();

    constructor() {
        contractOwner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != contractOwner) revert Unauthorized();
        _;
    }

    modifier noReentrancy() {
        require(!_locked, "Stop making reentrancy calls! Please hold.");
        _locked = true;
        _;
        _locked = false;
    }

    modifier eventExists(uint256 _eventId) {
        if (_eventId >= eventCount) revert EventNotFound();
        _;
    }

    modifier onlyEventCreator(uint256 _eventId) {
        if (msg.sender != events[_eventId].creator) revert Unauthorized();
        _;
    }

    function createEvent(
        string memory _name,
        uint256 _maxParticipants,
        uint256 _registrationFee,
        uint256 _daysUntilDeadline
    ) external {
        require(bytes(_name)[0] != 0, "Event name cannot be empty");
        require(
            _daysUntilDeadline > 0,
            "Deadline must be at least 1 day in the future"
        );
        assert(_maxParticipants > 0);

        uint256 _deadline = block.timestamp + (_daysUntilDeadline * 1 days);

        uint256 eventId = eventCount++;
        events[eventId] = Event({
            name: _name,
            maxParticipants: _maxParticipants,
            registrationFee: _registrationFee,
            deadline: _deadline,
            isOpen: false,
            creator: msg.sender,
            participants: new address[](0) 
        });

        emit EventCreated(
            eventId,
            _name,
            _maxParticipants,
            _registrationFee,
            _deadline,
            msg.sender
        );
    }

    function openRegistration(uint256 _eventId)
        external
        eventExists(_eventId)
        onlyEventCreator(_eventId)
    {
        Event storage evt = events[_eventId];
        require(!evt.isOpen, "Registration is already open");
        evt.isOpen = true;
        emit RegistrationOpened(_eventId);
    }

    function closeRegistration(uint256 _eventId)
        external
        eventExists(_eventId)
        onlyEventCreator(_eventId)
    {
        Event storage evt = events[_eventId];
        require(evt.isOpen, "Registration is already closed");
        evt.isOpen = false;
        emit RegistrationClosed(_eventId);
    }

    function registerForEvent(uint256 _eventId)
        external
        payable
        eventExists(_eventId)
        noReentrancy
    {
        Event storage evt = events[_eventId];

        bool isOpen = evt.isOpen;
        uint256 maxParticipants = evt.maxParticipants;
        uint256 registrationFee = evt.registrationFee;
        uint256 deadline = evt.deadline;
        address[] storage participants = evt.participants;

        if (!isOpen) revert RegistrationHasClosed();
        if (participants.length >= maxParticipants)
            revert MaxParticipantsReached();
        if (msg.value < registrationFee) revert InsufficientPayment();
        if (block.timestamp > deadline) revert DeadlinePassed();
        if (registered[_eventId][msg.sender]) revert AlreadyRegistered();

        participants.push(msg.sender);
        registered[_eventId][msg.sender] = true;
        emit ParticipantRegistered(_eventId, msg.sender);

        uint256 excessAmount = msg.value > registrationFee
            ? msg.value - registrationFee
            : 0;
        if (excessAmount > 0) {
            payable(msg.sender).transfer(excessAmount);
            emit RefundIssued(msg.sender, excessAmount);
        }
    }

    function getParticipants(uint256 _eventId)
        external
        view
        eventExists(_eventId)
        returns (address[] memory)
    {
        return events[_eventId].participants;
    }

    function withdrawFunds() external onlyOwner noReentrancy {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");

        payable(contractOwner).transfer(balance);

        emit FundsWithdrawn(balance);
    }

    receive() external payable {
        revert("Direct payments not accepted");
    }

    fallback() external payable {
        revert("Function does not exist");
    }
}
