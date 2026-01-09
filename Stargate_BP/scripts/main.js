import { world, system } from "@minecraft/server";
import { setupBlockInteractions } from "./events.js";
import { UiManager } from "./ui-manager.js";
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
            // If in summon mode or actively building, only open UI if sneaking
            if ((player.hasTag("stargate_summon_mode") || player.hasTag("stargate_summoning")) && !player.isSneaking) {
                player.sendMessage("§eSneak + Right-click air to open selection menu; or Right-click a block to summon.§r");
                return;
            }

            system.run(() => {
                try {
                    UiManager.showGateSelection(player);
                } catch (e) {
                    console.warn(`UI Error: ${e}`);
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
