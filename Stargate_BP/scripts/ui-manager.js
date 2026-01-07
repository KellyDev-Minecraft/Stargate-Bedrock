import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { GateDefinitions } from "./data/gate_definitions.js";

export class UiManager {
    static async showGateSelection(player) {
        console.warn(`UiManager.showGateSelection called for ${player.name}`);
        const form = new ActionFormData()
            .title("Stargate Casting Guide")
            .body("Select a gate type to view its construction plan.");

        console.warn(`Loading ${GateDefinitions.length} definitions...`);
        for (const gate of GateDefinitions) {
            form.button(gate.id);
        }

        console.warn("Showing form...");
        const response = await form.show(player);
        console.warn(`Form response: canceled=${response.canceled}, selection=${response.selection}`);

        if (response.canceled) return;

        const selectedGate = GateDefinitions[response.selection];
        if (selectedGate) {
            console.warn(`Selected gate: ${selectedGate.id}`);
            this.showGateDetails(player, selectedGate);
        }
    }

    static async showGateDetails(player, gateDef) {
        // Construct visual representation of the layout
        let layoutText = "Legend:\n";
        for (const [char, mat] of Object.entries(gateDef.materials)) {
            layoutText += ` ${char} = ${mat.replace('minecraft:', '')}\n`;
        }
        layoutText += ` - = Controls (Button/Sign)\n`;
        layoutText += ` . = Portal (Open)\n\n`;
        layoutText += "Layout:\n";

        for (const line of gateDef.layout) {
            layoutText += `  ${line}\n`; // Indent for readability
        }

        const form = new ActionFormData()
            .title(`Plan: ${gateDef.id}`)
            .body(layoutText)
            .button("§6Summon Gate§r\n(Costs XP + Blocks)")
            .button("Back")
            .button("Close");

        const response = await form.show(player);
        if (response.canceled) return;

        if (response.selection === 0) {
            // Initiate Summoning Mode
            player.addTag("stargate_summon_mode");
            player.addTag(`stargate_summon_type:${gateDef.id}`);
            player.sendMessage(`§6Summon Mode Active!§r\nRight-click a block with the Casting Guide to summon the §e${gateDef.id}§r.`);
        } else if (response.selection === 1) {
            this.showGateSelection(player);
        }
    }
}
