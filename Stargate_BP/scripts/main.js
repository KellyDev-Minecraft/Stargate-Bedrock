import { world, system } from "@minecraft/server";
import { setupBlockInteractions } from "./events.js";
import { UiManager } from "./ui-manager.js";

system.run(() => {
    world.afterEvents.worldInitialize.subscribe(() => {
        console.warn("Stargate Addon Initialized");
    });

    setupBlockInteractions();
    setupItemInteractions();
});

function setupItemInteractions() {
    world.beforeEvents.itemUse.subscribe((event) => {
        if (event.itemStack.typeId === "stargate:plan_book") {
            system.run(() => {
                UiManager.showGateSelection(event.source);
            });
        }
    });
}
