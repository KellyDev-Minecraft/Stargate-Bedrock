import { world, system } from "@minecraft/server";
import { GateManager } from "./gate-manager.js";
import { GateDefinitions } from "./data/gate_definitions.js";

export function setupBlockInteractions() {
    // Unified Interaction Listener (Right-Click)
    world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
        const { block, player } = event;

        // --- 1. Sign Interaction ---
        if (block.typeId.includes("sign")) {
            // Check if it's already a registered gate
            const isGate = GateManager.findGateBySign(block);
            if (isGate) {
                // If player is sneaking, allow vanilla sign editing ONLY if they have control permission
                if (player.isSneaking) {
                    if (GateManager.hasGateControlPermission(player, isGate)) {
                        // Allow vanilla sign editing to fall through
                        return;
                    } else {
                        event.cancel = true;
                        system.run(() => {
                            player.sendMessage("§cYou do not have permission to edit this Stargate's sign!§r");
                        });
                        return;
                    }
                }
                // Cancel vanilla event and handle sign cycling / real-time update
                event.cancel = true;
                system.run(() => {
                    GateManager.handleSignInteraction(block, player);
                });
                return;
            }

            // Not a gate? Check if it matches a gate pattern
            const match = GateManager.getPotentialGateMatch(block);
            if (match) {
                // If sneaking, allow vanilla sign editing to customize the text
                if (player.isSneaking) {
                    return;
                }

                // Check permissions to establish gates
                if (!GateManager.hasGateBuilderPermission(player)) {
                    event.cancel = true;
                    system.run(() => {
                        player.sendMessage("§cYou do not have permission to establish Stargates!§r");
                    });
                    return;
                }

                // Cancel vanilla event
                event.cancel = true;
                system.run(() => {
                    // Try to auto-recreate from sign text
                    const signComp = block.getComponent("minecraft:sign");
                    if (signComp) {
                        const text = signComp.getText();
                        const parsed = GateManager.parseStargateSignText(text);
                        if (parsed) {
                            GateManager.recreateGateFromSignText(match, block, parsed.name, parsed.network, player);
                            return;
                        }
                    }

                    // Blank or invalid sign text: Display reminder/instructions in chat
                    player.sendMessage(
                        "\n§e=== Stargate Setup Instructions ===§r\n" +
                        "Write details on the sign to establish the gate:\n" +
                        " §7Line 1:§r §1-GateName-§r (e.g. §1-Base-§r)\n" +
                        " §7Line 3:§r §3NetworkName§r (e.g. §3Public§r)\n" +
                        " §7Line 4:§r §5Flags§r (optional: §5A, R, H, P, B, Q, N, U§r)\n" +
                        "§eSneak + Right-click§r to edit, then right-click to establish!"
                    );
                });
                return;
            }
        }

        // --- 2. Button Interaction ---
        if (block.typeId.includes("button")) {
            system.run(() => {
                GateManager.handleButtonInteraction(block, player);
            });
            return;
        }

        // --- 3. Summoning Interaction (Plan Book / Casting Guide) ---
        const item = player.getComponent("minecraft:inventory")?.container?.getItem(player.selectedSlotIndex);
        if (item?.typeId === "stargate:plan_book" && player.hasTag("stargate_summon_mode")) {
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
                }
            }
        }
    });

    // Prevent unauthorized gate destruction (cancels before block breaks — no item dupe)
    world.beforeEvents.playerBreakBlock.subscribe((event) => {
        const { block, player } = event;
        const result = GateManager.findGateByBlock(block);
        if (result) {
            const { gate } = result;
            if (!GateManager.hasGateControlPermission(player, gate)) {
                event.cancel = true;
                system.run(() => {
                    player.sendMessage("§cYou do not have permission to destroy this Stargate!§r");
                });
            }
        }
    });

    // Handle authorized gate destruction (after block is broken)
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


