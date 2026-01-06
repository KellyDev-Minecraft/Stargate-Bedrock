import { world, system, DynamicPropertiesDefinition } from "@minecraft/server";
import { setupBlockInteractions } from "./events.js";
import { UiManager } from "./ui-manager.js";

console.warn("Stargate Script Loading...");

system.run(() => {
    try {
        world.beforeEvents.worldInitialize.subscribe((event) => {
            try {
                const def = new DynamicPropertiesDefinition();
                def.defineString("sg_all_gates", 32000);
                event.propertyRegistry.registerWorldDynamicProperties(def);
                console.warn("Dynamic Properties Registered");
            } catch (e) {
                console.warn("Property Config Error: " + e);
            }
        });

        world.afterEvents.worldInitialize.subscribe(() => {
            console.warn("Stargate Addon Initialized");
        });

        setupBlockInteractions();
        setupItemInteractions();
    } catch (e) {
        console.warn("Critical Script Error: " + e + "\n" + e.stack);
    }
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
