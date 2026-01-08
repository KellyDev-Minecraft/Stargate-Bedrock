import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { GateDefinitions } from "./data/gate_definitions.js";
import { GateManager } from "./gate-manager.js";

export class UiManager {
    static async showGateSelection(player) {
        console.warn(`UiManager.showGateSelection called for ${player.name}`);
        const form = new ActionFormData()
            .title("Stargate Casting Guide")
            .body("Select a gate type to view its construction plan.");

        // Sort GateDefinitions: first by XP cost, then by ID
        const sortedGatesList = GateDefinitions.map(gate => ({
            gate,
            cost: GateManager.calculateGateXpCost(gate, player)
        })).sort((a, b) => {
            if (a.cost !== b.cost) return a.cost - b.cost;
            return a.gate.id.localeCompare(b.gate.id);
        });

        for (const item of sortedGatesList) {
            form.button(`${item.gate.id}`);
        }

        const response = await form.show(player);
        if (!response || response.canceled) return;
        console.warn(`Form response: selection=${response.selection}`);

        const selectedGate = sortedGatesList[response.selection].gate;
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
        layoutText += ` . = Portal (Open/Close)\n\n`;
        layoutText += "Layout:\n";

        for (const line of gateDef.layout) {
            layoutText += `  ${line}\n`; // Indent for readability
        }

        const xpCost = GateManager.calculateGateXpCost(gateDef, player);
        const isCreative = player.getGameMode() === "creative";
        const playerLevels = isCreative ? "Infinite" : player.level;
        const canAfford = isCreative || player.level >= xpCost;

        const form = new ActionFormData()
            .title(`Plan: ${gateDef.id}`)
            .body(layoutText + `\n§6Required: ${xpCost} Levels§r (You have: ${playerLevels} Levels)`);

        if (canAfford) {
            form.button(`§6Summon Gate§r\n(Costs Blocks + ${xpCost} xp)`);
        } else {
            form.button(`§8Summon Gate§r\n§c(Insufficient xp: ${xpCost} required)`);
        }

        form.button("Back")
            .button("Close");

        const response = await form.show(player);
        if (response.canceled) return;

        if (response.selection === 0) {
            if (!canAfford) {
                player.sendMessage(`§cYou need ${xpCost} xp to summon this gate. (Currently: ${playerLevels})§r`);
                return;
            }
            // Fix tag accumulation: remove any existing summon type tags
            const existingTags = player.getTags();
            for (const tag of existingTags) {
                if (tag.startsWith("stargate_summon_type:")) {
                    player.removeTag(tag);
                }
            }

            // Initiate Summoning Mode
            player.addTag("stargate_summon_mode");
            player.addTag(`stargate_summon_type:${gateDef.id}`);
            player.sendMessage(`§6Summon Mode Active!§r\nRight-click a block with the Casting Guide to summon the §e${gateDef.id}§r.\n§7(Sneak + Use to change selection)§r`);
        } else if (response.selection === 1) {
            this.showGateSelection(player);
        }
    }
}
