import { world, system, BlockPermutation } from "@minecraft/server";
import { GateManager } from "./gate-manager.js";
import { GateDefinitions } from "./data/gate_definitions.js";

export function setupBlockInteractions() {
    // Unified Interaction Listener
    world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
        const { block, player } = event;
        console.warn(`Interaction Detected: ${block.typeId} at ${block.x},${block.y},${block.z}`);

        // Check for Sign interaction
        if (block.typeId.includes("sign")) {
            console.warn("Sign interaction matched!");

            // 1. Check if it's already a registered gate
            const isGate = GateManager.findGateBySign(block);
            if (isGate) {
                // Cancel vanilla event and handle interaction
                event.cancel = true;
                system.run(() => {
                    GateManager.handleSignInteraction(block, player);
                });
                return;
            }

            // 2. Not a gate? Check if it MATHER a pattern
            const match = GateManager.getPotentialGateMatch(block);
            if (match) {
                // Cancel vanilla event and show setup UI
                event.cancel = true;
                system.run(() => {
                    GateManager.showSetupUI(match, player, block);
                });
                return;
            }

            // If neither, DO NOT cancel event (allows vanilla sign editing)
            console.warn("No gate match found, allowing vanilla sign editing.");
        }

        // Check for Button interaction
        if (block.typeId.includes("button")) {
            system.run(() => {
                GateManager.handleButtonInteraction(block, player);
            });
        }

        // Check for Casting Guide Summoning
        const item = player.getComponent("minecraft:inventory")?.container?.getItem(player.selectedSlotIndex);
        if (item?.typeId === "stargate:plan_book" && player.hasTag("stargate_summon_mode")) {
            console.warn(`Summoning triggered at ${block.x},${block.y},${block.z} by ${player.name}`);

            // Cancel the event to prevent placing the book (if it were placeable) or block interaction
            event.cancel = true;

            const tags = player.getTags();
            const typeTag = tags.find(t => t.startsWith("stargate_summon_type:"));
            if (!typeTag) return;

            const gateId = typeTag.split(":")[1];
            const gateDef = GateDefinitions.find(d => d.id === gateId);
            if (!gateDef) return;

            // Determine Axis based on player facing
            const rot = player.getRotation().y;
            const axis = (Math.abs(rot) < 45 || Math.abs(rot) > 135) ? 'x' : 'z';
            const startLoc = { x: block.x, y: block.y + 1, z: block.z, dim: player.dimension.id };

            system.run(() => {
                try {
                    player.removeTag("stargate_summon_mode");
                    player.removeTag(typeTag);
                    GateManager.autoBuildGate(player, gateDef, startLoc, axis);
                } catch (e) {
                    console.warn(`Summon Error: ${e}`);
                }
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
