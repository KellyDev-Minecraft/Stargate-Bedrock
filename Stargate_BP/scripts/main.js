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
    world.beforeEvents.itemUse.subscribe((event) => {
        if (event.itemStack.typeId === "stargate:plan_book") {
            // If in summon mode, don't open UI, just let itemUseOn handle it
            if (event.source.hasTag("stargate_summon_mode")) return;

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

    world.afterEvents.itemUseOn.subscribe((ev) => {
        const { source: player, itemStack, block } = ev;
        if (itemStack?.typeId === "stargate:plan_book" && player.hasTag("stargate_summon_mode")) {
            const tags = player.getTags();
            const typeTag = tags.find(t => t.startsWith("stargate_summon_type:"));
            if (!typeTag) return;

            const gateId = typeTag.split(":")[1];
            const gateDef = GateDefinitions.find(d => d.id === gateId);
            if (!gateDef) return;

            // Determine Axis based on player facing
            // 0=South, 90=West, 180=North, 270=East
            const rot = player.getRotation().y;
            const axis = (Math.abs(rot) < 45 || Math.abs(rot) > 135) ? 'x' : 'z';

            const startLoc = { x: block.x, y: block.y + 1, z: block.z, dim: player.dimension.id };

            player.removeTag("stargate_summon_mode");
            player.removeTag(typeTag);

            system.run(() => {
                try {
                    GateManager.autoBuildGate(player, gateDef, startLoc, axis);
                } catch (e) {
                    console.warn(`Summon Error: ${e}`);
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
