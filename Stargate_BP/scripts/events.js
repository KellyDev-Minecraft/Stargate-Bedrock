import { world, system, BlockPermutation, Player } from "@minecraft/server";

import { GateManager } from "./gate-manager.js";
import { GateDefinitions } from "./data/gate_definitions.js";

export function setupBlockInteractions() {
    // Unified Interaction Listener
    // Unified Interaction Listener (Right-Click)
    world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
        const { block, player } = event;
        const item = player.getComponent("minecraft:inventory")?.container?.getItem(player.selectedSlotIndex);

        // console.warn(`[Stargate] Interact: ${player.name} on ${block.typeId} with ${item?.typeId || "hand"}`);

        // --- Priority: Casting Guide (Plan Book) Interaction ---
        if (item?.typeId === "stargate:plan_book") {
            // 1. Check if it's an existing gate (Edit Mode)
            const gateResult = GateManager.findGateByBlock(block);
            if (gateResult) {
                event.cancel = true;
                system.run(() => {
                    player.addTag("stargate:ui_handled");
                    GateManager.showEditUI(gateResult.gate, player);
                });
                return;
            }

            // 2. Check if it matches a pattern for a new gate (Setup Mode)
            if (block.typeId.includes("sign")) {
                const match = GateManager.getPotentialGateMatch(block);
                if (match) {
                    event.cancel = true;
                    system.run(() => {
                        player.addTag("stargate:ui_handled");
                        GateManager.showSetupUI(match, player, block);
                    });
                    return;
                }
            }

            // Summoning
            if (player.hasTag("stargate_summon_mode")) {
                event.cancel = true;
                const typeTag = player.getTags().find(t => t.startsWith("stargate_summon_type:"));
                if (typeTag) {
                    const gateId = typeTag.split(":")[1];
                    const gateDef = GateDefinitions.find(d => d.id === gateId);
                    if (gateDef) {
                        const rot = player.getRotation().y;
                        const axis = (Math.abs(rot) < 45 || Math.abs(rot) > 135) ? 'x' : 'z';
                        const startLoc = { x: block.x, y: block.y + 1, z: block.z, dim: player.dimension.id };
                        system.run(() => {
                            if (!player.hasTag("stargate_summon_mode")) return;
                            player.removeTag("stargate_summon_mode");
                            player.removeTag(typeTag);
                            GateManager.autoBuildGate(player, gateDef, startLoc, axis);
                        });
                        return;
                    }
                }
            }
        }

        // --- Standard Interactions (No Book or Ignored Book) ---
        if (block.typeId.includes("sign")) {
            const isGate = GateManager.findGateBySign(block);
            if (isGate) {
                event.cancel = true;
                system.run(() => {
                    GateManager.handleSignInteraction(block, player);
                });
                return;
            }
        }

        if (block.typeId.includes("button")) {
            system.run(() => {
                GateManager.handleButtonInteraction(block, player);
            });
        }
    });

    // Handle Gate Destruction (without book)
    world.afterEvents.playerBreakBlock.subscribe((event) => {
        const { block, player } = event;
        const result = GateManager.findGateByBlock(block);
        if (result) {
            const { key, gate } = result;
            GateManager.deleteGate(key);
            player.sendMessage(`§cStargate '${gate.name}' destroyed.`);
        }
    });

    console.warn("Sign Interactions Registered");
}


