import { world, system } from "@minecraft/server";
import { setupBlockInteractions } from "./events.js";
import { GateManager } from "./gate-manager.js";
import { GateDefinitions } from "./data/gate_definitions.js";

console.warn("Stargate Script Loading...");

system.run(() => {
    try {
        // Dynamic Properties setup removed due to compatibility issues.
        // Falling back to Entity-Tag storage handled in GateManager.

        world.afterEvents.worldInitialize.subscribe(() => {
            console.warn("Stargate Addon Initialized");

            // Ensure ticking area for Database Entity
            try {
                const overworld = world.getDimension("overworld");
                // Add a ticking area at 0,0,0 radius 1 to keep DB entity loaded
                overworld.runCommandAsync("tickingarea add circle 0 0 0 2 stargate_db_area true");
                console.warn("Ticking area established for StargateDB.");
            } catch (e) {
                console.warn(`Failed to create ticking area: ${e}`);
            }
        });

        setupBlockInteractions();
        setupItemInteractions();
    } catch (e) {
        console.warn("Critical Script Error: " + e + "\n" + e.stack);
    }
});

function setupItemInteractions() {
    console.warn("Registering itemUse listener...");
    world.afterEvents.itemUse.subscribe((event) => {
        const item = event.itemStack;
        const player = event.source;

        if (item?.typeId === "stargate:plan_book") {
            // If actively building, ignore
            if (player.hasTag("stargate_summoning")) {
                player.sendMessage("§cA gate is currently being summoned. Please wait.§r");
                return;
            }

            system.run(() => {
                try {
                    if (player.isSneaking) {
                        // Sneak + use: Cancel summon mode if active, show full guide
                        if (player.hasTag("stargate_summon_mode")) {
                            player.removeTag("stargate_summon_mode");
                            const existingTypeTag = player.getTags().find(t => t.startsWith("stargate_summon_type:"));
                            if (existingTypeTag) player.removeTag(existingTypeTag);
                            player.sendMessage("§cSummon mode cancelled.§r\n");
                        }
                        player.sendMessage(
                            "\n§6§l=== Stargate Bedrock Guide ===§r\n" +
                            "§eTo establish a new Stargate:§r\n" +
                            "1. Build the gate frame (e.g. Classic frame).\n" +
                            "2. Place a §bsign§r on the control block (-).\n" +
                            "3. Write details on the sign:\n" +
                            "   §7Line 1:§r §1-GateName-§r (e.g., §1-Alpha-§r)\n" +
                            "   §7Line 3:§r §3NetworkName§r (e.g., §3Public§r)\n" +
                            "   §7Line 4:§r §5Flags§r (optional: §5A, R, H, P, B, Q, N, U§r)\n" +
                            "4. Place a §bbutton§r on the other control block (-).\n" +
                            "5. §bRight-click§r the sign to establish instantly!\n\n" +
                            "§eFlags (Line 4):§r\n" +
                            " §5A§r: Always-On  |  §5R§r: Random Teleport  |  §5H§r: Hidden\n" +
                            " §5P§r: Private    |  §5B§r: Backwards Exit |  §5Q§r: Silent\n" +
                            " §5N§r: Hide Net   |  §5U§r: Always-On Direct Link\n\n" +
                            "§eInteraction:§r\n" +
                            " - §bRight-click§r sign to cycle destinations on the network.\n" +
                            " - §bPress Button§r to activate gate and teleport.\n" +
                            " - §bSneak + Right-click§r sign to edit text (owner only).\n"
                        );
                    } else {
                        // Regular use: Cycle through gate types and enter summon mode
                        const gates = GateDefinitions;
                        const existingTypeTag = player.getTags().find(t => t.startsWith("stargate_summon_type:"));
                        let currentIndex = 0;

                        if (existingTypeTag && player.hasTag("stargate_summon_mode")) {
                            // Already in summon mode — cycle to next gate type
                            const currentId = existingTypeTag.split(":")[1];
                            const foundIdx = gates.findIndex(g => g.id === currentId);
                            currentIndex = (foundIdx + 1) % gates.length;
                            player.removeTag(existingTypeTag);
                        }

                        const selectedGate = gates[currentIndex];
                        player.addTag("stargate_summon_type:" + selectedGate.id);

                        if (!player.hasTag("stargate_summon_mode")) {
                            player.addTag("stargate_summon_mode");
                        }

                        // Build layout preview and materials list
                        const layoutPreview = selectedGate.layout.map(row => `  §7${row}§r`).join("\n");
                        const matList = Object.entries(selectedGate.materials)
                            .map(([k, v]) => `§7${k}§r=§b${v.replace("minecraft:", "")}§r`)
                            .join(", ");

                        player.sendMessage(
                            `\n§6§l=== Summon Mode ===§r\n` +
                            `§eSelected: §b${selectedGate.id}§r (${currentIndex + 1}/${gates.length})\n` +
                            `${layoutPreview}\n` +
                            `§eMaterials:§r ${matList}\n\n` +
                            `§aRight-click a block§r to summon the gate above it.\n` +
                            `§aRight-click air§r to cycle to the next design.\n` +
                            `§cSneak + Right-click§r to cancel and view guide.`
                        );
                    }
                } catch (e) {
                    console.warn(`Casting Guide Error: ${e}`);
                }
            });
        }
    });
}

// setup tick loop
system.runInterval(() => {
    try {
        GateManager.tick();
    } catch (e) {
    }
}, 1);

// Scheduled maintenance (every 5 minutes)
system.runInterval(() => {
    try {
        GateManager.runMaintenance();
    } catch (e) {
        console.warn(`Maintenance Error: ${e}`);
    }
}, 6000);
