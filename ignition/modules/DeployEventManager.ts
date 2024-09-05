import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const deployEventManager = buildModule("EventManagerModule", (m) => {
    
  const eventManager = m.contract("EventManager");

  return { eventManager };
});

export default deployEventManager;
