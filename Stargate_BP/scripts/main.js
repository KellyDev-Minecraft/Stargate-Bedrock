import { world, system } from "@minecraft/server";
import { setupBlockInteractions } from "./events.js";
import { UiManager } from "./ui-manager.js";
import { GateManager } from "./gate-manager.js";

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
    world.beforeEvents.itemUse.subscribe((event) => {
        console.warn(`Item used: ${event.itemStack.typeId}`);
        if (event.itemStack.typeId === "stargate:plan_book") {
            console.warn("Plan book detected, triggering UI...");
            system.run(() => {
                try {
                    UiManager.showGateSelection(event.source);
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
});
