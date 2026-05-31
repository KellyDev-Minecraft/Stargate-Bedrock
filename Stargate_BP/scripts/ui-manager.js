import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { GateDefinitions } from "./data/gate_definitions.js";
import { GateManager } from "./gate-manager.js";

export class UiManager {
    static async showGateSelection(player) {
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

        const isAdmin = player.getGameMode() === "creative" || player.hasTag("stargate_admin");

        for (const item of sortedGatesList) {
            form.button(`${item.gate.id}`);
        }

        form.button("§bSign & Flag Guide§r");

        if (isAdmin) {
            form.button("§dAdmin Tools§r");
        }

        const response = await form.show(player);
        if (!response || response.canceled) return;

        if (response.selection === sortedGatesList.length) {
            this.showSignGuide(player);
            return;
        }

        if (isAdmin && response.selection === sortedGatesList.length + 1) {
            this.showAdminTools(player);
            return;
        }

        const selectedGate = sortedGatesList[response.selection].gate;
        if (selectedGate) {
            this.showGateDetails(player, selectedGate);
        }
    }

    static async showSignGuide(player) {
        const text = "To customize stargates and configure locks, write on the Stargate sign before activating it (or sneak-click to edit an existing sign).\n\n" +
            "§lSign Format:§r\n" +
            " §7Line 1:§r §1-GateName-§r\n" +
            " §7Line 2:§r §8(Leave Blank)§r\n" +
            " §7Line 3:§r §3NetworkName§r\n" +
            " §7Line 4:§r §5Flags§r\n\n" +
            "§lAvailable Flags (Line 4):§r\n" +
            " §e'A'§r - §bAlways-On Gate§r: Portal stays permanently open. Walk through to go to destination.\n" +
            " §e'R'§r - §bRandom Gate§r: Permanently open. Teleports you to a random coordinate location.\n" +
            " §e'H'§r - §bHidden Gate§r: Hidden from dialing/cycling target lists on other gates.\n" +
            " §e'P'§r - §bPrivate Gate§r: Locked to its creator. Only the owner can dial or edit this sign.\n" +
            " §e'B'§r - §bBackwards Gate§r: Rotates momentum so you exit out of the back face of the frame.\n" +
            " §e'Q'§r - §bSilent Gate§r: Disables chat alerts and portal sounds during teleport.\n" +
            " §e'N'§r - §bHide Network§r: Replaces the network name on Line 3 with boundaries to keep it secret.";

        const form = new ActionFormData()
            .title("Sign & Flag Guide")
            .body(text)
            .button("Back")
            .button("Close");

        const response = await form.show(player);
        if (!response || response.canceled) return;

        if (response.selection === 0) {
            this.showGateSelection(player);
        }
    }

    static async showAdminTools(player) {
        const form = new ActionFormData()
            .title("Stargate Admin Tools")
            .body("Utility features for restoring & repairing gate networks.")
            .button("§aRepair Database & Prune Orphans§r\n(Despawns duplicates, cleans old sign tags)")
            .button("§eForce Run Maintenance Now§r\n(Runs integrity checks on all gates)")
            .button("§cFull Database WIPE§r\n(Wipes all saved gates - CAUTION)")
            .button("Back");

        const response = await form.show(player);
        if (!response || response.canceled) return;

        switch (response.selection) {
            case 0: {
                player.sendMessage("§eRunning database repair...");
                const result = GateManager.repairDatabase(player);
                player.sendMessage(result.message);
                break;
            }
            case 1: {
                player.sendMessage("§eForcing gate maintenance check...");
                try {
                    GateManager.runMaintenance();
                    player.sendMessage("§aMaintenance check complete.");
                } catch (e) {
                    player.sendMessage(`§cError during maintenance: ${e}`);
                }
                break;
            }
            case 2: {
                const confirmForm = new ActionFormData()
                    .title("§4Confirm Database WIPE§r")
                    .body("§cWARNING: This will completely wipe all registered stargates and reset the database! This action is irreversible.§r")
                    .button("§cYES, WIPE EVERYTHING§r")
                    .button("NO, Cancel");
                
                const confirmResponse = await confirmForm.show(player);
                if (confirmResponse && !confirmResponse.canceled && confirmResponse.selection === 0) {
                    player.sendMessage("§4Wiping database...");
                    const success = GateManager.resetDatabase();
                    if (success) {
                        player.sendMessage("§aDatabase wiped successfully.");
                    } else {
                        player.sendMessage("§cFailed to wipe database.");
                    }
                } else {
                    player.sendMessage("§eWipe cancelled.§r");
                }
                break;
            }
            case 3:
                this.showGateSelection(player);
                break;
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
