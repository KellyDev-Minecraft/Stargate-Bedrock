import { world, BlockPermutation, system } from "@minecraft/server";
import { GateDefinitions } from "./data/gate_definitions.js";
import { ModalFormData, ActionFormData } from "@minecraft/server-ui";

export class GateManager {
    // --- SIGN BASED CREATION ---
    static checkAndCreateGateFromSign(signBlock, player) {
        // The sign is placed on the frame (usually). 
        // We need to check the block BEHIND the sign (attached block).
        const attachedBlock = this.getAttachedBlock(signBlock);
        if (!attachedBlock) return;

        console.warn(`Checking gate pattern on ${attachedBlock.typeId} attached to sign at ${signBlock.location.x}`);

        for (const gateDef of GateDefinitions) {
            const match = this.matchGatePattern(gateDef, attachedBlock);
            if (match) {
                // Show Setup UI
                this.showSetupUI(match, player, signBlock);
                return;
            }
        }

        // No match found
        player.sendMessage("No valid gate pattern found.");
    }

    // --- SIGN BASED INTERACTION ---
    static handleSignInteraction(signBlock, player) {
        // Find which gate owns this sign
        const gate = this.findGateBySign(signBlock);
        if (gate) {
            this.showDialUI(gate, player);
        }
    }

    static findGateBySign(signBlock) {
        const allGates = this.getAllGatesMap();
        for (const key in allGates) {
            const gate = allGates[key];
            if (gate.signLocation &&
                gate.signLocation.x === signBlock.x &&
                gate.signLocation.y === signBlock.y &&
                gate.signLocation.z === signBlock.z) {
                return gate;
            }
        }
        return null;
    }

    static getAttachedBlock(buttonBlock) {
        // Need to check block states for facing.
        // "facing_direction": 0=down, 1=up, 2=north, 3=south, 4=west, 5=east (Common mappings)
        // Actually "facing_direction" is deprecated or specific. "facing" is string "north", "south", etc.
        const perm = buttonBlock.permutation;
        const facing = perm.getState("facing_direction");

        // Map facing to vector
        // 2=North (z-), 3=South (z+), 4=West (x-), 5=East (x+)
        let dir = { x: 0, y: 0, z: 0 };
        if (facing === 2) dir.z = 1; // If facing north, attached block is to the South (z+)
        else if (facing === 3) dir.z = -1; // If facing south, attached block is to North
        else if (facing === 4) dir.x = 1;
        else if (facing === 5) dir.x = -1;

        return buttonBlock.dimension.getBlock({
            x: buttonBlock.x + dir.x,
            y: buttonBlock.y + dir.y,
            z: buttonBlock.z + dir.z
        });
    }

    static matchGatePattern(gateDef, anchorBlock) {
        // Anchor block corresponds to '-' in the layout.
        // We need to try matching the pattern for every '-' occurrence in the layout.

        const layout = gateDef.layout;
        // Parse layout to find relative coords of '-'
        // Layout is array of strings.
        // Let's assume standard 2D vertical plane.

        // Find all anchor points in layout
        const anchors = [];
        for (let r = 0; r < layout.length; r++) {
            for (let c = 0; c < layout[r].length; c++) {
                if (layout[r][c] === '-') {
                    anchors.push({ r, c });
                }
            }
        }

        // Try both axis (X-aligned and Z-aligned)
        // Axis 1: Gate runs along X axis (constant Z)
        // Axis 2: Gate runs along Z axis (constant X)

        for (const anchor of anchors) {
            // Check Axis X (row changes Y, col changes X)
            if (this.checkMatch(gateDef, anchorBlock, anchor, layout, 'x')) return { gateDef, axis: 'x', anchor, anchorBlock };
            // Check Axis Z (row changes Y, col changes Z)
            if (this.checkMatch(gateDef, anchorBlock, anchor, layout, 'z')) return { gateDef, axis: 'z', anchor, anchorBlock };
        }

        return null;
    }

