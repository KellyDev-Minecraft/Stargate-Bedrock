import { world, system, BlockPermutation } from "@minecraft/server";
import { GateManager } from "./gate-manager.js";
import { GateDefinitions } from "./data/gate_definitions.js";

export function setupBlockInteractions() {
    // Unified Interaction Listener
    world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
        const { block, player } = event;

        // Check for Sign interaction
        if (block.typeId.includes("sign")) {

            // 1. Check if it's already a registered gate
            const isGate = GateManager.findGateBySign(block);
            if (isGate) {
                // If player is sneaking, allow vanilla sign editing ONLY if they have control permission
                if (player.isSneaking) {
                    if (GateManager.hasGateControlPermission(player, isGate)) {
                        return;
                    } else {
                        event.cancel = true;
                        player.sendMessage("§cYou do not have permission to edit this Stargate's sign!§r");
                        return;
                    }
                }
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
                // Check permissions to establish gates
                if (!GateManager.hasGateBuilderPermission(player)) {
                    player.sendMessage("§cYou do not have permission to establish Stargates!§r");
                    return;
                }

                // Cancel vanilla event
                event.cancel = true;
                system.run(() => {
                    // Try to auto-recreate from sign text if it looks like a stargate sign
                    const signComp = block.getComponent("minecraft:sign");
                    if (signComp) {
                        const text = signComp.getText();
                        const parsed = GateManager.parseStargateSignText(text);
                        if (parsed) {
                            GateManager.recreateGateFromSignText(match, block, parsed.name, parsed.network, player);
                            return;
                        }
                    }

                    GateManager.showSetupUI(match, player, block);
                });
                return;
            }

            // If neither, DO NOT cancel event (allows vanilla sign editing)
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
                    // Check again inside system.run to prevent double-triggering
                    if (!player.hasTag("stargate_summon_mode")) return;

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

            // Enforce control permission on gate destruction
            if (!GateManager.hasGateControlPermission(player, gate)) {
                player.sendMessage("§cYou do not have permission to destroy this Stargate!§r");
                system.run(() => {
                    try {
                        const dim = world.getDimension(block.dimension.id);
                        dim.getBlock(block).setPermutation(event.brokenBlockPermutation);
                    } catch (e) {}
                });
                return;
            }

            console.warn(`Gate Destruction Detected: ${gate.name} at ${block.x},${block.y},${block.z}`);
            GateManager.deleteGate(key);
            player.sendMessage(`§cStargate '${gate.name}' destroyed.`);
        }
    });

    console.warn("Sign Interactions Registered");
}
