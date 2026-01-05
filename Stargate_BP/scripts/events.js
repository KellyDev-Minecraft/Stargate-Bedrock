import { world, system, BlockPermutation } from "@minecraft/server";
import { GateManager } from "./gate-manager.js";

export function setupBlockInteractions() {
    world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
        const { block, player } = event;

        // Simple check: is it a button?
        if (block.typeId.includes("button")) {
            // We need to run the logic in the next tick or async to avoid blocking the event cancelling
            system.run(() => {
                GateManager.checkAndActivateGate(block, player);
            });
        }
    });
}