    static checkMatch(gateDef, worldAnchor, layoutAnchor, layout, axis) {
        // Check every character in layout relative to worldAnchor
        // layoutAnchor {r, c} corresponds to worldAnchor {x,y,z}

        for (let r = 0; r < layout.length; r++) {
            const rowStr = layout[r];
            for (let c = 0; c < rowStr.length; c++) {
                const char = rowStr[c];
                if (char === ' ') continue; // Skip space

                // Calculate relative position
                const dr = layoutAnchor.r - r; // Up/Down from anchor (Row 0 is top usually? Wait. Standard text file: Line 1 is top.)
                // Actually in layout array: index 0 is top line.
                // So r increasing means Y decreasing.

                const dy = (layout.length - 1 - r) - (layout.length - 1 - layoutAnchor.r);
                // Wait, simpler:
                // r_anchor - r  => if r < r_anchor (higher up), dy should be positive?
                // Text:
                // 0:  XX
                // 1: X..X
                // 2: -..-  <-- anchor at r=2
                //
                // block at r=0 is 2 blocks ABOVE block at r=2.
                // So dy = layoutAnchor.r - r

                const dLat = c - layoutAnchor.c; // Lateral difference (along X or Z)

                let targetX = worldAnchor.x;
                let targetY = worldAnchor.y + (layoutAnchor.r - r);
                let targetZ = worldAnchor.z;

                if (axis === 'x') {
                    targetX += dLat;
                } else {
                    targetZ += dLat;
                }

                const block = worldAnchor.dimension.getBlock({ x: targetX, y: targetY, z: targetZ });
                if (!block) return false;

                // Match block type
                if (!this.matchesMaterial(char, block, gateDef)) {
                    // console.warn(`Match failed at rel ${dLat},${dy}: expected ${char}, got ${block.typeId}`);
                    return false;
                }
            }
        }
        return true;
    }

    static matchesMaterial(char, block, gateDef) {
        // 1. Check if char maps to a material in gateDef
        let expectedMat = gateDef.materials[char];

        // Special chars
        if (char === '-') expectedMat = gateDef.materials['-'];
        // In the format, '-' is also defined in materials map as the frame material.

        if (char === '.') {
            // Portal material (open or closed)
            // When building, it should be portal-closed (AIR usually) or existing portal?
            // Usually we build the frame with AIR inside.
            expectedMat = gateDef.config['portal-closed'];
        }

        if (char === '*') {
            // Exit point - usually matches portal-closed (AIR)
            expectedMat = gateDef.config['portal-closed'];
        }

        if (!expectedMat) {
            // Maybe it is a literal material? (Not in this format)
            return false;
        }

        // expectedMat is "minecraft:obsidian" string
        // block.typeId is "minecraft:obsidian"

        // Handle tags (not supported yet locally, but we cleaned them in python)
        // Handle comma lists?

        // Fuzzy match for colored blocks (wool, concrete, etc.)
        const blockId = block.typeId;
        const expectedId = expectedMat.replace('minecraft:', '');

        if (blockId.includes(expectedId)) return true;

        // Special case: if it's the '.' (portal), allow portal-open material too
        if (char === '.' || char === '*') {
            const openMat = gateDef.config['portal-open'];
            if (blockId === openMat || blockId.includes(openMat.replace('minecraft:', ''))) return true;
        }

        // Allow AIR match if we expect AIR
        if (expectedMat === 'minecraft:air' && block.isAir) return true;

        return false;
    }

    static handleGateInteraction(match, player) {
        const gateKey = this.getGateKey(match.anchorBlock);
        const existingGate = this.getGateData(gateKey);

        if (existingGate) {
            this.showDialUI(existingGate, player);
        } else {
            this.showSetupUI(match, player);
        }
    }

    static updateNetworkSigns(network) {
        const allGates = this.getAllGatesMap();
        const networkGates = Object.values(allGates).filter(g => g.network === network);
        const names = networkGates.map(g => g.name);

        for (const gate of networkGates) {
            if (gate.signLocation) {
                this.setSignText(gate.signLocation, gate.name, gate.network, names);
            }
        }
    }

    static setSignText(loc, name, network, targets) {
        const dim = world.getDimension(loc.dim);
        const block = dim.getBlock(loc);
        if (!block) return;

        // Ensure it's a sign
        if (!block.typeId.includes("sign")) {
            block.setType("minecraft:oak_wall_sign");
            // We might need to handle rotation, but for now just place it.
        }

        const sign = block.getComponent("minecraft:sign");
        if (sign) {
            let text = `[${name}]\nNetwork: ${network}\n---\n`;
            text += targets.filter(t => t !== name).slice(0, 2).join("\n");
            sign.setText(text);
        }
    }

