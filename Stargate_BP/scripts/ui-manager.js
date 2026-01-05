import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { GateDefinitions } from "./data/gate_definitions.js";

export class UiManager {
    static async showGateSelection(player) {
        const form = new ActionFormData()
            .title("Stargate Plans")
            .body("Select a gate type to view its construction plan.");

        for (const gate of GateDefinitions) {
            form.button(gate.id);
        }

        const response = await form.show(player);

        if (response.canceled) return;

        const selectedGate = GateDefinitions[response.selection];
        if (selectedGate) {
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

        const form = new ActionFormData() // Using ActionForm as a simple "Okay" dialog
            .title(`Plan: ${gateDef.id}`)
            .body(layoutText)
            .button("Back")
            .button("Close");

        const response = await form.show(player);

        if (response.selection === 0) {
            this.showGateSelection(player);
        }
    }
}
