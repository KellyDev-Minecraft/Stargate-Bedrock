import { world, system, BlockPermutation } from "@minecraft/server";
import { GateManager } from "./gate-manager.js";

export function setupBlockInteractions() {
    // Unified Interaction Listener
    world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
        const { block, player } = event;
        console.warn(`Interaction Detected: ${block.typeId} at ${block.x},${block.y},${block.z}`);

        // Check for Sign interaction
        if (block.typeId.includes("sign")) {
            console.warn("Sign interaction matched!");

            // Critical: Cancel the vanilla event to prevent "Edit Sign" UI from blocking ours
            event.cancel = true;

            // Use runTimeout to give a small buffer after the event tick
            system.runTimeout(() => {
                // First, check if it's already a registered gate
                const isGate = GateManager.findGateBySign(block);
                if (isGate) {
                    GateManager.handleSignInteraction(block, player);
                } else {
                    // If not a gate, try to create one
                    GateManager.checkAndCreateGateFromSign(block, player);
                }
            }, 2); // 2 tick delay
        }

        // Check for Button interaction
        if (block.typeId.includes("button")) {
            system.run(() => {
                GateManager.handleButtonInteraction(block, player);
            });
        }
    });

    // Handle Gate Destruction
    world.afterEvents.playerBreakBlock.subscribe((event) => {
        const { block, player } = event;
        const result = GateManager.findGateByBlock(block);
        if (result) {
            const { key, gate } = result;
            console.warn(`Gate Destruction Detected: ${gate.name} at ${block.x},${block.y},${block.z}`);
            GateManager.deleteGate(key);
            player.sendMessage(`§cStargate '${gate.name}' destroyed.`);
        }
    });

    console.warn("Sign Interactions Registered");
}
