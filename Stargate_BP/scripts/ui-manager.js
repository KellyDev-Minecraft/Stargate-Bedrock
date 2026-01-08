import { GateDefinitions } from "./data/gate_definitions.js";
import { GateManager } from "./gate-manager.js";

export class UiManager {
    static async showGateSelection(player) {
        console.warn(`UiManager.showGateSelection called for ${player.name}`);
        const form = new ActionFormData()
            .title("Stargate Casting Guide")
            .body("Select a gate type to view its construction plan.");

        // Sort GateDefinitions: first by XP cost, then by ID
        const sortedGates = [...GateDefinitions].sort((a, b) => {
            const costA = GateManager.calculateGateXpCost(a, player);
            const costB = GateManager.calculateGateXpCost(b, player);
            if (costA !== costB) return costA - costB;
            return a.id.localeCompare(b.id);
        });

        for (const gate of sortedGates) {
            const cost = GateManager.calculateGateXpCost(gate, player);
            form.button(`${gate.id}\n§8Cost: ${cost} XP`);
        }

        const response = await form.show(player);
        if (!response || response.canceled) return;
        console.warn(`Form response: selection=${response.selection}`);

        const selectedGate = sortedGates[response.selection];
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

        const xpCost = GateManager.calculateGateXpCost(gateDef, player);
        const playerXp = player.xpQuantity;
        const canAfford = playerXp >= xpCost;

        const form = new ActionFormData()
            .title(`Plan: ${gateDef.id}`)
            .body(layoutText + `\n§6Required: ${xpCost} XP§r (You have: ${playerXp} XP)`);

        if (canAfford) {
            form.button(`§6Summon Gate§r\n(Costs Blocks + ${xpCost} XP)`);
        } else {
            form.button(`§8Summon Gate§r\n§c(Insufficient XP: ${xpCost} required)`);
        }

        form.button("Back")
            .button("Close");

        const response = await form.show(player);
        if (response.canceled) return;

        if (response.selection === 0) {
            if (!canAfford) {
                player.sendMessage(`§cYou need ${xpCost} XP to summon this gate. (Currently: ${playerXp})§r`);
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