    static async showDialUI(activeGate, player) {
        const allGateKeys = this.getAllGates();
        const targets = [];

        for (const key of allGateKeys) {
            if (key === this.getGateKey({ dimension: { id: activeGate.location.dim }, x: activeGate.location.x, y: activeGate.location.y, z: activeGate.location.z })) continue;

            const gate = this.getGateData(key);
            if (gate && gate.network === activeGate.network) {
                targets.push(gate);
            }
        }

        if (targets.length === 0) {
            player.sendMessage(`No other gates found on network '${activeGate.network}'.`);
            return;
        }

        const form = new ActionFormData()
            .title(`Dial from ${activeGate.name}`)
            .body(`Choose a destination on the '${activeGate.network}' network.`);

        for (const target of targets) {
            form.button(`${target.name}\n${target.location.dim.replace('minecraft:', '')}`);
        }

        const response = await form.show(player);
        if (response.canceled) return;

        const targetGate = targets[response.selection];
        this.teleportPlayer(player, targetGate);
    }

    static teleportPlayer(player, target) {
        // Simple teleportation logic
        // Find an exit point. In the layout, '*' was the exit point.
        // We should store the exit point in gateData.

        const loc = target.location;
        const dim = world.getDimension(loc.dim);

        // Use a safe location near the anchor
        player.teleport({
            x: loc.x + (target.axis === 'x' ? 0 : 1), // Offset slightly to avoid being inside the frame
            y: loc.y,
            z: loc.z + (target.axis === 'z' ? 0 : 1)
        }, {
            dimension: dim
        });

        player.sendMessage(`Teleporting to ${target.name}...`);
    }

    static getGateKey(block) {
        return `sg_${block.dimension.id}_${block.x}_${block.y}_${block.z}`;
    }

    static getGateData(key) {
        const allGates = this.getAllGatesMap();
        return allGates[key] || null;
    }

    static saveGateData(key, data) {
        const allGates = this.getAllGatesMap();
        allGates[key] = data;
        world.setDynamicProperty("sg_all_gates", JSON.stringify(allGates));
    }

    static getAllGatesMap() {
        const raw = world.getDynamicProperty("sg_all_gates");
        try {
            return raw ? JSON.parse(raw) : {};
        } catch {
            return {};
        }
    }

    static getAllGates() {
        return Object.keys(this.getAllGatesMap());
    }

    static async showSetupUI(match, player, signBlock) {
        const form = new ModalFormData()
            .title(`Setup ${match.gateDef.id} Stargate`)
            .textField("Name", "Enter gate name (e.g. Base)")
            .textField("Network", "Enter network name", "central");

        const response = await form.show(player);
        if (response.canceled) return;

        const [name, network] = response.formValues;
        if (!name) {
            player.sendMessage("Gate name cannot be empty.");
            return;
        }

        this.createGate(match, player, name, network, signBlock);
    }

    static createGate(match, player, name, network, signBlock) {
        const { gateDef, axis, anchor, anchorBlock } = match;
        const layout = gateDef.layout;
        const portalMat = gateDef.config['portal-open'];
        const portalBlocks = [];

        // Fill the '.' and '*' blocks with portal material
        for (let r = 0; r < layout.length; r++) {
            for (let c = 0; c < layout[r].length; c++) {
                const char = layout[r][c];
                if (char === '.' || char === '*') {
                    const dy = anchor.r - r;
                    const dLat = c - anchor.c;

                    let targetX = anchorBlock.x;
                    let targetY = anchorBlock.y + dy;
                    let targetZ = anchorBlock.z;

                    if (axis === 'x') targetX += dLat;
                    else targetZ += dLat;

                    const block = anchorBlock.dimension.getBlock({ x: targetX, y: targetY, z: targetZ });

                    // Handle nether_portal rotation
                    if (portalMat === "minecraft:nether_portal") {
                        const axisValue = axis === 'x' ? 'x' : 'z';
                        block.setPermutation(BlockPermutation.resolve(portalMat, { "portal_axis": axisValue }));
                    } else {
                        block.setType(portalMat);
                    }

                    portalBlocks.push({ x: targetX, y: targetY, z: targetZ });
                }
            }
        }

        const key = this.getGateKey(anchorBlock);

        // Sign location is passed in explicitly now
        let signLocation = null;
        if (signBlock) {
            signLocation = { x: signBlock.x, y: signBlock.y, z: signBlock.z, dim: signBlock.dimension.id };
        }

        const gateData = {
            id: gateDef.id,
            name,
            network,
            axis,
            location: { x: anchorBlock.x, y: anchorBlock.y, z: anchorBlock.z, dim: anchorBlock.dimension.id },
            portalBlocks,
            signLocation
        };

        this.saveGateData(key, gateData);
        this.updateNetworkSigns(network);

        player.sendMessage(`Stargate '${name}' created on network '${network}'!`);
    }
}
