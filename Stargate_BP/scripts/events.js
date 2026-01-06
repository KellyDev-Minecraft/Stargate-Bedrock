import { world, system, BlockPermutation } from "@minecraft/server";
import { GateManager } from "./gate-manager.js";

export function setupBlockInteractions() {
    // 1. Creation: Listen for Sign Placement
    world.afterEvents.playerPlaceBlock.subscribe((event) => {
        const { block, player } = event;
        if (block.typeId.includes("sign")) {
            system.run(() => {
                GateManager.checkAndCreateGateFromSign(block, player);
            });
        }
    });

    // 2. Interaction: Listen for Sign Interaction (Dialing)
    world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
        const { block, player } = event;
        if (block.typeId.includes("sign")) {
            system.run(() => {
                GateManager.handleSignInteraction(block, player);
            });
        }
    });

    console.warn("Sign Interactions Registered");
}
